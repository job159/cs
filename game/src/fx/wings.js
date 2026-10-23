// WING (PREMIUM_WEAPONS §1.7.5, §1.16, 05b §8.8): fans of glowing feather cards on the first-person gun
// (sockets S_wingL / S_wingR) or on a third-person / back socket (S_back, ×3.2: ~2.4 m span).
//   cards   5–7 per side (low 3, medium 5), 12–18° apart; innermost 0.22×0.05 m, +12 % length each, outermost
//           ≈ 0.42×0.07 m; spread backwards-up 25° from the socket; open in 0.25 s easeOutBack with a 20 ms
//           stagger; idle sway rot += sin(2.2t + 0.6i)·0.04; light flows out along each feather at 0.4 uv/s.
//   styles  'glow'      additive: white-hot root → element-colour tip, barbs, rachis (CSO light wings)
//           'cloisonne' 掐絲琺瑯 (M03 畢方): gold wire cells filled with glowing enamel, premultiplied
//   atlas   procedural 256×512, 8 rows of 256×64 (4 feather shapes × 2 styles): R coverage, G barbs / shading,
//           B enamel cell id, A gold wire + rachis.
// One instanced draw call per wing pair. First-person wings use the viewmodel projection (own FOV, depth
// squeezed in front) and a guard that shrinks a side whose tip would enter the central 20 % of the screen.
import * as THREE from 'three';
import { hdr, easeOutBack, GLSL_NOISE } from './kitutil.js';
import { materialUniforms } from '../gfx/materials.js';
import { FRAME } from './atlas.js';

// ------------------------------------------------------------------ feather atlas (CPU, cached)
let atlas = null;
function buildAtlas() {
  if (atlas) return atlas;
  const W = 256, RH = 64, H = RH * 8;
  const out = new Uint8Array(W * H * 4);
  const hash = (n) => { const x = Math.sin(n * 91.7 + 13.1) * 43758.5453; return x - Math.floor(x); };
  const sat = (x) => Math.min(1, Math.max(0, x));
  const width = (k, u) => {
    // half-width (0..1 of the card height) along the feather, root u = 0 .. tip u = 1
    const s = Math.sin(Math.PI * Math.min(1, u * 1.04 + 0.02));
    if (k === 0) return 0.9 * Math.pow(Math.max(0, s), 0.55) * (0.55 + 0.45 * u);       // primary
    if (k === 1) return 0.95 * Math.pow(Math.max(0, s), 0.45);                            // broad secondary
    if (k === 2) return 0.75 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, u * 0.98 + 0.02))), 0.8) * (0.5 + 0.5 * (1 - u * 0.4)); // plume
    const notch = u > 0.82 ? 1 - 0.7 * Math.sin(Math.PI * (u - 0.82) / 0.18) * 0.6 : 1;   // forked tip
    return 0.9 * Math.pow(Math.max(0, s), 0.5) * notch;
  };
  for (let row = 0; row < 8; row++) {
    const k = row & 3, cl = row >= 4;
    for (let j = 0; j < RH; j++) for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W, v = ((j + 0.5) / RH) * 2 - 1;     // v: -1..1 across the card
      const side = v < 0 ? 0.82 : 1;                             // leading vane narrower
      let w = width(k, u) * side;
      // splits in the vane (a few gaps between barbs)
      const seg = Math.floor(u * 11 + (v < 0 ? 0.5 : 0));
      if (hash(seg * 7 + row + (v < 0 ? 31 : 0)) > 0.7) w *= 1 - 0.25 * Math.pow(Math.sin(Math.PI * ((u * 11) % 1)), 2);
      const av = Math.abs(v);
      const px = 2 / RH;
      let cov = sat((w - av) / px + 0.5);
      if (u < 0.03) cov *= u / 0.03;
      const rach = av < 0.07 * (1 - u * 0.6);
      if (rach && u > 0.02 && u < 0.97) cov = 1;
      const barb = 0.62 + 0.38 * Math.sin((u * 70 - av * 22) * (1 + k * 0.1));
      let g = rach ? 1 : barb * (0.75 + 0.25 * (1 - av));
      let b = 0, a = rach ? 1 : 0;
      if (cl) {
        // cloisonné: cells follow the barbs (slanted bands), wires on the cell edges, the outline and the rachis
        const band = u * 9 - av * 2.6;
        const cell = Math.floor(band) + (v < 0 ? 100 : 0);
        const f = band - Math.floor(band);
        b = hash(cell * 3.7 + row);
        const wire = f < 0.12 || f > 0.94 || (w - av) < 0.11 || rach;
        a = wire ? 1 : 0;
        g = 0.75 + 0.25 * Math.sin(f * Math.PI);                // enamel pooled in the middle of each cell
      }
      const o = ((row * RH + j) * W + i) * 4;
      out[o] = Math.round(cov * 255); out[o + 1] = Math.round(sat(g) * 255); out[o + 2] = Math.round(b * 255); out[o + 3] = Math.round(a * 255);
    }
  }
  atlas = { data: out, W, H };
  return atlas;
}

