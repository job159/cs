// CPU-simulated, GPU-instanced billboard particles. Two layers: additive (flashes, sparks, embers,
// glows) and alpha-blended (smoke, dust, blood). Each particle can be velocity-stretched (sparks,
// tracers) and can render through the viewmodel projection (muzzle flash on the first-person gun).
import * as THREE from 'three';
import { buildAtlas } from './atlas.js';
import { materialUniforms } from '../gfx/materials.js';

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec4 iColor;
attribute vec4 iMisc;   // x size, y rotation, z frame, w stretch
attribute vec3 iVel;
uniform float uVm;      // 1 = viewmodel projection layer
uniform mat4 vmProj;
varying vec2 vUv;
varying vec4 vColor;
varying float vFade;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float size = iMisc.x;
  vec2 corner = position.xy;               // -0.5..0.5
  float frame = iMisc.z;
  vec2 cell = vec2(mod(frame, 4.0), 3.0 - floor(frame / 4.0));
  vUv = (cell + (corner + 0.5)) / 4.0;
  if (iMisc.w > 0.0) {
    // stretch along the view-space projection of the velocity
    vec3 vv = mat3(viewMatrix) * iVel;
    vec2 d = vv.xy; float l = length(d);
    vec2 dir = l > 1e-4 ? d / l : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float len = size + l * iMisc.w;
    mv.xy += dir * corner.x * len + nrm * corner.y * size;
  } else {
    float c = cos(iMisc.y), s = sin(iMisc.y);
    mv.xy += vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * size;
  }
  vColor = iColor;
  vFade = clamp((-mv.z - 0.08) / 0.4, 0.0, 1.0);     // avoid huge quads hugging the camera
  if (uVm > 0.5) { vFade = 1.0; gl_Position = vmProj * mv; gl_Position.z = gl_Position.z * 0.08 - 0.92 * gl_Position.w; }
  else gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
