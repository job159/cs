// CPU-simulated, GPU-instanced particles. Layers: additive (flashes, sparks, fire, glows) and alpha-blended
// (smoke, dust, debris, blood), each in a world version and a viewmodel version (children of the camera,
// positions in camera space, drawn through the viewmodel projection: first-person muzzle flashes and
// barrel smoke that stick to the gun).
//
// Per-particle render modes:
//   billboard  camera-facing quad, rotated                                      (default)
//   line       3D streak from the head (position) back along the velocity        (stretch > 0 or mode 'line')
//              -> perspective-correct sparks / tracers with a minimum pixel width
//   align      quad whose x axis follows the screen projection of `dir`, with aspect ratio and an anchor
//              (muzzle clouds growing out of the barrel, blood sprays leaving the wound, upright flames)
//   flat       quad lying in the plane perpendicular to `dir` (ground rings, water ripples, glows on floors)
// Shading: plain (colour x texture) | ramp (temperature texture -> HDR gradient, fire) | lit (normal-mapped
// smoke lit by the scene's sun / sky / ground). Flipbooks blend between frames.
import * as THREE from 'three';
import { buildAtlases, COLS } from './atlas.js';
import { materialUniforms } from '../gfx/materials.js';

const MODE = { billboard: 0, line: 1, align: 2, flat: 3 };

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec3 iDir;
attribute vec4 iColor;
attribute vec4 iMisc;    // size, rotation, frame (fractional = blend), line length (seconds of velocity)
attribute vec4 iExtra;   // heat, ramp row + 1 (0 = none), packed mode, aspect (sign = mirror)
uniform float uVm;
uniform mat4 vmProj;
uniform vec2 uPx;        // NDC size of one pixel
uniform float uMinPx;    // minimum streak width in pixels
uniform float uCols;
varying vec4 vUv;        // xy cell A, zw cell B
varying float vBlend;
varying vec4 vColor;
varying vec4 vX;         // heat, ramp row, lit, alpha scale
varying vec2 vRot;
varying float vFade;
varying vec3 vWorld;

vec4 project(vec4 mv) {
  if (uVm > 0.5) { vec4 p = vmProj * mv; p.z = p.z * 0.08 - 0.92 * p.w; return p; }
  return projectionMatrix * mv;
}
vec2 cellOf(float f) { return vec2(mod(f, uCols), uCols - 1.0 - floor(f / uCols)); }

