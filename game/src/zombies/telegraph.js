// Boss attack telegraphs on the ground: circles, cones and lines that fill up until the hit lands
// (red = real danger). Pooled meshes with a tiny shader; shared by host and clients.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// shape: 0 circle (uv centred), 1 cone (polar, angle in uniform), 2 line (rect)
const FRAG = /* glsl */`
uniform float fill;
uniform float shape;
uniform float halfAngle;
uniform vec3 color;
uniform float alpha;
uniform float time;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float inside = 0.0, prog = 0.0, edge = 0.0;
  if (shape < 0.5) {
    float r = length(p);
    inside = step(r, 1.0);
    prog = r;
    edge = smoothstep(0.92, 0.98, r) * inside;
  } else if (shape < 1.5) {
    // cone along +y of the quad, apex at the bottom centre
    vec2 q = vec2(p.x, (p.y + 1.0) * 0.5 * 2.0);
    float r = length(q) * 0.5;
    float a = abs(atan(q.x, q.y));
    inside = step(r, 1.0) * step(a, halfAngle);
    prog = r;
    edge = (smoothstep(0.93, 0.99, r) + smoothstep(halfAngle - 0.04, halfAngle, a)) * inside;
  } else {
    inside = 1.0;
    prog = vUv.y;
    edge = (smoothstep(0.9, 1.0, abs(p.x)) + smoothstep(0.97, 1.0, vUv.y)) * inside;
  }
  if (inside < 0.5) discard;
  float filled = step(prog, fill);
  float pulse = 0.75 + 0.25 * sin(time * 12.0);
  vec3 c = color * (0.35 + 0.65 * filled) * pulse + color * edge * 1.5;
  float a = (0.18 + 0.32 * filled + edge * 0.6) * alpha;
  gl_FragColor = vec4(c * a, a);
}`;

export class Telegraphs {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.pool = [];
    this.time = 0;
  }

  _mesh() {
    const m = this.pool.pop() || new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
      uniforms: { fill: { value: 0 }, shape: { value: 0 }, halfAngle: { value: 0.6 }, color: { value: new THREE.Color(1.6, 0.18, 0.08) }, alpha: { value: 1 }, time: { value: 0 } },
    }));
    m.renderOrder = 6;
    m.frustumCulled = false;
    this.scene.add(m);
    m.visible = true;
    return m;
  }

  /** Circle of radius r at pos (ground y) filling over `time` seconds. */
  circle(pos, r, time, { color } = {}) { return this._add(0, pos, r, r, 0, time, color); }
  /** Cone from pos facing yaw (radians, 0 = +Z), radius r, half angle (radians). */
  cone(pos, yaw, r, half, time, { color } = {}) { return this._add(1, pos, r, r, yaw, time, color, half); }
  /** Line (rect) from pos along yaw, length L and half width w. */
  line(pos, yaw, L, w, time, { color } = {}) { return this._add(2, pos, w, L / 2, yaw, time, color, 0, L); }

  _add(shape, pos, sx, sz, yaw, time, color, half = 0.6, len = 0) {
    const m = this._mesh();
    const u = m.material.uniforms;
    u.shape.value = shape; u.fill.value = 0; u.halfAngle.value = half; u.alpha.value = 1;
    u.color.value.set(color ?? 0xff2a14).multiplyScalar(1.6);
    m.scale.set(sx, 1, sz);
    m.rotation.set(0, yaw, 0);
    m.position.set(pos.x, pos.y + 0.04, pos.z);
    if (shape === 1) { m.scale.set(sx, 1, sx); m.translateZ(sx); }      // cone apex at pos
    if (shape === 2) { m.translateZ(len / 2); }                          // line starts at pos
    const it = { m, t: 0, time, fade: 0 };
    this.items.push(it);
    return it;
  }

  update(dt) {
    this.time += dt;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const u = it.m.material.uniforms;
      u.time.value = this.time;
      it.t += dt;
      if (it.t < it.time) u.fill.value = it.t / it.time;
      else {
        u.fill.value = 1;
        it.fade += dt;
        u.alpha.value = Math.max(0, 1 - it.fade / 0.25);
        if (it.fade >= 0.25) { it.m.visible = false; this.pool.push(it.m); this.items.splice(i, 1); }
      }
    }
  }

  clear() { for (const it of this.items) { it.m.visible = false; this.pool.push(it.m); } this.items.length = 0; }
}
