// WebGL renderer + custom post chain tuned for phones:
//   world + viewmodel in ONE pass into an HDR MSAA target (MSAA is almost free on tile GPUs)
//   -> dual-filter bloom (13-tap down / tent up)  -> composite (exposure, ACES, grading,
//   vignette, damage / flash / chromatic aberration, grain)  -> canvas.
// Dynamic resolution scales the HDR target between quality.minScale and 1 to hold the frame rate.
// Cost control (profiled on an Intel iGPU with timer queries): opaque draws front to back in distance octaves, point
// lights skip their BRDF out of range, the sun shadow keeps the map's static casters in a cache (setStaticShadow) and
// renders the next follow step's ahead of time in slices (prefetchStaticShadow), shadow passes write depth only, only
// the MSAA colour is resolved, and warmup() compiles the shadow pass's programs and uploads everything at load.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// colour-grade uniforms a map may set (Renderer.setGrade)
const GRADE_KEYS = ['saturation', 'contrast', 'shadowTint', 'highlightTint', 'lift', 'gamma', 'gain'];

// Tiers: low / medium are the phone tiers; high is the desktop default and ultra what the desktop benchmark
// (ui/settings.js calibrateQuality) picks on strong GPUs, so those two carry the bigger effect / decal budgets.
// particles also scales how many particles each effect spawns (fx.k = particles / 4000, capped at 1.5).
export const QUALITY = {
  low:    { label: '低',   dpr: 1.0, shadows: 0,    msaa: 0, bloomMips: 3, minScale: 0.6, maxLights: 2, decals: 60,  particles: 1200, gore: 1 },
  medium: { label: '中',   dpr: 1.5, shadows: 1024, msaa: 2, bloomMips: 4, minScale: 0.65, maxLights: 4, decals: 120, particles: 2500, gore: 2 },
  high:   { label: '高',   dpr: 2.0, shadows: 2048, msaa: 4, bloomMips: 5, minScale: 0.7, maxLights: 6, decals: 260, particles: 5000, gore: 3 },
  ultra:  { label: '極致', dpr: 2.5, shadows: 4096, msaa: 4, bloomMips: 5, minScale: 0.8, maxLights: 8, decals: 420, particles: 8000, gore: 3 },
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

// Point lights: the BRDF of a light only runs where the light reaches. getPointLightInfo already zeroes the colour
// beyond the light's range and for lights at intensity 0 (the idle slots of the map and FX light pools, which always
// exist so the light count -- and with it every program -- never changes), so skipping RE_Direct there changes no
// pixel. The branch is coherent (a light is in or out of range for whole screen regions). With the baked-sun skip of
// the lightmapped materials (world/mapPackage.js) the map's main pass went from 17.4 to 13.7 ms at high on an iGPU.
THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(
  /(getPointLightInfo\( pointLight, geometryPosition, directLight \);[\s\S]*?)RE_Direct\(/,
  '$1if ( directLight.visible ) RE_Direct(');

// Opaque draw order: front to back in distance octaves (three's default sorts by material id first), so the nearest
// surfaces fill the depth buffer before what they hide is shaded -- the viewmodel (always nearest) hides the street
// behind the gun, zombies and props the walls behind them (-1.4 ms GPU at high on an iGPU). Inside an octave program,
// then material: consecutive draws of one program skip the light uniforms, of one material all uniform uploads, which
// a strict depth order would repeat on nearly every draw (render() took ~2x the CPU time that way).
// z is NDC depth; 1 / (1 - z) grows linearly with the distance for any near plane.
const zOctave = (z) => Math.floor(Math.log2(1 / Math.max(1e-7, 1 - z)));
const _m4 = new THREE.Matrix4();

/** GPU bytes of a texture (estimate for the upload budget log): 4 bytes per texel, + 1/3 with mipmaps. */
function texBytes(t) {
  const im = t.image;
  const w = im?.width || 0, h = im?.height || 0;
  if (t.isCompressedTexture) return (t.mipmaps || []).reduce((a, m) => a + (m.data?.byteLength || 0), 0);
  const bpp = t.type === THREE.FloatType ? 16 : t.type === THREE.HalfFloatType ? 8 : 4;
  return w * h * bpp * (t.isCubeTexture ? 6 : 1) * (t.generateMipmaps && t.minFilter !== THREE.LinearFilter && t.minFilter !== THREE.NearestFilter ? 4 / 3 : 1);
}
function makeOpaqueSort(props) {
  const prog = (m) => props.get(m).currentProgram?.id ?? 0;
  return (a, b) => a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || zOctave(a.z) - zOctave(b.z)
    || prog(a.material) - prog(b.material) || a.material.id - b.material.id || a.z - b.z || a.id - b.id;
}

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
    this.opaqueSort = makeOpaqueSort(this.gl.properties);
    this.gl.setOpaqueSort(this.opaqueSort);
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
    // per-map colour grade (map.json `grade`, applied by World.load via setGrade); these are the neutral values
    this._gradeDefaults = { exposure: 1.0 };
    for (const k of GRADE_KEYS) { const v = this.post[k]; this._gradeDefaults[k] = v?.clone ? v.clone() : v; }
    const u = {};
    for (const [k, v] of Object.entries(this.post)) u[k] = { value: v };
    u.tScene = { value: null }; u.tBloom = { value: null }; u.time = { value: 0 }; u.sceneTexel = { value: new THREE.Vector2() };
    u.uEdge = { value: 0 }; u.uEdgeColor = { value: new THREE.Color() };
    u.uvScale = this.uvScale;
    this.compMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COMPOSITE_FRAG, uniforms: u, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.downMat);
    this.shadowCache = null;
    this._wrapShadowMap();
    this.setQuality('high');
  }

  /**
   * Cached static sun shadow. The map's static casters only change when the sun's shadow camera moves (the map snaps
   * it to a coarse grid around the player, world/mapPackage.js), so their depth is rendered once into a cache and
   * copied into the shadow map each frame (one depth blit); only dynamic casters (zombies, players, props) are drawn
   * on top every frame. Same shadow map, same filtering: the ~4.5 ms sun pass at high on an iGPU becomes a depth blit
   * plus the zombies / players (0 when nothing dynamic is in range).
   * { light, root: Object3D holding the static casters, casters: Mesh[] } or null.
   */
  setStaticShadow(cfg) {
    this.shadowCache?.rt?.dispose();
    this.shadowCache?.next?.rt?.dispose();
    this.shadowCache = cfg ? { ...cfg, rt: null, key: new Float64Array(13).fill(NaN), now: new Float64Array(13), one: [cfg.light], dyn: true,
      next: null, ahead: false, aheadPos: new THREE.Vector3(), aheadTarget: new THREE.Vector3() } : null;
  }

  /**
   * The sun shadow's next follow step (the map's prediction of the cell the player is about to enter: light and
   * target positions exactly as the map will set them), or null. At high / ultra the static casters' depth for that
   * cell is rendered into a spare cache in slices over the next frames, and the step itself only swaps the caches:
   * re-rendering a 4096 map in one frame doubled that frame's GPU time (frame pacing judder while running).
   */
  prefetchStaticShadow(pos, target) {
    const c = this.shadowCache;
    if (!c) return;
    c.ahead = !!pos;
    if (pos) { c.aheadPos.copy(pos); c.aheadTarget.copy(target); }
  }

  /**
   * Load-time warm-up of what compileAsync leaves to the first frame that needs it (each a hitch mid-match):
   *  - the shadow pass's depth materials of skinned, alpha-tested or dithered casters (the zombies only exist once a
   *    wave spawns): the hidden '*-warmup' groups (zombie manager, premium presets) cast shadows for this frame;
   *  - the GPU upload of every mesh's buffers and of the textures in view (three uploads them the first time a mesh
   *    comes into view: turning around for the first time uploaded a few textures and dozens of buffers per frame).
   *    Textures only used out of view are uploaded in idle time between the next frames (_idleUploads: the match's
   *    warm-up / buy time), those of the hidden warm-up groups not at all (compile only: a premium preset of a
   *    weapon nobody owns never uploads; the zombie manager uploads its models' own). After a menu backdrop of the
   *    same map almost everything is resident already.
   *  - each program's first use (uniform setup, the GPU process' per-mesh shader variants).
   * Throwaway frames into a small target with nothing culled: one with one trivial material and no shadow pass (the
   * light state), one with the trivial material (only depth variants and the sky's material compile there; the real
   * programs are compileAsync's job), then the real materials (a few warm-up models per frame). Async: it yields
   * between those frames.
   */
  async warmup(scene, camera) {
    const gl = this.gl, shown = new Set(), cast = [], culled = new Set(), seen = new Set(), later = [], parts = [];
    const t = performance.now(), n = gl.info.programs?.length ?? 0;
    let now = 0, mb = 0;
    const frustum = new THREE.Frustum().setFromProjectionMatrix(_m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const tex = (v, inView) => {
      if (!v?.isTexture || v.isRenderTargetTexture || seen.has(v)) return;
      seen.add(v);
      if (gl.properties.get(v).__webglTexture) return;   // already resident (the menu backdrop drew it)
      if (!inView) { later.push(v); return; }
      try { gl.initTexture(v); now++; mb += texBytes(v) / 1048576; } catch { /* uploaded on first use instead */ }
    };
    scene.updateMatrixWorld();
    scene.traverse((o) => {
      if (/warmup/.test(o.name) && !o.visible) { o.visible = true; shown.add(o); }
      if ((o.isMesh || o.isPoints || o.isLine) && o.frustumCulled) { o.frustumCulled = false; culled.add(o); }
    });
    const inGroup = (o) => { for (let p = o; p; p = p.parent) if (shown.has(p)) return true; return false; };
    scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      if (!mats.length || inGroup(o)) return;
      let inView = true;
      // (skinned meshes count as in view: their bounds would be skinned on the CPU, and they are the players / bots)
      try { inView = !culled.has(o) || !o.geometry || o.isSkinnedMesh || frustum.intersectsObject(o); } catch { /* no bounds: upload now */ }
      for (const m of mats) {
        for (const v of Object.values(m)) tex(v, inView);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) tex(u?.value, inView);
        if (m.userData?.lmUniforms) for (const u of Object.values(m.userData.lmUniforms)) tex(u?.value, inView);
      }
    });
    if (gl.shadowMap.enabled) for (const w of shown) w.traverse((o) => { if (o.isMesh && !o.castShadow) { o.castShadow = true; cast.push(o); } });
    const rt = new THREE.WebGLRenderTarget(16, 16, { type: this.rt.texture.type });
    const prev = gl.getRenderTarget(), over = scene.overrideMaterial;
    this._warmMat ||= new THREE.MeshBasicMaterial();
    const shadowPass = gl.shadowMap.render;
    try {
      scene.overrideMaterial = this._warmMat;
      gl.setRenderTarget(rt);
      // three runs a frame's shadow pass before it sets up that frame's lights, and every program's key holds the
      // light counts: a first frame without the shadow pass brings the light state up to date (the match's FX light
      // pool came after the menu backdrop's last frame; a fresh scene has none), so the depth variants below are the
      // ones the match uses (stale ones were compiled again on the first match frame: a 0.5-1 s stall)
      gl.shadowMap.render = () => {};
      try { gl.render(scene, camera); } finally { gl.shadowMap.render = shadowPass; }
      // the static casters' depth variants too (re-rendered whatever the cache holds). three shares a depth material
      // between casters and re-picks its program only when the material's version changes (not on new light counts,
      // its caster's map or skinning): bumped before every depth draw here, each caster's own variant with the match's
      // lights is compiled and first used now, not on whichever later frame bumps it
      this.shadowCache?.key.fill(NaN);
      const draw = gl.renderBufferDirect;
      gl.renderBufferDirect = function (cam, sc, geo, mat, obj, grp) {
        if (mat?.isMeshDepthMaterial || mat?.isMeshDistanceMaterial) mat.needsUpdate = true;
        return draw.call(this, cam, sc, geo, mat, obj, grp);
      };
      try { gl.render(scene, camera); } finally { gl.renderBufferDirect = draw; }
      // and once with the real materials: each program's first use (three reads its uniforms and info log, a sync
      // round trip to the GPU process; ANGLE / D3D11 builds the vertex shader for the mesh's attribute formats, ~65 ms
      // per program on an iGPU) happens here, not when round 1 first shows a zombie type (0.25-0.4 s frames). Only the
      // warm-up groups that opt in (userData.firstUse: the zombies, teammates) besides the scene itself: a premium
      // preset of a weapon nobody owns yet stays compile-only
      // preset of a weapon nobody owns yet stays compile-only. A few models per frame, yielding between them: one
      // block of seconds froze the loading bar and starved the co-op heartbeats
      for (const o of shown) if (!o.userData.firstUse) o.visible = false;
      scene.overrideMaterial = over;
      for (const o of shown) if (o.userData.firstUse) for (const c of o.children) if (c.visible) { c.visible = false; parts.push(c); }
      for (let i = 0; i === 0 || i < parts.length; i += 3) {
        const chunk = parts.slice(i, i + 3);
        for (const c of chunk) c.visible = true;
        gl.setRenderTarget(rt);
        gl.render(scene, camera);
        for (const c of chunk) c.visible = false;
        if (i + 3 < parts.length) await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      scene.overrideMaterial = over;
      gl.setRenderTarget(prev);
      rt.dispose();
      for (const c of parts) c.visible = true;
      for (const o of culled) o.frustumCulled = true;
      for (const o of cast) o.castShadow = false;
      for (const o of shown) o.visible = false;
    }
    this._idleUploads(later);
    console.info(`[renderer] warm-up: ${(gl.info.programs?.length ?? 0) - n} programs, ${now} textures uploaded (~${Math.round(mb)} MB), ${later.length} left for idle time, in ${((performance.now() - t) / 1000).toFixed(2)} s`);
  }

  /**
   * Uploads textures one at a time in the browser's idle time between frames (requestIdleCallback; none while the
   * frame budget is used up: three then uploads a texture the first time it is drawn, as without a warm-up). A
   * texture disposed meanwhile (the game ended) is dropped.
   */
  _idleUploads(list) {
    const q = this._upQueue ||= new Set();
    for (const v of list) {
      if (q.has(v)) continue;
      q.add(v);
      v.addEventListener('dispose', function drop() { q.delete(v); v.removeEventListener('dispose', drop); });
    }
    const ric = window.requestIdleCallback;
    if (!q.size || this._upBusy || !ric) return;
    this._upBusy = true;
    let k = 0, mb = 0;
    const t0 = performance.now();
    const step = (dl) => {
      // one per callback (a 1k texture is a few ms to a few tens of ms): the deadline is re-checked between frames
      if (dl.timeRemaining() > 6) {
        for (const v of q) {
          q.delete(v);
          if (this.gl.properties.get(v).__webglTexture) continue;
          try { this.gl.initTexture(v); k++; mb += texBytes(v) / 1048576; } catch { /* first use then */ }
          break;
        }
      }
      if (q.size) ric(step);
      else {
        this._upBusy = false;
        if (k) console.info(`[renderer] idle uploads: ${k} textures (~${Math.round(mb)} MB) in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
      }
    };
    ric(step);
  }

  _wrapShadowMap() {
    const gl = this.gl, sm = gl.shadowMap, render = sm.render;
    const noClear = () => {};
    // The depth-texture shadow maps (PCF) are sampled through their depth texture only: colour writes are masked in
    // the shadow pass (three still clears and writes an RGBA8 colour attachment per texel: at 4096 that was 11 of the
    // 16 ms of a full static render on an iGPU), and the targets get a one-channel colour attachment.
    const depthOnly = (fn) => {
      if (sm.type === THREE.VSMShadowMap) return fn();
      const cb = gl.state.buffers.color;
      cb.setMask(false);
      cb.setLocked(true);
      try { return fn(); } finally { cb.setLocked(false); cb.setMask(true); }
    };
    // three's own PCF shadow target (WebGLShadowMap), but RedFormat colour: 12 MB less at 2048, 48 MB at 4096
    const ensureMap = (light) => {
      const s = light.shadow;
      if (!s || s.map || !light.castShadow || sm.type !== THREE.PCFShadowMap || light.isPointLight) return;
      const w = s.mapSize.x, h = s.mapSize.y;
      s.map = new THREE.WebGLRenderTarget(w, h, { format: THREE.RedFormat });
      const d = s.map.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
      d.name = light.name + '.shadowMap';
      d.format = THREE.DepthFormat;
      d.compareFunction = gl.state.buffers.depth.getReversed() ? THREE.GreaterEqualCompare : THREE.LessEqualCompare;
      d.minFilter = d.magFilter = THREE.LinearFilter;
      s.camera.updateProjectionMatrix();
    };
    const cacheTarget = (size) => {
      // (only its depth is used; three always attaches a colour texture: one channel keeps it small)
      const rt = new THREE.WebGLRenderTarget(size, size, { format: THREE.RedFormat, depthBuffer: true, depthTexture: new THREE.DepthTexture(size, size, THREE.UnsignedIntType) });
      rt.depthTexture.format = THREE.DepthFormat;
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(rt);   // creates its framebuffer
      gl.setRenderTarget(prev);
      return rt;
    };
    // what the static depth depends on: light + target position, map size, shadow camera box
    const keyOf = (light, v) => {
      const e = light.matrixWorld.elements, t = light.target.matrixWorld.elements, sc = light.shadow.camera;
      v[0] = e[12]; v[1] = e[13]; v[2] = e[14]; v[3] = t[12]; v[4] = t[13]; v[5] = t[14];
      v[6] = light.shadow.mapSize.x; v[7] = sc.left; v[8] = sc.right; v[9] = sc.top; v[10] = sc.bottom; v[11] = sc.near; v[12] = sc.far;
    };
    const same = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    const savePos = new THREE.Vector3(), saveTarget = new THREE.Vector3();
    // Prefetch: one slice of the static casters (balanced by triangles) per frame into the spare cache, rendered with
    // the light moved to the predicted cell (prefetchStaticShadow); next.done once every slice is in.
    const prefetch = (c, light, camera, size) => {
      const n = c.next ||= { rt: null, key: new Float64Array(13).fill(NaN), at: new Float64Array(6).fill(NaN), part: 0, done: false };
      const P = c.aheadPos, T = c.aheadTarget, at = n.at;
      if (at[0] !== P.x || at[1] !== P.y || at[2] !== P.z || at[3] !== T.x || at[4] !== T.y || at[5] !== T.z) {
        at[0] = P.x; at[1] = P.y; at[2] = P.z; at[3] = T.x; at[4] = T.y; at[5] = T.z;
        n.part = 0; n.done = false;
      }
      if (n.done) return;
      if (!n.rt || n.rt.width !== size) { n.rt?.dispose(); n.rt = cacheTarget(size); }
      const k = size >= 4096 ? 4 : 2;
      if (c.slices?.length !== k) {
        // greedy: biggest caster first into the lightest slice
        const tri = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position?.count || 0) / 3;
        const load = new Array(k).fill(0);
        c.slices = Array.from({ length: k }, () => new Set());
        for (const m of c.casters.slice().sort((a, b) => tri(b) - tri(a))) { const i = load.indexOf(Math.min(...load)); c.slices[i].add(m); load[i] += tri(m); }
      }
      const shadow = light.shadow, live = shadow.map, slice = c.slices[n.part];
      savePos.copy(light.position); saveTarget.copy(light.target.position);
      light.position.copy(P); light.target.position.copy(T);
      light.updateMatrixWorld(); light.target.updateMatrixWorld();
      if (n.part === 0) keyOf(light, n.key);
      for (const m of c.casters) m.castShadow = slice.has(m);
      const clear = gl.clear;
      if (n.part > 0) gl.clear = noClear;
      shadow.map = n.rt;
      try { depthOnly(() => render.call(sm, c.one, c.root, camera)); } finally {
        shadow.map = live;
        gl.clear = clear;
        for (const m of c.casters) m.castShadow = true;
        light.position.copy(savePos); light.target.position.copy(saveTarget);
        light.updateMatrixWorld(); light.target.updateMatrixWorld();
      }
      if (++n.part >= k) n.done = true;
    };
    sm.render = (lights, scene, camera) => {
      for (const l of lights) ensureMap(l);
      const c = this.shadowCache, light = c?.light;
      if (!c || !sm.enabled || !light.castShadow || !lights.includes(light) || !light.parent) return depthOnly(() => render.call(sm, lights, scene, camera));
      const shadow = light.shadow;
      light.updateMatrixWorld();
      const k = c.key, v = c.now, size = shadow.mapSize.x;
      keyOf(light, v);
      const stale = !same(k, v);
      k.set(v);
      const n = c.next;
      if (stale && n?.done && same(n.key, v) && n.rt.width === size && c.rt?.width === size && shadow.map?.width === size) {
        // the step was prefetched: the spare becomes the cache (and the old cache the next spare)
        const rt = c.rt;
        c.rt = n.rt; n.rt = rt; n.done = false; n.key.fill(NaN); n.at.fill(NaN);
        gl.state.setScissorTest(false);
        gl.copyTextureToTexture(c.rt.depthTexture, shadow.map.depthTexture);
        c.swaps = (c.swaps || 0) + 1;
      } else if (stale || !shadow.map || !c.rt || c.rt.width !== size) {
        // static casters only, into the shadow map (three clears it and sets it up), then kept in the cache
        depthOnly(() => render.call(sm, c.one, c.root, camera));
        if (!c.rt || c.rt.width !== size) { c.rt?.dispose(); c.rt = cacheTarget(size); }
        gl.state.setScissorTest(false);
        gl.copyTextureToTexture(shadow.map.depthTexture, c.rt.depthTexture);
        c.renders = (c.renders || 0) + 1;
      } else if (c.dyn) {
        // last frame's dynamic casters are in the map: back to the static depth
        gl.state.setScissorTest(false);
        gl.copyTextureToTexture(c.rt.depthTexture, shadow.map.depthTexture);
      }
      // the next step's static depth, a slice per frame (high / ultra; not in a frame that just rendered or swapped)
      if (c.ahead && size >= 2048 && !stale) prefetch(c, light, camera, size);
      // dynamic casters on top (static ones off, no clear); this also leaves the shadow matrices on the live light
      for (const m of c.casters) m.castShadow = false;
      const clear = gl.clear;
      gl.clear = noClear;
      const calls = gl.info.render.calls;
      try { depthOnly(() => render.call(sm, c.one, scene, camera)); } finally {
        gl.clear = clear;
        for (const m of c.casters) m.castShadow = true;
      }
      c.dyn = gl.info.render.calls > calls;   // drawn into the map: the next frame starts from the cache again
      // any other shadow-casting light renders as usual
      if (lights.length > 1) depthOnly(() => render.call(sm, lights.filter((l) => l !== light), scene, camera));
    };
  }

  /**
   * Map colour grade: { saturation, contrast, shadowTint, highlightTint, lift, gamma, gain } (tints / CDL vectors as
   * [r, g, b] linear multipliers or '#rrggbb'), plus the map's exposure. Keys left out (or grade = null) go back to
   * the neutral defaults, so every map load starts from a clean grade. Overlay effects add deltas on top.
   */
  setGrade(grade, exposure = 1) {
    const g = grade && typeof grade === 'object' ? grade : {};
    const D = this._gradeDefaults;
    for (const k of GRADE_KEYS) {
      const v = g[k] ?? D[k];
      if (this.post[k]?.isVector3) {
        if (typeof v === 'string') { const c = new THREE.Color(v); this.post[k].set(c.r, c.g, c.b); }
        else if (Array.isArray(v)) this.post[k].set(v[0], v[1], v[2]);
        else if (typeof v === 'number') this.post[k].setScalar(v);
        else this.post[k].copy(v);
      } else if (typeof v === 'number') this.post[k] = v;
    }
    this.post.exposure = exposure ?? D.exposure;
  }

  /** BORDER: element-colour screen frame. color: hex / THREE.Color (sRGB), alpha 0..0.35 (0 = off). */
  setEdge(color, alpha = 0.25) {
    if (color !== null && color !== undefined) this.post.edgeColor.set(color);
    this.post.edge = Math.max(0, Math.min(0.35, alpha));
  }

  setQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    if (this.q && this.q !== q) { this.gameScale = undefined; this.dynCeil = this.dynFloor = null; } // what the old tier learned no longer applies
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
    // only the colour is resolved out of the MSAA buffers: nothing reads the scene depth afterwards, and resolving a
    // multisampled depth buffer is a shader pass on D3D11 (ANGLE), ~3-4 ms per frame at 1600x900 on an iGPU
    this.rt = new THREE.WebGLRenderTarget(w, h, { type, samples: this.q.msaa, depthBuffer: true, stencilBuffer: false, resolveDepthBuffer: false, resolveStencilBuffer: false });
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

  /** Menus: pins the HDR scale (cheap backdrop) and remembers the in-game one for unpinScale(). */
  pinScale(s) {
    if (!this.fixedScale) { this.gameScale = this.scale; this.fixedScale = true; }
    this.scale = Math.max(this.q.minScale, Math.min(1, s));
    this._applyScale();
  }

  /** Match start: back to the last in-game scale (full on the first match), adaptive again after a short grace. */
  unpinScale() {
    if (this.fixedScale) { this.fixedScale = false; this.scale = Math.max(this.q.minScale, Math.min(1, this.gameScale ?? 1)); }
    this._applyScale();
    this.frameTimes.length = 0;
    this.dynCooldown = 1;
    this.dynProbe = null;
    this.dynStep = null;
    this.dynUseless = 0;
  }

  // Called once per frame with the real frame time; adapts this.scale. Every decision looks at >= 30 frames rendered
  // entirely at the current scale (the window restarts on each change).
  //  - Slow frames step the scale down. A step that does not make frames >= 8% faster means the frame is bound by the CPU /
  //    driver (draw calls, game logic), not by pixels: after two such steps in a row both are undone and that scale is
  //    held for a while (30 s, doubling up to 2 min) instead of blurring the picture for nothing.
  //  - Frame time alone cannot show headroom on a vsync-capped display (a 60 Hz phone never reports less than 16.7 ms),
  //    so a scale lowered by one heavy moment would stay low for the rest of the match. Once frames sit steadily on the
  //    refresh interval the scale probes upward in small steps; a probe that makes frames miss vsync is undone and that
  //    scale is skipped for a while (15 s, doubling on each failed probe up to 2 min).
  adapt(dt) {
    const ft = this.frameTimes;
    ft.push(dt);
    if (ft.length > 40) ft.shift();
    this.dynCooldown -= dt;
    this.dynClock = (this.dynClock || 0) + dt;
    if (this.dynCooldown > 0 || ft.length < 30 || this.fixedScale) return;
    const sorted = this._ftSorted || (this._ftSorted = []);   // (no per-frame allocation)
    sorted.length = 0;
    for (const v of ft) sorted.push(v);
    sorted.sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const mean = ft.reduce((a, b) => a + b, 0) / ft.length;
    const vsync = Math.max(1 / 170, sorted[Math.floor(sorted.length * 0.1)]); // refresh interval estimate
    const now = this.dynClock;
    if (this.dynProbe && now - this.dynProbe.t > 4) this.dynProbe = null; // survived: keep it
    let s = this.scale;
    if (p75 > this.targetFrame * 1.12) {
      const step = this.dynStep;
      if (step && !step.checked) { step.checked = true; this.dynUseless = mean > step.mean * 0.92 ? (this.dynUseless || 0) + 1 : 0; }
      if (this.dynProbe) { // the last upward step cost frames: undo it and stay below it for a while
        this.dynBackoff = Math.min(120, (this.dynBackoff || 7.5) * 2);
        this.dynCeil = { scale: s, until: now + this.dynBackoff };
        s = this.dynProbe.from;
        this.dynProbe = null;
      } else if (this.dynUseless >= 2) { // fewer pixels did not help: back to where the useless steps started
        this.dynHold = Math.min(120, (this.dynHold || 15) * 2);
        s = Math.min(1, step.restore);
        this.dynFloor = { scale: s, until: now + this.dynHold };
        this.dynUseless = 0;
        this.dynStep = null;
      } else {
        const floor = this.dynFloor && now < this.dynFloor.until ? this.dynFloor.scale : 0;
        const next = Math.max(this.q.minScale, floor, s - (p75 > this.targetFrame * 1.6 ? 0.1 : 0.05));
        if (next < s - 1e-4) { this.dynStep = { mean, restore: this.dynUseless && step ? step.restore : s }; s = next; }
      }
    } else {
      this.dynStep = null;
      this.dynUseless = 0;
      if (s < 1) {
        const ceil = this.dynCeil && now < this.dynCeil.until ? this.dynCeil.scale : 2;
        const fast = p75 < this.targetFrame * 0.8;                                   // high-refresh display with headroom
        const steady = vsync <= this.targetFrame * 1.05 && p90 <= vsync * 1.2 && now - (this.dynChanged || 0) > 2.5;
        const up = Math.min(1, s + 0.025);
        if ((fast || steady) && up < ceil - 1e-4) {
          if (!fast) this.dynProbe = { from: s, t: now };
          s = up;
        }
      }
    }
    if (s !== this.scale) { this.scale = s; this._applyScale(); ft.length = 0; this.dynCooldown = 0.2; this.dynChanged = now; }
  }

  /** A target of the canvas' size for frames that must not reach the screen (the quality benchmark); dispose it after. */
  offscreenTarget() {
    const v = this.gl.getDrawingBufferSize(new THREE.Vector2());
    return new THREE.WebGLRenderTarget(v.x, v.y, { depthBuffer: false });
  }

  /** Renders world (which may contain the depth-hacked viewmodel) and post-processes to the canvas (or to `out`). */
  render(scene, camera, time, out = null) {
    const gl = this.gl, rt = this.rt;
    gl.info.reset();
    gl.setRenderTarget(rt);
    gl.clear(true, true, false);
    // (cleared just above: no second clear of the MSAA buffers inside render)
    const ac = gl.autoClear;
    gl.autoClear = false;
    try { gl.render(scene, camera); } finally { gl.autoClear = ac; }

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
    for (const k of this._postKeys || (this._postKeys = Object.keys(this.post).filter((n) => c[n]))) c[k].value = this.post[k];
    c.uEdge.value = this.edgeEnabled ? this.post.edge : 0;
    c.uEdgeColor.value.copy(this.post.edgeColor);
    c.tScene.value = this.rt.texture;
    c.tBloom.value = low.texture;
    c.time.value = time;
    c.sceneTexel.value.set(1 / this.fullW, 1 / this.fullH);
    c.sharpen.value = this.post.sharpen + (1 - this.scale) * 0.6;
    this.quad.material = this.compMat;
    gl.setRenderTarget(out);
    this.quad.render(gl);
  }
}