void main() {
  float packed = iExtra.z;
  float anchor = floor(packed / 8.0) / 16.0;
  float rem = packed - floor(packed / 8.0) * 8.0;
  float lit = floor(rem / 4.0);
  float mode = rem - lit * 4.0;
  vec2 corner = position.xy;                    // -0.5..0.5
  float size = iMisc.x;
  float rot = iMisc.y;
  float aScale = 1.0;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 cr = vec2(cos(rot), sin(rot));
  vRot = cr;
  vec4 clip;
  if (mode < 0.5) {
    mv.xy += vec2(cr.x * corner.x - cr.y * corner.y, cr.y * corner.x + cr.x * corner.y) * size;
    clip = project(mv);
  } else if (mode < 1.5) {
    // 3D streak: tail = position - velocity * length(seconds)
    vec4 mvH = mv;
    vec4 mvT = modelViewMatrix * vec4(iPos - iDir * iMisc.w, 1.0);
    if (mvT.z > -0.06) mvT = mix(mvH, mvT, clamp((mvH.z + 0.06) / max(mvH.z - mvT.z, 1e-5), 0.0, 1.0));
    float s = corner.x + 0.5;
    mv = mix(mvT, mvH, s);
    vec4 cH = project(mvH), cT = project(mvT);
    vec2 sH = cH.xy / max(cH.w, 1e-4), sT = cT.xy / max(cT.w, 1e-4);
    vec2 dpx = (sH - sT) / uPx;
    float l = length(dpx);
    vec2 dir = l > 1e-3 ? dpx / l : vec2(cr.x, cr.y);
    vec2 nrm = vec2(-dir.y, dir.x);
    clip = project(mv);
    float hwPx = size * 0.5 * abs((uVm > 0.5 ? vmProj[1][1] : projectionMatrix[1][1]) / mv.z) / uPx.y;
    float hwEff = max(hwPx, uMinPx * 0.5);
    aScale = clamp(hwPx / hwEff, 0.0, 1.0);
    // round the ends a little (half a width) so short streaks never collapse to nothing
    clip.xy += (nrm * corner.y * 2.0 * hwEff + dir * corner.x * 2.0 * hwEff) * uPx * clip.w;
  } else if (mode < 2.5) {
    vec3 vv = mat3(modelViewMatrix) * iDir;
    float l2 = length(vv.xy), lf = l2 / max(length(vv), 1e-5);
    vec2 d2 = l2 > 1e-5 ? vv.xy / l2 : vec2(1.0, 0.0);
    d2 = vec2(d2.x * cr.x - d2.y * cr.y, d2.y * cr.x + d2.x * cr.y);   // rotation = angle jitter
    float k = smoothstep(0.02, 0.3, lf);
    if (l2 <= 1e-5) d2 = cr;
    float asp = mix(1.0, abs(iExtra.w), k);
    float len = size * asp;
    vec2 nrm = vec2(-d2.y, d2.x) * (iExtra.w < 0.0 ? -1.0 : 1.0);
    mv.xy += d2 * (corner.x * len + anchor * len * k) + nrm * corner.y * size;
    clip = project(mv);
  } else {
    vec3 n = normalize(iDir + vec3(0.0, 1e-6, 0.0));
    vec3 t = normalize(abs(n.y) < 0.95 ? cross(vec3(0.0, 1.0, 0.0), n) : cross(vec3(1.0, 0.0, 0.0), n));
    vec3 b = cross(n, t);
    vec2 c2 = vec2(cr.x * corner.x - cr.y * corner.y, cr.y * corner.x + cr.x * corner.y) * size;
    mv = modelViewMatrix * vec4(iPos + t * c2.x + b * c2.y, 1.0);
    clip = project(mv);
  }
  gl_Position = clip;
  vec2 uv = 0.006 + (corner + 0.5) * 0.988;
  float f0 = floor(iMisc.z);
  vBlend = iMisc.z - f0;
  vUv = vec4((cellOf(f0) + uv) / uCols, (cellOf(f0 + 1.0) + uv) / uCols);
  vColor = iColor;
  vX = vec4(iExtra.x, iExtra.y, lit, aScale);
  vFade = uVm > 0.5 ? 1.0 : clamp((-mv.z - 0.08) / 0.4, 0.0, 1.0);
#ifdef HOLES
  vWorld = (inverse(viewMatrix) * mv).xyz;
#endif
}`;

const FRAG = /* glsl */`
uniform sampler2D tAtlas;
uniform sampler2D tRamp;
uniform float uAdd;
uniform float uAtlasSize;
uniform vec3 uSceneLight;   // average light for plain alpha particles (smoke/blood look lit by the scene)
uniform vec3 uSunView;      // sun direction in view space
uniform vec3 uSunCol;       // sun irradiance / PI
uniform vec3 uUpView;
uniform vec3 uSky, uGround; // hemisphere + environment terms / PI
#ifdef HOLES
uniform vec4 uHoleA[8];     // xyz start, radius
uniform vec4 uHoleB[8];     // xyz end, strength
#endif
varying vec4 vUv;
varying float vBlend;
varying vec4 vColor;
varying vec4 vX;
varying vec2 vRot;
varying float vFade;
varying vec3 vWorld;