uniform sampler2D tAtlas;
uniform float uAdd;
uniform vec3 uAmbient;   // tint for non-emissive (alpha) particles so smoke matches scene light
varying vec2 vUv;
varying vec4 vColor;
varying float vFade;
void main() {
  vec4 t = texture2D(tAtlas, vUv);
  vec4 c = vColor * t;
  if (uAdd > 0.5) { gl_FragColor = vec4(c.rgb * c.a * vFade, 1.0); }
  else { c.rgb *= uAmbient; c.a *= vFade; if (c.a < 0.004) discard; gl_FragColor = c; }
}`;

class Layer {
  constructor(max, additive, atlas, vm, shared) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.misc = new Float32Array(max * 4);
    // simulation state
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 4);
    this.c1 = new Float32Array(max * 4);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.rotV = new Float32Array(max);
    this.collide = new Uint8Array(max);
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(this.vel, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(this.misc, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iVel', this.aVel); g.setAttribute('iColor', this.aCol); g.setAttribute('iMisc', this.aMisc);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { tAtlas: { value: atlas }, uAdd: { value: additive ? 1 : 0 }, uVm: { value: vm ? 1 : 0 }, vmProj: materialUniforms.vmProj, uAmbient: shared.ambient },
      transparent: true, depthWrite: false, depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
    if (vm) this.mesh.renderOrder = 40;
  }

  spawn(p) {
    let i;
    if (this.n < this.max) i = this.n++;
    else i = (Math.random() * this.max) | 0; // full: overwrite a random one
    const o3 = i * 3, o4 = i * 4;
    this.pos[o3] = p.x; this.pos[o3 + 1] = p.y; this.pos[o3 + 2] = p.z;
    this.vel[o3] = p.vx || 0; this.vel[o3 + 1] = p.vy || 0; this.vel[o3 + 2] = p.vz || 0;
    this.life[i] = 0;
    this.maxLife[i] = p.life || 1;
    this.size0[i] = p.size ?? 0.2;
    this.size1[i] = p.size1 ?? this.size0[i];
    const c = p.color || [1, 1, 1, 1], c1 = p.color1 || [c[0], c[1], c[2], 0];
    for (let k = 0; k < 4; k++) { this.c0[o4 + k] = c[k] ?? 1; this.c1[o4 + k] = c1[k] ?? 0; }
    this.grav[i] = p.gravity || 0;
    this.drag[i] = p.drag || 0;
    this.rotV[i] = p.spin || 0;
    this.collide[i] = p.collide ? 1 : 0;
    this.misc[o4] = this.size0[i];
    this.misc[o4 + 1] = p.rot ?? Math.random() * 6.283;
    this.misc[o4 + 2] = p.frame || 0;
    this.misc[o4 + 3] = p.stretch || 0;
    return i;
  }

  update(dt, floorFn) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] += dt;
      const t = this.life[i] / this.maxLife[i];
      if (t >= 1) {
        // swap-remove
        n--;
        if (i !== n) this._move(n, i);
        i--;
        continue;
      }
      const o3 = i * 3, o4 = i * 4;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[o3] *= dr; this.vel[o3 + 1] = this.vel[o3 + 1] * dr - this.grav[i] * dt; this.vel[o3 + 2] *= dr;
      this.pos[o3] += this.vel[o3] * dt; this.pos[o3 + 1] += this.vel[o3 + 1] * dt; this.pos[o3 + 2] += this.vel[o3 + 2] * dt;
      if (this.collide[i] && floorFn) {
        const fy = floorFn(this.pos[o3], this.pos[o3 + 2]);
        if (this.pos[o3 + 1] < fy) { this.pos[o3 + 1] = fy; this.vel[o3 + 1] *= -0.3; this.vel[o3] *= 0.5; this.vel[o3 + 2] *= 0.5; }
      }
      this.misc[o4] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      this.misc[o4 + 1] += this.rotV[i] * dt;
      for (let k = 0; k < 4; k++) this.col[o4 + k] = this.c0[o4 + k] + (this.c1[o4 + k] - this.c0[o4 + k]) * t;
    }
    this.n = n;
    this.geo.instanceCount = n;
    if (n) {
      for (const a of [this.aPos, this.aVel, this.aCol, this.aMisc]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
    }
  }

  _move(from, to) {
    const f3 = from * 3, t3 = to * 3, f4 = from * 4, t4 = to * 4;
    for (let k = 0; k < 3; k++) { this.pos[t3 + k] = this.pos[f3 + k]; this.vel[t3 + k] = this.vel[f3 + k]; }
    for (let k = 0; k < 4; k++) { this.col[t4 + k] = this.col[f4 + k]; this.misc[t4 + k] = this.misc[f4 + k]; this.c0[t4 + k] = this.c0[f4 + k]; this.c1[t4 + k] = this.c1[f4 + k]; }
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from]; this.size0[to] = this.size0[from]; this.size1[to] = this.size1[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.rotV[to] = this.rotV[from]; this.collide[to] = this.collide[from];
  }

  clear() { this.n = 0; this.geo.instanceCount = 0; }
}

export class Particles {
  constructor(scene, camera, quality) {
    this.atlas = buildAtlas();
    this.shared = { ambient: { value: new THREE.Vector3(1, 1, 1) } };
    const max = quality?.particles ?? 3000;
    this.add = new Layer(Math.round(max * 0.5), true, this.atlas, false, this.shared);
    this.alpha = new Layer(Math.round(max * 0.5), false, this.atlas, false, this.shared);
    // viewmodel layers live under the camera (positions in camera space are converted per frame)
    this.vmAdd = new Layer(64, true, this.atlas, true, this.shared);
    this.vmAlpha = new Layer(64, false, this.atlas, true, this.shared);
    scene.add(this.add.mesh, this.alpha.mesh, this.vmAdd.mesh, this.vmAlpha.mesh);
    this.floorFn = null;
  }
  /** opts: x,y,z, vx,vy,vz, life, size, size1, color [r,g,b,a] (HDR ok for additive), color1, gravity, drag, spin, frame, stretch, rot, collide, additive, vm */
  spawn(o) {
    const layer = o.vm ? (o.additive ? this.vmAdd : this.vmAlpha) : (o.additive ? this.add : this.alpha);
    return layer.spawn(o);
  }
  setAmbient(r, g, b) { this.shared.ambient.value.set(r, g, b); }
  update(dt) {
    this.add.update(dt, this.floorFn);
    this.alpha.update(dt, this.floorFn);
    this.vmAdd.update(dt, null);
    this.vmAlpha.update(dt, null);
  }
}
