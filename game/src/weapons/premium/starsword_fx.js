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
// The colossal sword is the weapon itself, scaled up (its silhouette must read as THIS sword from 30 m): unit geometry
// (size 1 = 1 m), tip at the origin pointing -Y, pommel at +1.0, built from the model's own mm laws (blade outline
// with the root ears, the percussion swell and the angled leaf point; width x1.35 / thickness x1.5 so it reads at
// distance). Zones (per-vertex aTint over the ghost's deep-blue glaze): the 星河 channel down both flats as its own
// emissive strip with star beads, the seven 北斗 studs, the 如意 cloud-head guard (glaze body, gold piping round the
// silhouette, gold curls in the lobes), the 天樞 gem burning white-blue, a dark grip between gold ferrules, the
// octagonal 斗 pommel with gold ridges. ≈ 3k triangles.
const MM = 1 / 1495, SX = 1.35 * MM, SZ = 1.5 * MM, TIPT = 1150;
const yOf = (t) => (TIPT - t) * MM;
function hsHalfWidth(t) {
  if (t >= 990) { const u = Math.min(1, (t - 990) / 160); return 57 * (1 - u) * (1 + 0.6 * u * (1 - u)); }
  if (t >= 760) return 64 - 7 * (1 - Math.cos(Math.PI * (t - 760) / 230)) / 2;
  if (t >= 215) return 60.6 + 3.4 * Math.sin(Math.PI / 2 * (t - 215) / 545);
  const ear = t < 88 ? 0 : t < 99 ? Math.sin(Math.PI / 2 * (t - 88) / 11) : Math.pow(1 - Math.min(1, Math.max(0, (t - 99) / 39)), 1.4);
  return 61 + 5.5 * ear;
}
export function heavenSwordGeometry() {
  const P = [], N = [], T = [], I = [];
  const GOLD = [0.78, 0.45, 0.09, 0.65], RIVER = [0.3, 0.55, 2.6, 0.95], STAR = [2.6, 2.5, 2.1, 1], GEM = [1.6, 2.2, 3.6, 1], NONE = [0, 0, 0, 0], GRIP = [0.03, 0.035, 0.07, 0.85];
  const push = (geo, col) => {
    if (geo.index) geo = geo.toNonIndexed();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const o = P.length / 3, p = geo.attributes.position, n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); T.push(...(typeof col === 'function' ? col(p.getX(i), p.getY(i), p.getZ(i)) : col)); I.push(o + i); }
  };
  // mm (s across, t along, w thick) -> unit, keeping the winding (two mirrored axes)
  const fromMM = (g) => { g.scale(SX, -MM, -SZ); g.translate(0, TIPT * MM, 0); return g; };
  // ---- blade: a lofted section (edge, bevel, flat, a low spine) from the root ears to the angled point
  {
    const ts = [48, 70, 88, 94, 99, 110, 125, 138, 170, 215, 300, 420, 540, 660, 760, 840, 920, 990, 1010, 1035, 1060, 1085, 1110, 1130, 1150];
    const pos = [], idx = [], R = 12;
    for (const t of ts) {
      const hw = Math.max(0.5, hsHalfWidth(t)), th = t > 920 ? 1 + 4.2 * Math.pow(Math.max(0, 1 - (t - 920) / 230), 0.8) : 5.4;
      const sec = [[hw, 0], [hw - Math.min(10, hw * 0.4), th * 0.55], [hw * 0.55, th], [0, th * 1.08], [-hw * 0.55, th], [-hw + Math.min(10, hw * 0.4), th * 0.55]];
      const ring = [...sec, [-hw, 0], ...sec.slice(1).reverse().map(([s, w]) => [s, -w])].slice(0, R);
      for (const [s, w] of ring) pos.push(s * SX, yOf(t), w * SZ);
    }
    for (let i = 0; i + 1 < ts.length; i++) for (let j = 0; j < R; j++) { const a = i * R + j, b = i * R + (j + 1) % R, c = a + R, d = b + R; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const ng = g.toNonIndexed(); ng.computeVertexNormals();
    push(ng, NONE);
  }
  // ---- the 星河 channel: an emissive strip proud of each flat (t 228 -> 880, tapering), star beads down its middle
  {
    const ts = []; for (let t = 228; t <= 880; t += 40) ts.push(t);
    for (const sd of [1, -1]) {
      const pos = [], idx = [];
      ts.forEach((t) => { const c = (12 - 5 * (t - 228) / 652) * 1.25, w = 5.4 * 1.1 * sd; pos.push(c * SX, yOf(t), w * SZ, -c * SX, yOf(t), w * SZ); });
      for (let i = 0; i + 1 < ts.length; i++) { const a = i * 2; sd > 0 ? idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) : idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(ts.flatMap(() => [0, 0, sd, 0, 0, sd]), 3));
      g.setIndex(idx);
      push(g, RIVER);
      for (let t = 260; t < 870; t += 47) {
        const b = new THREE.OctahedronGeometry(3.4 * MM * 1.6, 0); b.scale(1, 1.6, 0.5);
        b.translate((((t * 7) % 9) - 4.5) * SX, yOf(t), sd * 6.4 * SZ);
        push(b, STAR);
      }
    }
  }
  // ---- 北斗七星 studs on both flats (gold bezel discs + a bright core)
  for (const [s, t, k] of [[24, 262, 1.15], [-25, 338, 1], [-22, 440, 1], [21, 478, 1], [21, 596, 1], [-21, 706, 1], [19, 826, 1.05]]) for (const sd of [1, -1]) {
    const bz = new THREE.CylinderGeometry(8.2 * k * SX, 8.2 * k * SX, 1.6 * SZ, 10, 1); bz.rotateX(Math.PI / 2); bz.translate(s * SX, yOf(t), sd * 6.0 * SZ);
    push(bz, GOLD);
    const core = new THREE.SphereGeometry(4.2 * k * SX, 6, 3); core.scale(1, 1, 0.6); core.translate(s * SX, yOf(t), sd * 7.0 * SZ);
    push(core, STAR);
  }
  // ---- 如意 cloud-head guard (mm outline, right half mirrored): the block, arms rising towards the blade, trefoil heads
  {
    const arc = (cx, cy, r, a0, a1, n = 7) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
    const right = [[0, -11], [42, -11], [50, 4], [62, 6], [86, 11], [108, 18], [126, 25], ...arc(160, 37, 12, -150, 10), ...arc(161, 58, 13.5, -40, 95), ...arc(137, 65, 15, 15, 175, 8),
      [124, 52], [108, 44], [86, 36], [62, 30], [54, 44], [48, 54], [22, 55], [0, 60]];
    const outline = [...right, ...right.slice(1, -1).reverse().map(([s, t]) => [-s, t])];
    const shape = new THREE.Shape(outline.map(([s, t]) => new THREE.Vector2(s, t)));
    const body = new THREE.ExtrudeGeometry(shape, { depth: 30, bevelEnabled: true, bevelThickness: 4, bevelSize: 3, bevelSegments: 1, curveSegments: 4 });
    body.translate(0, 0, -15); body.deleteAttribute('uv');
    push(fromMM(body), NONE);
    // gold piping: a band just inside the silhouette on both faces (the outline offset along its own normals)
    const n = outline.length, area = outline.reduce((a, [x, y], i) => { const [x2, y2] = outline[(i + 1) % n]; return a + x * y2 - x2 * y; }, 0), ccw = area > 0 ? 1 : -1;
    const inner = outline.map(([x, y], i) => {
      const [x0, y0] = outline[(i + n - 1) % n], [x1, y1] = outline[(i + 1) % n];
      let nx = -(y1 - y0) * ccw, ny = (x1 - x0) * ccw; const l = Math.hypot(nx, ny) || 1;   // inward normal (left of a CCW loop)
      return [x + nx / l * 4.5, y + ny / l * 4.5];
    });
    for (const sd of [1, -1]) {
      const pos = [], idx = [];
      for (let i = 0; i < n; i++) { pos.push(outline[i][0], outline[i][1], sd * 19.6, inner[i][0], inner[i][1], sd * 19.6); }
      for (let i = 0; i < n; i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      push(fromMM(g), GOLD);
      // gold curls in the three lobes of each head
      for (const f of [1, -1]) for (const [cx, cy, r] of [[160, 37, 6], [161, 58, 7], [137, 65, 8]]) {
        const c = new THREE.TorusGeometry(r, 1.6, 3, 10, Math.PI * 1.5); c.translate(f * cx, cy, sd * 19.5); c.deleteAttribute('uv');
        push(fromMM(c), GOLD);
      }
    }
    // the 天樞 gem: a faceted stone burning star white-blue in a gold bezel
    const gem = new THREE.OctahedronGeometry(1, 1); gem.scale(20 * SX, 20 * MM, 28 * SZ); gem.translate(0, yOf(22), 0);   // proud of both faces
    push(gem, GEM);
    for (const sd of [1, -1]) { const bez = new THREE.TorusGeometry(19, 3, 4, 16); bez.translate(0, 22, sd * 20); bez.deleteAttribute('uv'); push(fromMM(bez), GOLD); }
  }
  // ---- grip (dark, gold ferrules and a mid collar) + the octagonal 斗 pommel with gold ridges
  {
    const lathe = (pts, seg) => { const g = new THREE.LatheGeometry(pts.map(([r, t]) => new THREE.Vector2(r, t)), seg); g.deleteAttribute('uv'); return g; };
    const tOf = (y) => TIPT - y / MM;
    // (colours are per vertex: every band edge gets a ring of its own so the ferrules stay crisp, not smeared)
    const grip = lathe([[0, -266], [21, -266], [19, -259], [18.2, -255], [18, -250], [18, -170], [18.4, -167], [19.5, -158], [18.4, -149], [18, -146], [18, -58], [19, -54], [20.5, -50], [22, -40], [0, -40]], 10);
    push(fromMM(grip), (x, y) => { const t = tOf(y); return t > -55 || t < -254 || Math.abs(t + 158) < 10 ? GOLD : GRIP; });
    const pom = lathe([[0, -346], [30, -340], [38, -322], [34, -284], [26, -264], [0, -264]], 8);
    push(fromMM(pom), (x, y) => { const t = tOf(y); return t > -270 || t < -332 ? GOLD : NONE; });
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
// is the blade's leading angle: the band is lit behind it over uSpan, a white-hot leading edge and outer cutting
// line, star blue cooling to violet in the wake with stars twinkling inside; every edge is feathered (the start and
// end of the sweep over 15 %, inner and outer rims) -- a sheet of light, never a pale box with hard sides.
const ARC_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ARC_FRAG = /* glsl */`
uniform float uHead, uSpan, uAmt, uTime, uStars;
uniform vec3 uCore, uBody, uEdge;
varying vec2 vUv;
${NOISE}
void main() {
  float behind = uHead - vUv.x;
  if (behind < 0.0 || behind > uSpan) discard;
  float w = behind / uSpan;                                  // 0 at the head .. 1 at the tail
  float y = vUv.y;
  float caps = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
  float band = smoothstep(0.0, 0.35, y) * smoothstep(1.0, 0.9, y);
  float rim = exp(-pow((y - 0.88) * 13.0, 2.0));
  float body = band * (1.0 - w) * (1.0 - w);
  float streak = 0.5 + 0.5 * vn(vec2(vUv.x * 60.0, y * 3.0 - uTime * 2.0));
  vec2 sc = vec2(vUv.x * uStars, y * 7.0), f = fract(sc) - 0.5;
  float h = h21(floor(sc) + 7.0);
  float star = step(0.8, h) * exp(-dot(f, f) * 46.0) * (0.55 + 0.45 * sin(uTime * 9.0 + h * 40.0));
  float lead = exp(-w * 26.0) * smoothstep(0.0, 0.004, behind);   // a thin white-hot leading line, feathered
  vec3 c = mix(uBody, uEdge, w) * body * streak * 0.35 + uCore * rim * (1.0 - w * 0.8) * 1.5 * band + uCore * lead * band * 1.4
    + vec3(1.0, 0.97, 0.86) * star * band * (1.0 - w * 0.6) * 2.4;
  gl_FragColor = vec4(c * uAmt * caps * smoothstep(1.0, 0.7, w), 1.0);
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
    uniforms: { uHead: { value: 0 }, uSpan: { value: 0.3 }, uAmt: { value: 1 }, uTime: materialUniforms.time, uStars: { value: Math.max(8, Math.round(arc * r1 * 1.3)) },
      uCore: { value: new THREE.Vector3(3.0, 3.3, 4.0) }, uBody: { value: new THREE.Vector3(0.45, 0.9, 2.4) }, uEdge: { value: new THREE.Vector3(1.4, 0.45, 2.0) } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return mesh;
}