vec4 cellTex(vec2 uv) {
  // clamp the mip level so tiny particles never bleed in their neighbours
  vec2 dx = dFdx(uv) * uAtlasSize, dy = dFdy(uv) * uAtlasSize;
  float lod = clamp(0.5 * log2(max(dot(dx, dx), dot(dy, dy))), 0.0, 4.0);
  return textureLod(tAtlas, uv, lod);
}
void main() {
  vec4 t = cellTex(vUv.xy);
  if (vBlend > 0.002) t = mix(t, cellTex(vUv.zw), vBlend);
  float fade = vFade * vX.w;
#ifdef HOLES
  {
    for (int i = 0; i < 8; i++) {
      vec4 A = uHoleA[i], B = uHoleB[i];
      if (B.w <= 0.0) continue;
      vec3 pa = vWorld - A.xyz, ba = B.xyz - A.xyz;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
      float d = length(pa - ba * h);
      fade *= mix(1.0, smoothstep(A.w * 0.55, A.w + 0.3, d), B.w);
    }
  }
#endif
  if (vX.y > 0.5) {
    // fire: temperature (B) x heat -> HDR ramp, density (A) as coverage
    float T = clamp(t.b * vX.x, 0.0, 1.0);
    vec3 c = texture2D(tRamp, vec2(T * 0.996 + 0.002, (vX.y - 0.5) / 8.0)).rgb * vColor.rgb;
    float a = t.a * vColor.a * fade;
    if (uAdd > 0.5) { gl_FragColor = vec4(c * a, 1.0); return; }
    if (a < 0.004) discard;
    gl_FragColor = vec4(c, a); return;
  }
  if (vX.z > 0.5) {
    // lit smoke: tangent-space normal from the atlas, rotated with the particle
    vec2 n2 = t.rg * 2.0 - 1.0;
    n2 = vec2(vRot.x * n2.x - vRot.y * n2.y, vRot.y * n2.x + vRot.x * n2.y);
    vec3 N = vec3(n2, sqrt(max(0.0, 1.0 - dot(n2, n2))));
    float ndl = dot(N, uSunView);
    float sun = max(ndl * 0.7 + 0.3, 0.0) * (1.0 - t.b * 0.35 * (1.0 - max(ndl, 0.0)));
    vec3 amb = mix(uGround, uSky, dot(N, uUpView) * 0.5 + 0.5);
    vec3 c = vColor.rgb * (uSunCol * sun + amb);
    float a = t.a * vColor.a * fade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(c, a); return;
  }
  vec4 c = vColor * t;
  if (uAdd > 0.5) { gl_FragColor = vec4(c.rgb * c.a * fade, 1.0); return; }
  c.rgb *= uSceneLight; c.a *= fade;
  if (c.a < 0.004) discard;
  gl_FragColor = c;
}`;

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3();

export class Layer {
  constructor(max, { additive, vm = false, shared, textures, holes = false, renderOrder }) {
    this.max = max;
    this.n = 0;
    this.additive = additive;
    this.vm = vm;
    // render attributes
    this.pos = new Float32Array(max * 3);
    this.dir = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.misc = new Float32Array(max * 4);
    this.extra = new Float32Array(max * 4);
    // simulation state
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.sizePow = new Float32Array(max);
    this.c0 = new Float32Array(max * 4);
    this.c1 = new Float32Array(max * 4);
    this.colPow = new Float32Array(max);
    this.fadeIn = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.rotV = new Float32Array(max);
    this.bounce = new Float32Array(max);          // 0 = no collision
    this.frame0 = new Float32Array(max);
    this.frames = new Float32Array(max);
    this.fps = new Float32Array(max);
    this.heat0 = new Float32Array(max);
    this.heat1 = new Float32Array(max);
    this.heatPow = new Float32Array(max);
    this.stretch = new Float32Array(max);
    this.inertia = new Float32Array(max);
    this.flags = new Uint8Array(max);             // 1 fresh, 2 dir follows velocity, 4 line mode, 8 loop flipbook
    this.arrays = [];
    for (const k of ['pos', 'dir', 'vel']) this.arrays.push([this[k], 3]);
    for (const k of ['col', 'misc', 'extra', 'c0', 'c1']) this.arrays.push([this[k], 4]);
    for (const k of ['life', 'maxLife', 'size0', 'size1', 'sizePow', 'colPow', 'fadeIn', 'grav', 'drag', 'rotV', 'bounce', 'frame0', 'frames', 'fps', 'heat0', 'heat1', 'heatPow', 'stretch', 'inertia', 'flags']) this.arrays.push([this[k], 1]);

    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    const attr = (arr, n) => new THREE.InstancedBufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [attr(this.pos, 3), attr(this.dir, 3), attr(this.col, 4), attr(this.misc, 4), attr(this.extra, 4)];
    ['iPos', 'iDir', 'iColor', 'iMisc', 'iExtra'].forEach((n, i) => g.setAttribute(n, this.attrs[i]));
    g.instanceCount = 0;
    this.geo = g;
    const uniforms = {
      tAtlas: textures.fx, tRamp: textures.ramp, uAtlasSize: textures.size, uCols: { value: COLS },
      uAdd: { value: additive ? 1 : 0 }, uVm: { value: vm ? 1 : 0 }, vmProj: materialUniforms.vmProj,
      uPx: shared.px, uMinPx: shared.minPx,
      uSceneLight: shared.sceneLight, uSunView: shared.sunView, uSunCol: shared.sunCol, uUpView: shared.upView, uSky: shared.sky, uGround: shared.ground,
    };
    if (holes) {
      this.holeA = Array.from({ length: 8 }, () => new THREE.Vector4());
      this.holeB = Array.from({ length: 8 }, () => new THREE.Vector4());
      uniforms.uHoleA = { value: this.holeA };
      uniforms.uHoleB = { value: this.holeB };
    }
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, defines: holes ? { HOLES: '' } : {},
      uniforms, transparent: true, depthWrite: false, depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder ?? (vm ? (additive ? 42 : 41) : additive ? 20 : 10);
    this.sortable = false;
  }

  spawn(p) {
    let i;
    if (this.n < this.max) i = this.n++;
    else i = (Math.random() * this.max) | 0; // full: overwrite a random one
    const o3 = i * 3, o4 = i * 4;
    this.pos[o3] = p.x; this.pos[o3 + 1] = p.y; this.pos[o3 + 2] = p.z;
    const vx = p.vx || 0, vy = p.vy || 0, vz = p.vz || 0;
    this.vel[o3] = vx; this.vel[o3 + 1] = vy; this.vel[o3 + 2] = vz;
    const mode = p.mode !== undefined ? (typeof p.mode === 'string' ? MODE[p.mode] : p.mode) : (p.stretch > 0 ? 1 : 0);
    let fl = 1;
    if (p.dir) { this.dir[o3] = p.dir[0] ?? p.dir.x; this.dir[o3 + 1] = p.dir[1] ?? p.dir.y; this.dir[o3 + 2] = p.dir[2] ?? p.dir.z; }
    else { this.dir[o3] = vx; this.dir[o3 + 1] = vy; this.dir[o3 + 2] = vz; fl |= 2; }
    if (mode === 1) fl |= 4 | 2;
    if (p.loop) fl |= 8;
    this.flags[i] = fl;
    this.life[i] = -(p.delay || 0);
    this.maxLife[i] = p.life || 1;
    this.size0[i] = p.size ?? 0.2;
    this.size1[i] = p.size1 ?? this.size0[i];
    this.sizePow[i] = p.sizePow ?? 1;
    const c = p.color || [1, 1, 1, 1], c1 = p.color1 || [c[0], c[1], c[2], 0];
    for (let k = 0; k < 4; k++) { this.c0[o4 + k] = c[k] ?? 1; this.c1[o4 + k] = c1[k] ?? 0; }
    this.colPow[i] = p.colorPow ?? 1;
    this.fadeIn[i] = p.fadeIn || 0;
    this.grav[i] = p.gravity || 0;
    this.drag[i] = p.drag || 0;
    this.rotV[i] = p.spin || 0;
    this.bounce[i] = p.collide ? (p.bounce ?? 0.3) + 0.0001 : 0;
    this.frame0[i] = p.frame || 0;
    this.frames[i] = p.frames || 1;
    this.fps[i] = p.fps || 0;
    this.heat0[i] = p.heat ?? 1;
    this.heat1[i] = p.heat1 ?? 0;
    this.heatPow[i] = p.heatPow ?? 1;
    this.stretch[i] = p.stretch || 0;
    this.inertia[i] = p.inertia || 0;
    this.misc[o4] = this.size0[i];
    this.misc[o4 + 1] = p.rot ?? Math.random() * 6.283;
    this.misc[o4 + 2] = this.frame0[i] + (p.frameOffset || 0);
    this.misc[o4 + 3] = 0;
    const anchor = Math.round(Math.min(1, Math.max(0, p.anchor || 0)) * 16);
    this.extra[o4] = this.heat0[i];
    this.extra[o4 + 1] = p.ramp !== undefined && p.ramp !== null && p.ramp !== false ? p.ramp + 1 : 0;
    this.extra[o4 + 2] = mode + (p.lit ? 4 : 0) + anchor * 8;
    this.extra[o4 + 3] = (p.aspect ?? 1) * (p.mirror ? -1 : 1);
    // hidden until simulated once (so a delayed particle never flashes at full size)
    for (let k = 0; k < 4; k++) this.col[o4 + k] = this.c0[o4 + k];
    if (p.delay) this.col[o4 + 3] = 0;
    return i;
  }

  /** dt: step; floorFn(x,z): floor height for collisions; camDelta: Matrix4 (vm layers: old camera space -> new). */
  update(dt, floorFn, camDelta) {
    let n = this.n;
    const P = this.pos, V = this.vel, D = this.dir, C = this.col, M = this.misc, X = this.extra;
    for (let i = 0; i < n; i++) {
      const fl = this.flags[i];
      const fresh = fl & 1;                   // spawned this frame: shown exactly as spawned (full-bright frame 1)
      if (fresh) this.flags[i] = fl & ~1;
      else this.life[i] += dt;
      const sdt = fresh ? 0 : dt;
      const life = this.life[i], ml = this.maxLife[i];
      const t = life / ml;
      if (t >= 1) {
        n--;
        if (i !== n) this._move(n, i);
        i--;
        continue;
      }
      const o3 = i * 3, o4 = i * 4;
      if (life < 0) { C[o4 + 3] = 0; continue; }  // delayed start
      // viewmodel inertia: part of the particle stays in the world while the camera moves
      const inr = this.inertia[i];
      if (inr > 0 && camDelta && !fresh) {
        _v.set(P[o3], P[o3 + 1], P[o3 + 2]).applyMatrix4(camDelta);
        P[o3] += (_v.x - P[o3]) * inr; P[o3 + 1] += (_v.y - P[o3 + 1]) * inr; P[o3 + 2] += (_v.z - P[o3 + 2]) * inr;
      }
      const dr = Math.max(0, 1 - this.drag[i] * sdt);
      V[o3] *= dr; V[o3 + 1] = V[o3 + 1] * dr - this.grav[i] * sdt; V[o3 + 2] *= dr;
      P[o3] += V[o3] * sdt; P[o3 + 1] += V[o3 + 1] * sdt; P[o3 + 2] += V[o3 + 2] * sdt;
      const b = this.bounce[i];
      if (b > 0 && floorFn) {
        const fy = floorFn(P[o3], P[o3 + 2]);
        if (P[o3 + 1] < fy) {
          P[o3 + 1] = fy;
          if (V[o3 + 1] < -0.6) { V[o3 + 1] *= -b; V[o3] *= 0.55; V[o3 + 2] *= 0.55; this.rotV[i] *= 0.5; }
          else { V[o3 + 1] = 0; V[o3] *= 0.8; V[o3 + 2] *= 0.8; this.rotV[i] *= 0.8; }
        }
      }
      if (fl & 2) { D[o3] = V[o3]; D[o3 + 1] = V[o3 + 1]; D[o3 + 2] = V[o3 + 2]; }
      if (fl & 4) M[o4 + 3] = Math.min(this.stretch[i], life + 0.004);
      const sp = this.sizePow[i];
      M[o4] = this.size0[i] + (this.size1[i] - this.size0[i]) * (sp === 1 ? t : Math.pow(t, sp));
      M[o4 + 1] += this.rotV[i] * sdt;
      const cp = this.colPow[i];
      const u = cp === 1 ? t : Math.pow(t, cp);
      for (let k = 0; k < 4; k++) C[o4 + k] = this.c0[o4 + k] + (this.c1[o4 + k] - this.c0[o4 + k]) * u;
      const fi = this.fadeIn[i];
      if (fi > 0 && t < fi) C[o4 + 3] *= t / fi;
      const nf = this.frames[i];
      if (nf > 1) {
        const fps = this.fps[i];
        let f;
        if (fps > 0) {
          f = life * fps;
          if (fl & 8) { f %= nf; if (f > nf - 1) f = nf - 1; } else f = Math.min(nf - 1, f);
        } else f = Math.min(nf - 1, t * (nf - 1) * 1.0001);
        M[o4 + 2] = this.frame0[i] + f;
      }
      const hp = this.heatPow[i];
      X[o4] = this.heat0[i] + (this.heat1[i] - this.heat0[i]) * (hp === 1 ? t : Math.pow(t, hp));
    }
    this.n = n;
    this.geo.instanceCount = n;
    if (n) for (const a of this.attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
  }

  /** Back-to-front sort (big smoke volumes); viewPos: function(i) -> depth along the view axis. */
  sortBy(depthOf) {
    const n = this.n;
    if (n < 2) return;
    const idx = this._idx && this._idx.length >= n ? this._idx : (this._idx = new Int32Array(this.max));
    const key = this._key && this._key.length >= n ? this._key : (this._key = new Float32Array(this.max));
    for (let i = 0; i < n; i++) { idx[i] = i; key[i] = depthOf(i); }
    const order = Array.from(idx.subarray(0, n)).sort((a, b) => key[b] - key[a]);
    // apply the permutation to every array through a scratch copy
    for (const [arr, s] of this.arrays) {
      const tmp = arr.slice(0, n * s);
      for (let j = 0; j < n; j++) { const src = order[j] * s, dst = j * s; for (let k = 0; k < s; k++) arr[dst + k] = tmp[src + k]; }
    }
  }

  _move(from, to) {
    for (const [arr, s] of this.arrays) {
      const f = from * s, t = to * s;
      for (let k = 0; k < s; k++) arr[t + k] = arr[f + k];
    }
  }

  clear() { this.n = 0; this.geo.instanceCount = 0; }
}

export class Particles {
  /** renderer: the engine Renderer (its WebGLRenderer generates the textures). */
  constructor(scene, camera, quality, renderer) {
    this.camera = camera;
    const big = (quality?.particles ?? 3000) >= 2500;
    this.textures = buildAtlases(renderer.gl, { size: big ? 2048 : 1024 });
    const tx = { fx: { value: this.textures.fx }, ramp: { value: this.textures.ramp }, size: { value: this.textures.size } };
    this.tx = tx;
    this.atlas = this.textures.fx;
    this.shared = {
      ambient: { value: new THREE.Vector3(1, 1, 1) },       // legacy (decals used to take it)
      sceneLight: { value: new THREE.Vector3(1, 1, 1) },
      sunView: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Vector3(0.8, 0.75, 0.7) },
      upView: { value: new THREE.Vector3(0, 1, 0) }, sky: { value: new THREE.Vector3(0.3, 0.32, 0.36) }, ground: { value: new THREE.Vector3(0.12, 0.11, 0.1) },
      px: { value: new THREE.Vector2(1 / 640, 1 / 360) }, minPx: { value: 1.3 },
      camWorld: { value: new THREE.Matrix4() },
    };
    this.renderer = renderer;
    const max = quality?.particles ?? 3000;
    const opts = (additive, vm = false) => ({ additive, vm, shared: this.shared, textures: tx });
    this.add = new Layer(Math.round(max * 0.5), opts(true));
    this.alpha = new Layer(Math.round(max * 0.5), opts(false));
    // viewmodel layers are children of the camera: positions are in camera space
    this.vmAdd = new Layer(96, opts(true, true));
    this.vmAlpha = new Layer(96, opts(false, true));
    scene.add(this.add.mesh, this.alpha.mesh);
    camera.add(this.vmAdd.mesh, this.vmAlpha.mesh);
    this.layers = [this.add, this.alpha, this.vmAdd, this.vmAlpha];
    this.floorFn = null;
    this._prevCam = new THREE.Matrix4().copy(camera.matrixWorld);
    this._camDelta = new THREE.Matrix4();
    // GPU textures are lost with the GL context: rebuild them when it comes back
    this._onRestore = () => setTimeout(() => this.textures.regenerate(), 0);
    renderer.gl.domElement?.addEventListener('webglcontextrestored', this._onRestore);
  }

  /** Extra layer sharing textures/lighting (smoke grenades with bullet holes, ...). */
  makeLayer(max, opts) {
    const l = new Layer(max, { shared: this.shared, textures: this.tx, ...opts });
    return l;
  }

  /**
   * opts: x,y,z, vx,vy,vz, life, delay, size, size1, sizePow, color [r,g,b,a] (HDR ok for additive), color1,
   * colorPow, fadeIn, gravity, drag, spin, rot, frame, frames, fps, loop, frameOffset, stretch (line length in
   * seconds of velocity), mode ('billboard'|'line'|'align'|'flat'), dir [x,y,z] (align axis / flat normal),
   * aspect, mirror, anchor (0..1: shift the quad forward along dir), ramp (row), heat, heat1, heatPow, lit,
   * collide, bounce, inertia (vm only), additive, vm.
   */
  spawn(o) {
    const layer = o.vm ? (o.additive ? this.vmAdd : this.vmAlpha) : (o.additive ? this.add : this.alpha);
    return layer.spawn(o);
  }
  setAmbient(r, g, b) { this.shared.ambient.value.set(r, g, b); this.shared.sceneLight.value.set(r, g, b); }

  update(dt) {
    const cam = this.camera;
    // camera motion since the last update (for viewmodel-space particles with inertia)
    this._camDelta.copy(cam.matrixWorld).invert().multiply(this._prevCam);
    this._prevCam.copy(cam.matrixWorld);
    this.shared.camWorld.value.copy(cam.matrixWorld);
    const r = this.renderer;
    if (r?.vw) this.shared.px.value.set(2 / r.vw, 2 / r.vh);
    this.add.update(dt, this.floorFn);
    this.alpha.update(dt, this.floorFn);
    this.vmAdd.update(dt, null, this._camDelta);
    this.vmAlpha.update(dt, null, this._camDelta);
  }

  dispose() {
    this.renderer.gl.domElement?.removeEventListener('webglcontextrestored', this._onRestore);
    this.textures.dispose();
  }
}
