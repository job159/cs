// WebGL renderer + custom post chain tuned for phones:
//   world + viewmodel in ONE pass into an HDR MSAA target (MSAA is almost free on tile GPUs)
//   -> dual-filter bloom (13-tap down / tent up)  -> composite (exposure, ACES, grading,
//   vignette, damage / flash / chromatic aberration, grain)  -> canvas.
// Dynamic resolution scales the HDR target between quality.minScale and 1 to hold the frame rate.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const QUALITY = {
  low:    { label: '低',   dpr: 1.0, shadows: 0,    msaa: 0, bloomMips: 3, minScale: 0.6, maxLights: 2, decals: 60,  particles: 1200, gore: 1 },
  medium: { label: '中',   dpr: 1.5, shadows: 1024, msaa: 2, bloomMips: 4, minScale: 0.65, maxLights: 4, decals: 120, particles: 2500, gore: 2 },
  high:   { label: '高',   dpr: 2.0, shadows: 2048, msaa: 4, bloomMips: 5, minScale: 0.7, maxLights: 6, decals: 200, particles: 4000, gore: 3 },
  ultra:  { label: '極致', dpr: 2.5, shadows: 4096, msaa: 4, bloomMips: 5, minScale: 0.8, maxLights: 8, decals: 320, particles: 6000, gore: 3 },
};

const VERT = /* glsl */`
uniform vec2 uvScale;
varying vec2 vUv;
void main() { vUv = uv * uvScale; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 13-tap downsample (Jimenez, CoD:AW) with a soft-knee threshold + Karis average on the first level
// (kills fireflies from tiny hot pixels such as muzzle flash sparks).
const DOWN_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 texel;
uniform float first;
uniform vec4 threshold; // x: threshold, y: knee, z: clamp
uniform vec2 uvScale;
varying vec2 vUv;
vec3 tap(vec2 o) {
  vec3 c = texture2D(tSrc, clamp(vUv + o * texel, texel * 0.5, uvScale - texel * 0.5)).rgb;
  return min(c, vec3(threshold.z));
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 karis(vec3 a, vec3 b, vec3 c, vec3 d) {
  float wa = 1.0 / (1.0 + lum(a)), wb = 1.0 / (1.0 + lum(b)), wc = 1.0 / (1.0 + lum(c)), wd = 1.0 / (1.0 + lum(d));
  return (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
}
void main() {
  vec3 a = tap(vec2(-2.0, 2.0)), b = tap(vec2(0.0, 2.0)), c = tap(vec2(2.0, 2.0));
  vec3 d = tap(vec2(-2.0, 0.0)), e = tap(vec2(0.0, 0.0)), f = tap(vec2(2.0, 0.0));
  vec3 g = tap(vec2(-2.0, -2.0)), h = tap(vec2(0.0, -2.0)), i = tap(vec2(2.0, -2.0));
  vec3 j = tap(vec2(-1.0, 1.0)), k = tap(vec2(1.0, 1.0)), l = tap(vec2(-1.0, -1.0)), m = tap(vec2(1.0, -1.0));
  vec3 col;
  if (first > 0.5) {
    col = karis(j, k, l, m) * 0.5 + karis(a, b, d, e) * 0.125 + karis(b, c, e, f) * 0.125
        + karis(d, e, g, h) * 0.125 + karis(e, f, h, i) * 0.125;
    float br = max(col.r, max(col.g, col.b));
    float soft = clamp(br - threshold.x + threshold.y, 0.0, 2.0 * threshold.y);
    soft = soft * soft / (4.0 * threshold.y + 1e-4);
    float contrib = max(soft, br - threshold.x) / max(br, 1e-4);
    col *= contrib;
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  gl_FragColor = vec4(col, 1.0);
}`;

