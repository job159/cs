// Surface decals: bullet holes per material, glass cracks, directional blood, scorch marks, knife scratches.
// One instanced draw. Decals use MODULATE-2X blending (result = surface x 2 x decal colour) like Source's
// bullet-hole decals: they inherit the real lighting / shadows / lightmaps of the surface underneath, can
// darken (holes, blood, soot) AND brighten (fresh chipped concrete, scraped metal, glass cracks). A normal
// map in the atlas adds directional crater shading against the sun, wet blood gets a specular glint.
// Decals can fade out after a lifetime (blood); old ones fade when the ring buffer recycles them.
import * as THREE from 'three';
import { DECAL } from './atlas.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

const VERT = /* glsl */`
attribute vec4 iData;    // x cell, y alpha, z tint index, w birth time
attribute vec4 iData2;   // x life (0 = forever), y fade duration, z gloss multiplier, w aspect (x stretch)
uniform float uTime;
varying vec2 vUv;
varying float vAlpha;
varying float vTint;
varying float vGloss;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;
varying vec3 vWorld;
void main() {
  vec2 cell = vec2(mod(iData.x, 4.0), 3.0 - floor(iData.x / 4.0));
  vUv = (cell + (position.xy * 0.985 + 0.5)) / 4.0;
  mat3 m = mat3(instanceMatrix);
  vT = normalize(m[0]); vB = normalize(m[1]); vN = normalize(m[2]);
  float age = uTime - iData.w;
  float a = iData.y;
  if (iData2.x > 0.0) a *= 1.0 - smoothstep(iData2.x, iData2.x + iData2.y, age);
  vAlpha = a;
  vTint = iData.z;
  vGloss = iData2.z;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */`
