// Surface decals (bullet holes, blood splats, scorch marks): a ring buffer of instanced quads aligned to
// the hit normal, slightly offset and polygon-offset to avoid z-fighting, fading out when recycled.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _p = new THREE.Vector3();

const VERT = /* glsl */`
attribute vec4 iData;   // x frame, y alpha, z tint index, w age
varying vec2 vUv;
varying vec4 vData;
void main() {
  vec2 cell = vec2(mod(iData.x, 4.0), 3.0 - floor(iData.x / 4.0));
  vUv = (cell + (position.xy + 0.5)) / 4.0;
  vData = iData;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */`
uniform sampler2D tAtlas;
uniform vec3 uAmbient;
uniform vec3 tints[4];
varying vec2 vUv;
varying vec4 vData;
void main() {
  vec4 t = texture2D(tAtlas, vUv);
  int ti = int(vData.z + 0.5);
  vec3 tint = ti == 0 ? tints[0] : ti == 1 ? tints[1] : ti == 2 ? tints[2] : tints[3];
  float a = t.a * vData.y;
  if (a < 0.01) discard;
  gl_FragColor = vec4(t.rgb * tint * uAmbient, a);
}`;

export const DECAL_TINT = { none: 0, blood: 1, acid: 2, scorch: 3 };

export class Decals {
  constructor(scene, atlas, max = 200, ambientUniform) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.data = new Float32Array(max * 4);
    this.aData = new THREE.InstancedBufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iData', this.aData);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      uniforms: {
        tAtlas: { value: atlas }, uAmbient: ambientUniform || { value: new THREE.Vector3(1, 1, 1) },
        tints: { value: [new THREE.Color(1, 1, 1), new THREE.Color(0.32, 0.015, 0.01), new THREE.Color(0.35, 0.55, 0.05), new THREE.Color(0.05, 0.045, 0.04)] },
      },
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 5;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.i = 0;
    this.alpha = new Float32Array(max);
    this.fadeIn = new Float32Array(max);
  }

  /** frame: atlas frame (14 hole, 15 splat, 12 dust...), size metres, tint DECAL_TINT */
  add(point, normal, { frame = 14, size = 0.12, tint = 0, alpha = 1, rot = Math.random() * 6.283 } = {}) {
    const i = this.i;
    this.i = (this.i + 1) % this.max;
    _q.setFromUnitVectors(_z, normal);
    _q.multiply(new THREE.Quaternion().setFromAxisAngle(_z, rot));
    _p.copy(point).addScaledVector(normal, 0.006);
    _s.set(size, size, 1);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(i, _m);
    this.data[i * 4] = frame; this.data[i * 4 + 1] = alpha; this.data[i * 4 + 2] = tint; this.data[i * 4 + 3] = 0;
    this.alpha[i] = alpha;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aData.needsUpdate = true;
    // fade the oldest decals near the ring head so recycling isn't a pop
    for (let k = 1; k <= 12; k++) {
      const j = (this.i + k - 1) % this.max;
      if (j < this.mesh.count) this.data[j * 4 + 1] = this.alpha[j] * (k / 13);
    }
  }

  clear() { this.mesh.count = 0; this.i = 0; }
}