const VERT = /* glsl */`
attribute vec4 aCard;          // row (feather shape + style), index, side, open 0..1
uniform float uVm;
uniform mat4 vmProj;
varying vec2 vUv;
varying vec4 vCard;
void main() {
  vUv = uv; vCard = aCard;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  if (uVm > 0.5) { gl_Position = vmProj * mv; gl_Position.z = gl_Position.z * 0.08 - 0.92 * gl_Position.w; }
  else gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform sampler2D tFeather;
uniform float uTime, uAmt, uStyle, uGlow, uAlpha;
uniform vec3 uCore, uTip, uE0, uE1, uE2, uGold;
${GLSL_NOISE}
varying vec2 vUv;
varying vec4 vCard;
void main() {
  float row = vCard.x;
  vec2 auv = vec2(vUv.x, (row + vUv.y) / 8.0);
  vec4 t = texture2D(tFeather, auv);
  if (t.r < 0.01) discard;
  float u = vUv.x;
  float flow = texture2D(tNoise, vec2(u * 1.5 - uTime * 0.4 + vCard.y * 0.37, vUv.y * 0.5 + vCard.z * 0.5)).r;
  float k = uAmt * vCard.w;
  if (uStyle < 0.5) {
    vec3 c = mix(uCore, uTip, smoothstep(0.0, 0.45, u));
    c *= (0.35 + 0.65 * t.g) * (0.6 + 0.7 * flow);
    c += uCore * t.a * 0.5 * (1.0 - u);                      // white-hot rachis near the root
    float edgeFade = smoothstep(1.0, 0.82, u);
    gl_FragColor = vec4(c * t.r * k * uGlow * edgeFade, 0.0);
  } else {
    vec3 en = t.b < 0.33 ? uE0 : (t.b < 0.66 ? uE1 : uE2);
    en *= t.g * (0.8 + 0.4 * flow) * uGlow;
    vec3 gold = uGold * (0.8 + 0.6 * flow);
    vec3 c = mix(en, gold, t.a);
    float a = t.r * k * uAlpha;
    gl_FragColor = vec4(c * a, a * mix(1.0, 0.55, t.g * (1.0 - t.a) * step(uAlpha, 0.9)));   // thin enamel lets the world through
  }
}`;

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _o = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _w = new THREE.Vector3();
const D = Math.PI / 180;
const GUARD_PTS = [[0, 0], [1, 0], [1, 0.5], [1, -0.5], [0.4, 0], [0.7, 0]];   // root, tip, tip corners, mid points
const _pr = GUARD_PTS.map(() => new THREE.Vector3());