uniform sampler2D tDecal;
uniform vec3 tints[6];
uniform vec3 uSunDir;
uniform float uSun;
uniform float uAmb;
uniform float uFog;
varying vec2 vUv;
varying float vAlpha;
varying float vTint;
varying float vGloss;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;
varying vec3 vWorld;
void main() {
  vec4 c = texture2D(tDecal, vec2(vUv.x * 0.5, vUv.y));
  float a = c.a * vAlpha;
  if (a < 0.004) discard;
  vec4 nm = texture2D(tDecal, vec2(vUv.x * 0.5 + 0.5, vUv.y));
  vec2 nxy = nm.xy * 2.0 - 1.0;
  vec3 Np = normalize(vT * nxy.x + vB * nxy.y + vN * sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
  // relative shading of the perturbed normal vs the flat surface (both lit by the same sun + ambient)
  float l0 = uAmb + uSun * max(dot(vN, uSunDir), 0.0);
  float l1 = uAmb + uSun * max(dot(Np, uSunDir), 0.0);
  float shade = l1 / max(l0, 1e-3);
  int ti = int(vTint + 0.5);
  vec3 tint = ti == 0 ? tints[0] : ti == 1 ? tints[1] : ti == 2 ? tints[2] : ti == 3 ? tints[3] : ti == 4 ? tints[4] : tints[5];
  vec3 ratio = c.rgb * 2.0 * tint * shade;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 H = normalize(V + uSunDir);
  ratio += pow(max(dot(Np, H), 0.0), 70.0) * nm.b * vGloss * 3.0 * (0.4 + 0.6 * uSun / (uSun + uAmb + 1e-3));
  float dist = length(cameraPosition - vWorld);
  float fogK = exp(-uFog * uFog * dist * dist);
  ratio = mix(vec3(1.0), ratio, fogK);
  gl_FragColor = vec4(clamp(mix(vec3(0.5), ratio * 0.5, a), 0.0, 1.0), 1.0);
}`;

// tint indices (legacy API values 0..3 kept)
export const DECAL_TINT = { none: 0, blood: 1, acid: 2, scorch: 3, zombie: 4, cso: 5 };

export class Decals {
  constructor(scene, textures, max = 200) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.data = new Float32Array(max * 4);
    this.data2 = new Float32Array(max * 4);
    this.aData = new THREE.InstancedBufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage);
    this.aData2 = new THREE.InstancedBufferAttribute(this.data2, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iData', this.aData);
    geo.setAttribute('iData2', this.aData2);
    this.uniforms = {
      tDecal: { value: textures.decal }, uTime: { value: 0 },
      // modulate tints: blood is a translucent dye (red passes, green/blue absorbed)
      tints: { value: [new THREE.Color(1, 1, 1), new THREE.Color(1.0, 0.075, 0.06), new THREE.Color(0.6, 1.1, 0.12), new THREE.Color(0.55, 0.5, 0.45), new THREE.Color(1.1, 0.085, 0.065), new THREE.Color(1.3, 0.1, 0.075)] },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() }, uSun: { value: 1 }, uAmb: { value: 0.6 }, uFog: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 5;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.i = 0;
    this.alpha = new Float32Array(max);
    this.time = 0;
    this.collision = null;   // set by FX: used to shrink decals that would hang over an edge
  }

  update(dt) { this.time += dt; this.uniforms.uTime.value = this.time; }

  /**
   * point, normal (world). opts: frame (DECAL cell or legacy 14 hole / 15 splat), size (m), aspect (x stretch),
   * tint (DECAL_TINT index), alpha, rot (radians; ignored when `along` is given), along (world direction the
   * decal's +x should follow, e.g. the bullet direction for blood streaks), life (s, 0 = forever), fade (s),
   * gloss (specular multiplier), fit (shrink to stay on the surface; default for size > 0.15).
   */
  add(point, normal, { frame = DECAL.concrete, size = 0.12, aspect = 1, tint = 0, alpha = 1, rot = Math.random() * 6.283, along = null, life = 0, fade = 3, gloss = 1, fit } = {}) {
    // legacy frames from the old shared atlas
    if (frame === 14) frame = DECAL.concrete;
    else if (frame === 15) frame = tint === DECAL_TINT.scorch ? DECAL.scorch : tint === DECAL_TINT.none ? DECAL.splat : DECAL.blood;
    if (frame === DECAL.scorch && tint === DECAL_TINT.scorch) tint = DECAL_TINT.none;
    if ((fit ?? size > 0.15) && this.collision) size = this._fit(point, normal, size, aspect);
    if (size <= 0.01) return -1;
    const i = this.i;
    this.i = (this.i + 1) % this.max;
    _q.setFromUnitVectors(_z, normal);
    let ang = rot;
    if (along) {
      // angle of `along` projected on the surface, measured in the decal's local frame
      _t.set(1, 0, 0).applyQuaternion(_q);
      _b.set(0, 1, 0).applyQuaternion(_q);
      _d.copy(along).addScaledVector(normal, -along.dot(normal));
      if (_d.lengthSq() > 1e-6) ang = Math.atan2(_d.dot(_b), _d.dot(_t)) + (Math.random() - 0.5) * 0.3;
    }
    _q.multiply(_q2.setFromAxisAngle(_z, ang));
    _p.copy(point).addScaledVector(normal, 0.004);
    _s.set(size * aspect, size, 1);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(i, _m);
    const o = i * 4;
    this.data[o] = frame; this.data[o + 1] = alpha; this.data[o + 2] = tint; this.data[o + 3] = this.time;
    this.data2[o] = life; this.data2[o + 1] = fade; this.data2[o + 2] = gloss; this.data2[o + 3] = aspect;
    this.alpha[i] = alpha;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    // fade the oldest decals near the ring head so recycling isn't a pop
    for (let k = 1; k <= 12; k++) {
      const j = (this.i + k - 1) % this.max;
      if (j < this.mesh.count && j !== i) this.data[j * 4 + 1] = this.alpha[j] * (k / 13);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aData.needsUpdate = true;
    this.aData2.needsUpdate = true;
    return i;
  }

  /** Shrinks a decal until its corners lie on the same surface (no quads hanging over crate edges). */
  _fit(point, normal, size, aspect) {
    const col = this.collision;
    _t.set(normal.y, normal.z, normal.x);
    if (Math.abs(normal.y) > 0.9) _t.set(1, 0, 0);
    _t.addScaledVector(normal, -_t.dot(normal)).normalize();
    _b.crossVectors(normal, _t);
    _d.copy(normal).negate();
    for (let tries = 0; tries < 3; tries++) {
      let ok = true;
      const hx = size * aspect * 0.42, hy = size * 0.42;
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        _c.copy(point).addScaledVector(_t, sx * hx).addScaledVector(_b, sy * hy).addScaledVector(normal, 0.05);
        const h = col.raycast(_c, _d, 0.12);
        if (!h || h.normal.dot(normal) < 0.9) { ok = false; break; }
      }
      if (ok) return size;
      size *= 0.6;
    }
    return size * 0.6;
  }

  clear() { this.mesh.count = 0; this.i = 0; }
}
