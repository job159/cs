// 星河．斬嶽 — procedural FX pieces (docs/PREMIUM_WEAPONS.md §2.29): the projected giant blade drawn in the
// viewmodel layer (橫天), the travelling 星痕 wave front and its glowing ground cracks, the star-cut kill streak
// (KE_STARCUT) and the colossal 天劍 spirit sword geometry (fx.summons.ghost, ≤ 3k tris, per-vertex glaze tints).
// Everything is built once per game and reused; colours are HDR linear.
import * as THREE from 'three';
import { materialUniforms } from '../../gfx/materials.js';

const NOISE = /* glsl */`
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }`;

// ------------------------------------------------------------------------------------------ 橫天 giant blade (vm)
// A flat leaf blade in the sword's own plane (gun space: blade axis +Y from the collar, width along Z = -s): a white
// core line, star-blue body, nebula-violet edges, star sparks drifting up the blade, a soft outer glow skirt. Drawn
// additively with the viewmodel projection (it rides on the posed gun). uLen scales its length (m), uAmt fades.
const GIANT_VERT = /* glsl */`
uniform mat4 vmProj;
uniform float uLen, uWid;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  p.y *= uLen; p.z *= uWid;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = vmProj * mv; gl_Position.z = gl_Position.z * 0.08 - 0.92 * gl_Position.w;
}`;
const GIANT_FRAG = /* glsl */`
uniform float uAmt, uTime, uHit, uLen;
uniform vec3 uCore, uBody, uEdge;
varying vec2 vUv;
${NOISE}
void main() {
  float x = abs(vUv.x * 2.0 - 1.0), y = vUv.y;              // x: 0 centre line .. 1 outer skirt; y: 0 root .. 1 tip
  float body = smoothstep(1.0, 0.62, x);
  float core = exp(-x * x * 60.0);
  float flow = vn(vec2(vUv.x * 9.0, y * uLen * 2.2 - uTime * 3.4)) * vn(vec2(vUv.x * 21.0 + 3.0, y * uLen * 5.0 - uTime * 6.0));
  float sparks = step(0.93, h21(floor(vec2(vUv.x * 40.0, y * uLen * 14.0 - uTime * 9.0)))) * body;
  vec3 c = mix(uEdge, uBody, smoothstep(0.85, 0.35, x)) * (0.35 + 1.1 * flow) * body + uCore * core * 1.6 + vec3(1.0, 0.96, 0.86) * sparks * 2.0;
  c += uEdge * smoothstep(1.0, 0.75, x) * (1.0 - body) * 0.6;   // soft skirt beyond the cutting line
  float fadeRoot = smoothstep(0.0, 0.1, y) * (0.55 + 0.45 * smoothstep(0.1, 0.25, y)), fadeTip = smoothstep(1.0, 0.82, y);
  gl_FragColor = vec4(c * uAmt * (1.0 + uHit * 0.8) * fadeRoot * fadeTip, 1.0);
}`;
/** leaf outline (x across 0..1, y along 0..1) as a strip mesh: the giant blade, length 1 m, width 0.28 m (scaled by uniforms) */
export function giantBlade() {
  const N = 40, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const v = i / N;
    // half width: hugging the steel blade at the collar, swelling over the first 18 %, then the leaf point (skirt
    // included: x = 1 is the outer glow edge) -- never a wide slab right in front of the eye
    const sw = v < 0.18 ? 0.42 + 0.58 * Math.sin((v / 0.18) * Math.PI / 2) : 1 - 0.18 * (v - 0.18);
    const hw = 0.5 * (v < 0.78 ? sw : (1 - 0.18 * 0.6) * Math.pow(Math.max(0, 1 - Math.pow((v - 0.78) / 0.22, 1.6)), 0.6));
    for (let j = 0; j <= 4; j++) {
      const u = j / 4, s = (u - 0.5) * 2 * hw;
      pos.push(0, v, -s); uv.push(u, v);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < 4; j++) { const a = i * 5 + j, b = a + 1, c = a + 5, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    vertexShader: GIANT_VERT, fragmentShader: GIANT_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { vmProj: materialUniforms.vmProj, uLen: { value: 1 }, uWid: { value: 0.3 }, uAmt: { value: 0 }, uTime: materialUniforms.time, uHit: { value: 0 },
      uCore: { value: new THREE.Vector3(3.2, 3.5, 4.2) }, uBody: { value: new THREE.Vector3(0.55, 1.1, 2.8) }, uEdge: { value: new THREE.Vector3(1.5, 0.5, 2.4) } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 30;
  mesh.visible = false;
  return mesh;
}

// ------------------------------------------------------------------------------------------ 星痕 wave front (world)
// A curved fin of light standing on the ground, open at the back: white hot base line, blue body, violet crest,
// streaks rising. Unit size: 1 m wide (x), 1 m tall (y), bowing forward (-z) at the middle; scaled per wave.
const WAVE_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WAVE_FRAG = /* glsl */`
uniform float uAmt, uTime, uSeed;
uniform vec3 uCore, uBody, uEdge;
varying vec2 vUv;
${NOISE}
void main() {
  float x = abs(vUv.x * 2.0 - 1.0), y = vUv.y;
  float side = smoothstep(1.0, 0.55, x);
  float base = exp(-y * 9.0);
  float streak = vn(vec2(vUv.x * 18.0 + uSeed, y * 3.0 - uTime * 5.0));
  float crest = smoothstep(0.25, 0.75, y) * smoothstep(1.0, 0.7, y);
  float body = (1.0 - y) * (1.0 - y) * (0.2 + 0.6 * streak);
  vec3 c = uCore * base * 1.6 + mix(uBody, uEdge, smoothstep(0.2, 0.9, y)) * body + uCore * crest * streak * 0.25;
  gl_FragColor = vec4(c * side * uAmt * smoothstep(1.0, 0.85, y), 1.0);
}`;
let _waveGeo = null;
export function waveGeometry() {
  if (_waveGeo) return _waveGeo;
  const NX = 16, NY = 6, pos = [], uv = [], idx = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const u = i / NX, v = j / NY, x = (u - 0.5);
    // bows forward at the middle and leans forward near the crest (a breaking wave of light)
    const z = -0.32 * (1 - 4 * x * x) - 0.25 * v * v;
    pos.push(x, v, z); uv.push(u, v);
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return (_waveGeo = g);
}
export function waveMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: WAVE_VERT, fragmentShader: WAVE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uAmt: { value: 1 }, uTime: materialUniforms.time, uSeed: { value: Math.random() * 10 },
      uCore: { value: new THREE.Vector3(2.6, 2.9, 3.6) }, uBody: { value: new THREE.Vector3(0.5, 1.0, 2.6) }, uEdge: { value: new THREE.Vector3(1.4, 0.5, 2.2) } },
  });
}