class Wing {
  constructor(wings, parent, o) {
    this.wings = wings;
    this.kit = wings.kit;
    const q = this.kit.quality;
    const maxN = q === 'low' ? 3 : q === 'medium' ? 5 : 7;
    this.n = Math.max(2, Math.min(o.count ?? 7, maxN));
    this.full = o.count ?? 7;
    this.sides = o.side === 'L' ? [-1] : o.side === 'R' ? [1] : [-1, 1];
    this.vm = !!o.vm;
    this.preset = o.preset || (this.vm ? 'vm' : 'back');
    this.scale = o.scale ?? (this.preset === 'back' ? 3.2 : 1);
    this.spacing = (o.spacing ?? 15) * D * (this.full - 1) / Math.max(1, this.n - 1);   // fewer cards cover the same fan
    this.sweep = (o.sweep ?? 25) * D;
    this.style = o.style === 'cloisonne' ? 1 : 0;
    this.shape = o.shape ?? 0;
    this.target = o.open === false ? 0 : 1; this.from = 0; this.openT = 0; this.openDur = o.openDur ?? 0.25;
    this.glow = 1; this.t = 0; this.guard = { '-1': 1, '1': 1 };
    this.anchors = o.anchors || {};
    // first person: optional per-side fan directions in the parent's frame { L: { a, o }, R: { a, o } } (a = innermost
    // card, o = the direction the fan opens towards) and the guard's floor (how far a side may shrink)
    this.fan = o.fan || null; this.guardMin = o.guardMin ?? 0.35;
    const cnt = this.n * this.sides.length;
    const geo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
    const card = new Float32Array(cnt * 4);
    let c = 0;
    for (const s of this.sides) for (let i = 0; i < this.n; i++, c++) { card[c * 4] = (this.style ? 4 : 0) + ((this.shape + (i === this.n - 1 ? 0 : i % 2)) & 3); card[c * 4 + 1] = i; card[c * 4 + 2] = s; card[c * 4 + 3] = 0; }
    this.cardAttr = new THREE.InstancedBufferAttribute(card, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCard', this.cardAttr);
    this.u = {
      tFeather: wings.tex, tNoise: this.kit.noise, uTime: this.kit.time, uAmt: { value: 1 }, uStyle: { value: this.style }, uGlow: { value: 1 },
      uAlpha: { value: o.alpha ?? 0.92 }, uVm: { value: this.vm ? 1 : 0 }, vmProj: materialUniforms.vmProj,
      uCore: { value: hdr(o.core ?? [1.7, 1.45, 1.05]) }, uTip: { value: hdr(o.tip ?? [1.9, 0.6, 0.16]) }, uGold: { value: hdr(o.gold ?? [2.6, 1.7, 0.55]) },
      uE0: { value: hdr(o.enamel?.[0] ?? [0.1, 0.9, 1.0]) }, uE1: { value: hdr(o.enamel?.[1] ?? [1.4, 0.18, 0.12]) }, uE2: { value: hdr(o.enamel?.[2] ?? [0.15, 0.45, 1.3]) },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    this.mesh = new THREE.InstancedMesh(geo, mat, cnt);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = this.vm ? 44 : 26;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    parent.add(this.group);
    this.parent = parent;
    this.alive = true;
    this.update(0);
  }

  /** Spread the wing (0.25 s easeOutBack, 20 ms stagger). */
  openWing(dur = 0.25) { if (this.target !== 1) { this.target = 1; this.openDur = dur; this.openT = 0; } return this; }
  /** Fold the wing (cards collapse onto the innermost one). */
  close(dur = 0.2) { if (this.target !== 0) { this.target = 0; this.from = 1; this.openDur = dur; this.openT = 0; } return this; }
  /** Colours / glow (ready state ×1.5). */
  set(o) {
    if (o.core) hdr(o.core, 1, this.u.uCore.value); if (o.tip) hdr(o.tip, 1, this.u.uTip.value); if (o.gold) hdr(o.gold, 1, this.u.uGold.value);
    if (o.enamel) o.enamel.forEach((e, i) => hdr(e, 1, this.u['uE' + i].value));
    if (o.glow !== undefined) this.glow = o.glow;
    return this;
  }
  /** Light dust shed from the feather tips (§2 M03: 羽緣灑光塵 MOTE ×16). */
  sparkle(count = 16) {
    const P = this.kit.fx.particles;
    const cam = this.kit.game.camera;
    this.group.updateMatrixWorld(true);
    const c = this.u.uTip.value;
    for (let k = 0; k < count; k++) {
      const idx = (Math.random() * this.mesh.count) | 0;
      this.mesh.getMatrixAt(idx, _m);
      _v.set(0.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4, 0).applyMatrix4(_m).applyMatrix4(this.mesh.matrixWorld);
      if (this.vm) _v.applyMatrix4(cam.matrixWorldInverse);
      const s = this.vm ? 0.004 : 0.03 * this.scale / 3.2;
      P.spawn({ vm: this.vm, additive: true, x: _v.x, y: _v.y, z: _v.z, vx: (Math.random() - 0.5) * 0.1 * (this.vm ? 1 : 6), vy: (this.vm ? 0.05 : 0.4) * Math.random(), vz: (Math.random() - 0.5) * 0.1,
        life: 0.5 + Math.random() * 0.5, size: s * (1 + Math.random()), color: [c.x * 1.5, c.y * 1.5, c.z * 1.5, 1], color1: [c.x * 0.5, c.y * 0.5, c.z * 0.5, 0], frame: FRAME.glint, gravity: this.vm ? 0.05 : 0.4, inertia: this.vm ? 0.3 : 0 });
    }
  }
  detach() { if (!this.alive) return; this.alive = false; this.group.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); const i = this.wings.list.indexOf(this); if (i >= 0) this.wings.list.splice(i, 1); }

  // frame of a side: base direction a (innermost card), outward direction o; cards rotate from a towards o
  _frame(s, a, o) {
    if (this.preset === 'back') {
      a.set(s * 0.25, 1, 0.35).normalize();     // up, a little out and back
      o.set(s, -0.15, 0.3).normalize();          // outwards, slightly down
    } else if (this.fan?.[s < 0 ? 'L' : 'R']) {
      const f = this.fan[s < 0 ? 'L' : 'R'];
      a.set(...f.a).normalize(); o.set(...f.o).normalize();
    } else {
      // viewmodel: the fan stands roughly face-on to the eye, leaning back `sweep` (25°): innermost card points
      // up, outermost outwards (an edge-on fan would read as a few thin lines from behind the gun)
      a.set(s * 0.1, Math.cos(this.sweep), Math.sin(this.sweep)).normalize();
      o.set(s, -0.05, 0.25).normalize();
    }
  }

  update(dt) {
    this.t += dt;
    this.openT += dt;
    if (!this.parent || (!this.parent.parent && !this.parent.isScene)) { this.detach(); return; }   // gun swapped / owner gone
    let k = 0;
    const cam = this.kit.game.camera;
    for (const s of this.sides) {
      this._frame(s, _a, _o);
      // orthonormal fan basis: a, b (in the plane, towards o), n (card normal)
      _n.crossVectors(_a, _o).normalize();
      const b = _v.crossVectors(_n, _a).normalize();
      const anchor = this.anchors[s < 0 ? 'L' : 'R'];
      const g = this.guard[s];
      for (let i = 0; i < this.n; i++, k++) {
        const stag = Math.max(0, this.openT - i * 0.02);
        let e = Math.min(1, stag / this.openDur);
        e = this.target ? easeOutBack(e, 1.4) : this.from * (1 - e) * (1 - e);
        const sway = Math.sin(this.t * 2.2 + i * 0.6) * 0.04;
        const th = (i * this.spacing) * e + sway;
        const len = 0.22 * Math.pow(1.12, i * (this.full - 1) / Math.max(1, this.n - 1)) * this.scale * (0.35 + 0.65 * Math.max(0, e)) * g;
        const wid = (0.05 + 0.02 * i / Math.max(1, this.n - 1)) * this.scale * g;
        const dir = _s.copy(_a).multiplyScalar(Math.cos(th)).addScaledVector(b, Math.sin(th));
        _m.makeBasis(dir, _w.crossVectors(_n, dir), _n);
        _m.scale(_s.set(len, wid, 1));
        if (anchor) _m.setPosition(anchor.x, anchor.y, anchor.z); else _m.setPosition(0, 0, 0);
        this.mesh.setMatrixAt(k, _m);
        this.cardAttr.array[k * 4 + 3] = Math.max(0, Math.min(1, e * 1.5)) * (this.target ? 1 : Math.max(0, e));
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cardAttr.needsUpdate = true;
    this.u.uGlow.value = this.glow;
    // first person: keep every tip out of the central 20 % of the screen (shrink that side, recover slowly)
    if (this.vm) {
      this.group.updateMatrixWorld(true);
      const P = materialUniforms.vmProj.value;
      k = 0;
      for (const s of this.sides) {
        let hit = false, area = 0;
        for (let i = 0; i < this.n; i++, k++) {
          this.mesh.getMatrixAt(k, _m);
          _m.premultiply(this.mesh.matrixWorld).premultiply(cam.matrixWorldInverse);
          const pr = _pr;
          for (let j = 0; j < 6; j++) pr[j].set(GUARD_PTS[j][0], GUARD_PTS[j][1], 0).applyMatrix4(_m).applyMatrix4(P);
          for (const q of [pr[1], pr[4], pr[5]]) if (Math.abs(q.x) < 0.2 && Math.abs(q.y) < 0.2) hit = true;   // keep the centre clean (§1.14)
          // card ≈ triangle root -> tip corners (NDC area / 4 = screen fraction)
          area += Math.abs((pr[2].x - pr[0].x) * (pr[3].y - pr[0].y) - (pr[3].x - pr[0].x) * (pr[2].y - pr[0].y)) / 8;
        }
        const lim = 0.125 / (this.sides.length === 1 ? 0.5 : 1), big = area > lim;
        // hysteresis: regrow only well inside the limits (no pumping between shrink and regrow)
        if (hit || big) this.guard[s] = Math.max(this.guardMin, this.guard[s] * 0.94);
        else if (area < lim * 0.8) this.guard[s] = Math.min(1, this.guard[s] + dt * 0.3);
      }
    }
  }
}

export class Wings {
  constructor(kit) {
    this.kit = kit;
    this.list = [];
    const { data, W, H } = buildAtlas();
    const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
    this.tex = { value: t };
    // precompile the wing program with a hidden instance
    const pre = new Wing(this, kit.game.scene, { count: 2, side: 'R' });
    pre.group.visible = false;
  }

  /**
   * Attach a pair (or one side) of feather fans to any Object3D. opts: vm (first-person projection), side
   * ('both' | 'L' | 'R'), preset ('vm' | 'back'), anchors { L: Vector3, R: Vector3 } (local positions on the
   * parent), count (cards per side, 5–7), spacing (deg), sweep (deg), scale (1 vm; 3.2 back), style ('glow' |
   * 'cloisonne'), shape (0–3 feather silhouette), core / tip (HDR, glow style), enamel [c0, c1, c2] + gold
   * (cloisonné), open (false = start folded), alpha (cloisonné enamel opacity, default 0.92; lower = the world
   * shows through the cells), fan { L: { a, o }, R: { a, o } } (first person: innermost-card and opening directions
   * in the parent's frame, e.g. to keep a fan above the crosshair), guardMin (centre guard floor, 0.35). Returns a Wing { openWing(dur), close(dur), set(o), sparkle(n),
   * detach(), glow }.
   */
  attach(parent, opts = {}) {
    const w = new Wing(this, parent, opts);
    this.list.push(w);
    return w;
  }

  /**
   * First-person wings on the current viewmodel gun: S_wingL / S_wingR sockets when the model has them, else
   * flanks of the receiver taken from the gun's bounds. Detached automatically when the gun is swapped.
   */
  vm(opts = {}) {
    const vm = this.kit.game.vm;
    const w = vm?.weapon;
    if (!w) return null;
    const anchors = {};
    const box = w.box || new THREE.Box3().setFromObject(w.root);
    for (const [k, s] of [['L', -1], ['R', 1]]) {
      const sk = w.socket('wing' + k);
      anchors[k] = sk ? sk.pos.clone() : new THREE.Vector3(s > 0 ? box.max.x : box.min.x, box.max.y * 0.7, (box.min.z + box.max.z) * 0.5 + 0.05);
    }
    return this.attach(w.root, { vm: true, anchors, scale: w.has('wingR') ? 1 : 0.7, ...opts });
  }

  update(dt) { for (let i = this.list.length - 1; i >= 0; i--) this.list[i].update(dt); }
  clear() { for (const w of [...this.list]) w.detach(); }
}
