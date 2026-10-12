// Full-screen effects driven from the FX side:
//   flashbang white-out (CS2): full white for up to 1.88 s, total effect up to 4.87 s, the white fading over a
//   frozen afterimage of the moment of the flash (captured from the renderer's HDR target, shown on a
//   camera-attached quad so it goes through bloom / tonemapping like the scene).
//   kick(color, dur): short additive screen flashes (explosions close by).
// Both add to renderer.post.flashColor without clobbering what other systems put there.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const COPY_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uvScale;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tSrc, vUv * uvScale).rgb, 1.0); }`;
const COPY_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class ScreenFX {
  constructor(fx) {
    this.fx = fx;
    this.game = fx.game;
    this.added = new THREE.Vector3();
    this.kicks = [];
    this.flash = null;   // { t, full, total }
    this._capture = false;
    this.rt = null;
    this.copy = null;
    this.overlay = null;
  }

  _ensure() {
    if (this.overlay) return;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.copy = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: COPY_VERT, fragmentShader: COPY_FRAG, uniforms: { tSrc: { value: null }, uvScale: { value: new THREE.Vector2(1, 1) } }, depthTest: false, depthWrite: false }));
    this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, -1.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tAfter; uniform float uA; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tAfter, vUv).rgb, uA); }',
      uniforms: { tAfter: { value: this.rt.texture }, uA: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false,
    }));
    this.overlay.frustumCulled = false;
    this.overlay.renderOrder = 999;
    this.overlay.visible = false;
    this.fx.scene.add(this.overlay);
  }

  /** Blind the local player. amount 0..1 (angle / distance / visibility already folded in). */
  flashbang(amount) {
    if (amount <= 0.02) return;
    this._ensure();
    const full = 1.88 * amount, total = 4.87 * amount;
    if (this.flash && this.flash.total - this.flash.t > total) return;
    this.flash = { t: 0, full, total, amount };
    this._capture = true;
  }

  /** Brief additive flash (linear HDR colour) fading over dur seconds. */
  kick(color, dur = 0.12) { this.kicks.push({ c: color, t: 0, dur }); }

  update(dt) {
    const post = this.game.renderer?.post;
    if (!post) return;
    let r = 0, g = 0, b = 0;
    for (let i = this.kicks.length - 1; i >= 0; i--) {
      const k = this.kicks[i];
      k.t += dt;
      if (k.t >= k.dur) { this.kicks.splice(i, 1); continue; }
      const u = 1 - k.t / k.dur;
      r += k.c[0] * u * u; g += k.c[1] * u * u; b += k.c[2] * u * u;
    }
    const f = this.flash;
    if (f) {
      if (this._capture) { this._capture = false; this._grab(); }
      f.t += dt;
      const w = f.t < f.full ? 1 : 1 - THREE.MathUtils.smoothstep(f.t, f.full, f.total);
      const after = f.t < f.full ? 1 : Math.pow(Math.max(0, 1 - (f.t - f.full) / (f.total - f.full + 1.2)), 1.5);
      // additive HDR white that reads, after ACES, like mix(col, white, w) (06a §11.3.11): ~30 = white,
      // ~3 = 80 % white, ~0.9 = half
      const W = Math.min(30, 0.9 * w / (1.03 - w)) * Math.min(1, f.amount * 1.4);
      r += W; g += W; b += W;
      this.overlay.visible = after > 0.01;
      this.overlay.material.uniforms.uA.value = after * 0.8;
      if (f.t > f.total + 1.3) { this.flash = null; this.overlay.visible = false; }
      this.game.audio?.setMuffle?.(Math.max(w, after * 0.6));
    }
    // apply as a delta so other writers of flashColor keep their contribution
    post.flashColor.x += r - this.added.x; post.flashColor.y += g - this.added.y; post.flashColor.z += b - this.added.z;
    this.added.set(r, g, b);
  }

  /** Copies the last rendered HDR frame (still in the renderer's target) as the afterimage. */
  _grab() {
    const R = this.game.renderer;
    if (!R?.rt) return;
    const w = Math.max(4, R.vw >> 1), h = Math.max(4, R.vh >> 1);
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    const gl = R.gl;
    const prev = gl.getRenderTarget();
    this.copy.material.uniforms.tSrc.value = R.rt.texture;
    this.copy.material.uniforms.uvScale.value.set(R.vw / R.fullW, R.vh / R.fullH);
    gl.setRenderTarget(this.rt);
    this.copy.render(gl);
    gl.setRenderTarget(prev);
  }
}