const UP_FRAG = /* glsl */`
uniform sampler2D tSrc;   // lower (smaller) mip, being upsampled
uniform sampler2D tBase;  // current level of the down chain
uniform vec2 texel;       // texel of tSrc
uniform float radius;
uniform float baseWeight;
varying vec2 vUv;
void main() {
  vec2 o = texel * radius;
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += (texture2D(tSrc, vUv + vec2(-o.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x, 0.0)).rgb
      + texture2D(tSrc, vUv + vec2(0.0, -o.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, o.y)).rgb) * 2.0;
  s += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb
     + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb;
  gl_FragColor = vec4(s / 16.0 + texture2D(tBase, vUv).rgb * baseWeight, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 sceneTexel;
uniform float bloomStrength;
uniform float exposure;
uniform float time;
uniform float sharpen;
uniform vec3 lift, gamma, gain;   // ASC-CDL-ish grading in linear space
uniform float saturation, contrast;
uniform vec3 shadowTint, highlightTint;
uniform float vignette;
uniform float damage;      // 0..1 red edge pulse
uniform float lowHealth;   // 0..1 persistent desaturation + heartbeat
uniform vec3 flashColor;   // additive full-screen flash (explosions, buy, boss)
uniform float aberration;
uniform float grain;
uniform float scopeMask;   // 0..1 sniper scope vignette
uniform float uEdge;       // 0..1 element-colour screen border (BORDER, PREMIUM_WEAPONS §1.9 #4), alpha capped at 0.35
uniform vec3 uEdgeColor;   // linear colour
varying vec2 vUv;

vec3 acesFitted(vec3 c) {
  const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c = inM * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return clamp(outM * (a / b), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec3 col;
  float ab = aberration * r2;
  if (ab > 0.0001) {
    col.r = texture2D(tScene, uv - cc * ab).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv + cc * ab).b;
  } else {
    col = texture2D(tScene, uv).rgb;
  }
  if (sharpen > 0.0) { // light unsharp mask, compensates the dynamic-resolution upscale
    vec3 n = texture2D(tScene, uv + vec2(sceneTexel.x, 0.0)).rgb + texture2D(tScene, uv - vec2(sceneTexel.x, 0.0)).rgb
           + texture2D(tScene, uv + vec2(0.0, sceneTexel.y)).rgb + texture2D(tScene, uv - vec2(0.0, sceneTexel.y)).rgb;
    col = max(col + (col - n * 0.25) * sharpen, 0.0);
  }
  col += texture2D(tBloom, uv).rgb * bloomStrength;
  col *= exposure;
  col += flashColor;

  // grading (linear)
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float sh = 1.0 - smoothstep(0.0, 0.35, l), hi = smoothstep(0.35, 1.5, l);
  col *= mix(vec3(1.0), shadowTint, sh) * mix(vec3(1.0), highlightTint, hi);
  col = pow(max(col * gain + lift * (1.0 - col), 0.0), gamma);
  l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float sat = saturation * (1.0 - lowHealth * 0.65);
  col = mix(vec3(l), col, sat);
  col = acesFitted(col);
  col = clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);

  // damage / low health
  float edge = smoothstep(0.08, 0.42, r2);
  float beat = lowHealth * (0.55 + 0.45 * pow(abs(sin(time * 3.4)), 6.0));
  col = mix(col, vec3(0.55, 0.0, 0.0), clamp(edge * (damage * 0.85 + beat * 0.55), 0.0, 0.9));
  col *= 1.0 - vignette * smoothstep(0.12, 0.62, r2);
  if (scopeMask > 0.0) {
    float d = length(cc * vec2(sceneTexel.y / sceneTexel.x, 1.0));
    float ring = smoothstep(0.36, 0.40, d);
    col = mix(col, vec3(0.0), ring * scopeMask);
  }
  if (uEdge > 0.0) {
    // buff border: a rounded frame that fades in from 45 % of the screen radius; mixed after grading so
    // the alpha is what the player sees (cap 0.35, the ready reminder uses ~0.08)
    vec2 e = abs(cc) * 2.0;
    float fr = pow(pow(e.x, 4.0) + pow(e.y, 4.0), 0.25);
    float a = min(uEdge, 0.35) * smoothstep(0.45, 1.05, fr) * (0.85 + 0.15 * sin(time * 2.4 + fr * 6.0));
    col = mix(col, uEdgeColor, a);
  }
  col = toSRGB(col);
  col += (hash(uv * 1000.0 + fract(time) * 37.0) - 0.5) * grain;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, depth: true, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    this.gl.toneMapping = THREE.NoToneMapping; // done in the composite
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace; // composite converts to sRGB itself
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.shadowMap.autoUpdate = true;
    this.gl.setClearColor(0x000000, 1);
    this.gl.info.autoReset = false;
    const ext = this.gl.extensions;
    this.hdr = !!(ext.get('EXT_color_buffer_float') || ext.get('EXT_color_buffer_half_float'));
    this.width = 1;
    this.height = 1;
    this.scale = 1;          // dynamic resolution scale of the HDR target
    this.targetFrame = 1 / 58;
    this.frameTimes = [];
    this.dynCooldown = 1;
    this.rt = null;
    this.mips = [];
    this.ups = [];

    this.uvScale = { value: new THREE.Vector2(1, 1) };
    this.downMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: DOWN_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, first: { value: 0 },
        threshold: { value: new THREE.Vector4(1.0, 0.6, 48, 0) }, uvScale: this.uvScale },
    });
    this.upMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: UP_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, tBase: { value: null }, texel: { value: new THREE.Vector2() },
        radius: { value: 1.0 }, baseWeight: { value: 1.0 }, uvScale: this.uvScale },
    });
    this.post = {
      bloomStrength: 0.085, exposure: 1.0, sharpen: 0.0,
      lift: new THREE.Vector3(0.0, 0.0, 0.0), gamma: new THREE.Vector3(1, 1, 1), gain: new THREE.Vector3(1, 1, 1),
      saturation: 1.0, contrast: 1.04,
      shadowTint: new THREE.Vector3(1, 1, 1), highlightTint: new THREE.Vector3(1, 1, 1),
      vignette: 0.35, damage: 0, lowHealth: 0, flashColor: new THREE.Vector3(), aberration: 0, grain: 0.03, scopeMask: 0,
      edge: 0, edgeColor: new THREE.Color(0, 0, 0),   // BORDER: alpha 0..0.35 + linear colour (setEdge)
    };
    this.edgeEnabled = true;                            // settings switch (§1.14 #6)
    const u = {};
    for (const [k, v] of Object.entries(this.post)) u[k] = { value: v };
    u.tScene = { value: null }; u.tBloom = { value: null }; u.time = { value: 0 }; u.sceneTexel = { value: new THREE.Vector2() };
    u.uEdge = { value: 0 }; u.uEdgeColor = { value: new THREE.Color() };
    u.uvScale = this.uvScale;
    this.compMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COMPOSITE_FRAG, uniforms: u, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.downMat);
    this.setQuality('high');
  }

  /** BORDER: element-colour screen frame. color: hex / THREE.Color (sRGB), alpha 0..0.35 (0 = off). */
  setEdge(color, alpha = 0.25) {
    if (color !== null && color !== undefined) this.post.edgeColor.set(color);
    this.post.edge = Math.max(0, Math.min(0.35, alpha));
  }

  setQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    this.qualityName = name in QUALITY ? name : 'high';
    this.q = q;
    this.gl.shadowMap.enabled = q.shadows > 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    this.scale = Math.max(this.scale, q.minScale);
    this.rebuildTargets = true;
    this.resize(this.width, this.height);
  }

  _buildTargets() {
    this.rebuildTargets = false;
    this.rt?.dispose();
    for (const m of this.mips) m.dispose();
    for (const m of this.ups) m.dispose();
    const w = Math.max(1, Math.round(this.width * this.dpr)), h = Math.max(1, Math.round(this.height * this.dpr));
    this.fullW = w; this.fullH = h;
    const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.rt = new THREE.WebGLRenderTarget(w, h, { type, samples: this.q.msaa, depthBuffer: true, stencilBuffer: false });
    this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    this.mips = []; this.ups = [];
    let mw = w, mh = h;
    for (let i = 0; i < this.q.bloomMips; i++) {
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
      const t = new THREE.WebGLRenderTarget(mw, mh, { type, depthBuffer: false });
      t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter;
      t.texture.wrapS = t.texture.wrapT = THREE.ClampToEdgeWrapping;
      this.mips.push(t);
      if (i < this.q.bloomMips - 1) {
        const u = new THREE.WebGLRenderTarget(mw, mh, { type, depthBuffer: false });
        u.texture.minFilter = u.texture.magFilter = THREE.LinearFilter;
        this.ups.push(u);
      }
    }
    this._applyScale();
  }

  // Dynamic resolution only shrinks the viewport inside the targets (no reallocation).
  _applyScale() {
    const s = this.scale;
    this.vw = Math.max(1, Math.round(this.fullW * s));
    this.vh = Math.max(1, Math.round(this.fullH * s));
    this.rt.viewport.set(0, 0, this.vw, this.vh);
    this.rt.scissor.set(0, 0, this.vw, this.vh);
    this.rt.scissorTest = s < 0.999;
    let mw = this.vw, mh = this.vh;
    for (let i = 0; i < this.mips.length; i++) {
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
      this.mips[i].viewport.set(0, 0, mw, mh);
      if (this.ups[i]) this.ups[i].viewport.set(0, 0, mw, mh);
    }
  }

  resize(w, h) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(this.width, this.height, false);
    this._buildTargets();
  }

  // Called once per frame with the real frame time; adapts this.scale.
  adapt(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 40) this.frameTimes.shift();
    this.dynCooldown -= dt;
    if (this.dynCooldown > 0 || this.frameTimes.length < 30 || this.fixedScale) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    let s = this.scale;
    if (p75 > this.targetFrame * 1.12) s = Math.max(this.q.minScale, s - 0.05);
    else if (p75 < this.targetFrame * 0.8) s = Math.min(1, s + 0.025);
    if (s !== this.scale) { this.scale = s; this._applyScale(); this.dynCooldown = 0.6; }
  }

  /** Renders world (which may contain the depth-hacked viewmodel) and post-processes to the canvas. */
  render(scene, camera, time) {
    const gl = this.gl;
    gl.info.reset();
    gl.setRenderTarget(this.rt);
    gl.clear(true, true, false);
    gl.render(scene, camera);

    // bloom down chain; every pass samples only the used (lower-left) part of its source
    this.uvScale.value.set(this.vw / this.fullW, this.vh / this.fullH);
    let src = this.rt.texture, srcW = this.fullW, srcH = this.fullH;
    this.quad.material = this.downMat;
    for (let i = 0; i < this.mips.length; i++) {
      const u = this.downMat.uniforms;
      u.tSrc.value = src;
      u.texel.value.set(1 / srcW, 1 / srcH);
      u.first.value = i === 0 ? 1 : 0;
      gl.setRenderTarget(this.mips[i]);
      this.quad.render(gl);
      src = this.mips[i].texture; srcW = this.mips[i].width; srcH = this.mips[i].height;
    }
    // up chain
    this.quad.material = this.upMat;
    let low = this.mips[this.mips.length - 1];
    for (let i = this.mips.length - 2; i >= 0; i--) {
      const u = this.upMat.uniforms;
      u.tSrc.value = low.texture;
      u.tBase.value = this.mips[i].texture;
      u.texel.value.set(1 / low.width, 1 / low.height);
      gl.setRenderTarget(this.ups[i]);
      this.quad.render(gl);
      low = this.ups[i];
    }

    // composite. The scaled viewport lives in the lower-left corner of every target.
    const c = this.compMat.uniforms;
    for (const k of Object.keys(this.post)) if (c[k]) c[k].value = this.post[k];
    c.uEdge.value = this.edgeEnabled ? this.post.edge : 0;
    c.uEdgeColor.value.copy(this.post.edgeColor);
    c.tScene.value = this.rt.texture;
    c.tBloom.value = low.texture;
    c.time.value = time;
    c.sceneTexel.value.set(1 / this.fullW, 1 / this.fullH);
    c.sharpen.value = this.post.sharpen + (1 - this.scale) * 0.6;
    this.quad.material = this.compMat;
    gl.setRenderTarget(null);
    this.quad.render(gl);
  }
}