// ------------------------------------------------------------------------------------------ glowing ground cracks
// Jagged flat ribbons on the ground in a local frame (x across, z along -dir from the origin): a main fissure
// along the path plus forks. aAt = distance along the path (m): the shader lights each piece once the wave has
// passed it (uFront), then cools from white-blue to violet embers and fades (uFade).
const CRACK_VERT = /* glsl */`
attribute float aAt;
attribute float aW;
varying float vAt;
varying float vW;
void main() { vAt = aAt; vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CRACK_FRAG = /* glsl */`
uniform float uFront, uFade, uTime;
uniform vec3 uHot, uCool;
varying float vAt;
varying float vW;
void main() {
  float lit = smoothstep(0.0, 0.4, uFront - vAt);
  float age = clamp((uFront - vAt) / 6.0, 0.0, 1.0);
  float edge = 1.0 - abs(vW);
  vec3 c = mix(uHot, uCool, age) * edge * edge;
  float flick = 0.85 + 0.15 * sin(uTime * 11.0 + vAt * 7.0);
  gl_FragColor = vec4(c * lit * uFade * flick, 1.0);
}`;
export function crackMesh(rng, len, width = 1.2) {
  const pos = [], at = [], wv = [], idx = [];
  const ribbon = (pts, w0, w1) => {
    // pts: [x, z, along] polyline; flat ribbon of half width w (tapering)
    const o = pos.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const [x, z, a] = pts[i], [x2, z2] = pts[Math.min(pts.length - 1, i + 1)], [x0, z0] = pts[Math.max(0, i - 1)];
      let dx = x2 - x0, dz = z2 - z0; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const w = w0 + (w1 - w0) * (i / (pts.length - 1));
      pos.push(x - dz * w, 0, z + dx * w, x + dz * w, 0, z - dx * w);
      at.push(a, a); wv.push(-1, 1);
    }
    for (let i = 0; i + 1 < pts.length; i++) { const a = o + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  };
  // main fissure: zig-zag along -z
  const main = [];
  let x = 0;
  for (let d = 0; d <= len; d += 0.35) { x += (rng() - 0.5) * 0.28; x *= 0.9; main.push([x, -d, d]); }
  ribbon(main, 0.07, 0.03);
  // forks: short jagged branches off the main line, out to `width`
  for (let k = 0; k < Math.floor(len * 1.6); k++) {
    const i = 1 + Math.floor(rng() * (main.length - 2)), [mx, mz, ma] = main[i], side = rng() < 0.5 ? -1 : 1;
    const pts = [[mx, mz, ma]], n = 3 + Math.floor(rng() * 3);
    let px = mx, pz = mz;
    for (let j = 1; j <= n; j++) { px += side * (0.12 + rng() * 0.22) * (width / 1.2); pz += (rng() - 0.6) * 0.25; pts.push([px, pz, ma + j * 0.08]); }
    ribbon(pts, 0.035, 0.008);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAt', new THREE.Float32BufferAttribute(at, 1));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(wv, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    vertexShader: CRACK_VERT, fragmentShader: CRACK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    uniforms: { uFront: { value: 0 }, uFade: { value: 1 }, uTime: materialUniforms.time, uHot: { value: new THREE.Vector3(4.2, 5.0, 7.0) }, uCool: { value: new THREE.Vector3(1.6, 0.5, 2.6) } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return mesh;
}

// ------------------------------------------------------------------------------------------ KE_STARCUT streak
// A thin bright cut line (camera-facing ribbon) across the body along the blow's direction; the shader draws a
// white core with a star-blue halo that sweeps in from one end (uT 0 -> 1) and then fades.
const CUT_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CUT_FRAG = /* glsl */`
uniform float uT, uFade;
uniform vec3 uCore, uHalo;
varying vec2 vUv;
void main() {
  float y = abs(vUv.y * 2.0 - 1.0);
  float reveal = smoothstep(uT * 1.25, uT * 1.25 - 0.25, vUv.x);
  float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  vec3 c = uCore * exp(-y * y * 40.0) + uHalo * exp(-y * y * 5.0) * 0.6;
  gl_FragColor = vec4(c * reveal * ends * uFade, 1.0);
}`;
let _cutGeo = null;
export function cutMesh() {
  if (!_cutGeo) _cutGeo = new THREE.PlaneGeometry(1, 1, 8, 1).translate(0.5, 0, 0);
  const m = new THREE.ShaderMaterial({
    vertexShader: CUT_VERT, fragmentShader: CUT_FRAG, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uFade: { value: 1 }, uCore: { value: new THREE.Vector3(6, 6.4, 7) }, uHalo: { value: new THREE.Vector3(1.2, 1.8, 4.4) } },
  });
  const mesh = new THREE.Mesh(_cutGeo, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 26;
  return mesh;
}

// ------------------------------------------------------------------------------------------ 天劍 spirit sword
// Unit geometry (metres at size 1 = 1 m): tip at the origin pointing -Y, pommel at +1.0. The blade (0 .. 0.74) is a
// lofted diamond section with a raised spine; the cloud-head guard, the grip and the pommel ride above it. aTint
// paints the guard / pommel gold, the spine white-hot, the seven star sockets pale. ≈ 2.4k triangles.
export function heavenSwordGeometry() {
  const P = [], N = [], T = [], I = [];
  const tint = (r, g, b, a) => [r, g, b, a];
  const GOLD = tint(1.0, 0.78, 0.36, 0.85), WHITE = tint(0.92, 0.96, 1.0, 0.55), NONE = tint(0, 0, 0, 0), STAR = tint(1.0, 0.95, 0.78, 0.9);
  const push = (geo, col) => {
    const o = P.length / 3, p = geo.attributes.position, n = geo.attributes.normal, ix = geo.index;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); T.push(...(typeof col === 'function' ? col(p.getX(i), p.getY(i), p.getZ(i)) : col)); }
    if (ix) for (let i = 0; i < ix.count; i++) I.push(o + ix.getX(i)); else for (let i = 0; i < p.count; i++) I.push(o + i);
  };
  // blade: stations along y (0 tip .. 0.74 root); section: edge, bevel, flat, spine (x across, z thickness)
  {
    const S = 26, ring = 10, pos = [], idx = [];
    for (let i = 0; i <= S; i++) {
      const u = i / S, y = 0.74 * u;
      const tipU = Math.min(1, u / 0.2), hw = 0.075 * (0.82 + 0.18 * u) * Math.pow(Math.max(0.001, 1 - Math.pow(1 - tipU, 1.7)), 0.6) || 0.0005, th = 0.012 * (0.3 + 0.7 * tipU);
      const sec = [[hw, 0], [hw * 0.72, th * 0.45], [hw * 0.2, th], [0, th * 1.35], [-hw * 0.2, th], [-hw * 0.72, th * 0.45], [-hw, 0], [-hw * 0.72, -th * 0.45], [-hw * 0.2, -th], [0, -th * 1.35]];
      for (const [x, z] of sec) pos.push(x, y, z);
    }
    for (let i = 0; i < S; i++) for (let j = 0; j < ring; j++) { const a = i * ring + j, b = i * ring + (j + 1) % ring, c = a + ring, d = b + ring; idx.push(a, b, c, b, d, c); }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g = g.toNonIndexed(); g.computeVertexNormals();
    push(g, (x, y, z) => (Math.abs(x) < 0.012 ? WHITE : NONE));
  }
  // seven star sockets along the flats (small flattened spheres, both sides)
  const stars = [[0.03, 0.62], [-0.03, 0.56], [-0.028, 0.47], [0.027, 0.44], [0.025, 0.34], [-0.024, 0.25], [0.02, 0.15]];
  for (const [x, y] of stars) for (const sd of [1, -1]) {
    const g = new THREE.SphereGeometry(0.012, 8, 5); g.scale(1, 1, 0.45); g.translate(x, y, sd * 0.012);
    push(g, STAR);
  }
  // guard: a bar with cloud-head lobes at both ends, swept up
  {
    const sh = new THREE.Shape();
    sh.moveTo(-0.05, 0.735); sh.lineTo(0.05, 0.735); sh.quadraticCurveTo(0.12, 0.735, 0.17, 0.77); sh.absarc(0.185, 0.79, 0.03, -2.3, 2.6, false);
    sh.quadraticCurveTo(0.13, 0.79, 0.06, 0.785); sh.lineTo(0, 0.81); sh.lineTo(-0.06, 0.785); sh.quadraticCurveTo(-0.13, 0.79, -0.16, 0.81);
    sh.absarc(-0.185, 0.79, 0.03, 0.54, 5.44, false); sh.quadraticCurveTo(-0.12, 0.735, -0.05, 0.735);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 1, curveSegments: 5 });
    g.translate(0, 0, -0.025); g.deleteAttribute('uv');
    push(g, GOLD);
    const gem = new THREE.SphereGeometry(0.02, 10, 6); gem.scale(1, 1, 1.6); gem.translate(0, 0.77, 0);
    push(gem, STAR);
  }
  // grip + pommel
  {
    const pts = [[0, 0.81], [0.022, 0.81], [0.02, 0.83], [0.017, 0.93], [0.02, 0.945], [0.034, 0.955], [0.03, 0.985], [0.016, 1.0], [0, 1.0]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 10); g.deleteAttribute('uv'); g.computeVertexNormals();
    push(g, (x, y) => (y > 0.94 || y < 0.832 ? GOLD : NONE));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('aTint', new THREE.Float32BufferAttribute(T, 4));
  geo.setIndex(I);
  geo.computeBoundingBox();
  return geo;
}

// ------------------------------------------------------------------------------------------ ARC: swept ring band (world)
// A band round a vertical axis (x/z circle, inner radius r0 at height h0, outer r1 at h1: tilted towards the eye so
// it reads from its centre). uv.x = angle fraction (0 .. arc), uv.y = 0 inner .. 1 outer. uHead (0..1 of the arc)
// is the blade's leading angle: the band is lit behind it over uSpan, white-hot at the head and on the outer edge,
// star blue cooling to violet in the wake.
const ARC_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ARC_FRAG = /* glsl */`
uniform float uHead, uSpan, uAmt, uTime;
uniform vec3 uCore, uBody, uEdge;
varying vec2 vUv;
${NOISE}
void main() {
  float behind = uHead - vUv.x;
  if (behind < 0.0 || behind > uSpan) discard;
  float w = behind / uSpan;                                  // 0 at the head .. 1 at the tail
  float y = vUv.y;
  float rim = smoothstep(0.78, 0.97, y) * smoothstep(1.0, 0.97, y);
  float body = smoothstep(0.0, 0.7, y) * (1.0 - w);
  float streak = 0.6 + 0.4 * vn(vec2(vUv.x * 60.0, y * 3.0 - uTime * 2.0));
  vec3 c = mix(uBody, uEdge, w) * body * streak + uCore * rim * (1.0 - w * 0.7) * 1.6 + uCore * exp(-behind * 90.0) * 0.8;
  gl_FragColor = vec4(c * uAmt * smoothstep(1.0, 0.75, w), 1.0);
}`;
export function arcBand({ r0 = 1.8, r1 = 3.6, h0 = -0.85, h1 = 0.2, arc = Math.PI * 2, seg = 96 } = {}) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = u * arc, s = Math.sin(a), c = Math.cos(a);
    pos.push(s * r0, h0, c * r0, s * r1, h1, c * r1); uv.push(u, 0, u, 1);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    vertexShader: ARC_VERT, fragmentShader: ARC_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uHead: { value: 0 }, uSpan: { value: 0.3 }, uAmt: { value: 1 }, uTime: materialUniforms.time,
      uCore: { value: new THREE.Vector3(3.0, 3.3, 4.0) }, uBody: { value: new THREE.Vector3(0.45, 0.9, 2.4) }, uEdge: { value: new THREE.Vector3(1.4, 0.45, 2.0) } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return mesh;
}
