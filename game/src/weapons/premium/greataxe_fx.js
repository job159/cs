// 刑天．舞戚 — procedural FX pieces (docs/PREMIUM_WEAPONS.md §2.32): the crimson swept arc band (開山 / 狂旋 / 猛志
// sweep), molten ground fissures (開山, 天墜, 猛志), the KE_CLEAVE cut streak, the 天墜 landing marker, the 狂旋 vortex
// round the player, the whirl disc round the thrown 迴戚 and the 猛志 war spirit (a headless glazed-bronze giant: chest
// eyes, a navel mouth, a 干 shield; its axe arm is a separate ghost hinged at the shoulder). Built once per game and
// reused; colours are HDR linear.
import * as THREE from 'three';
import { materialUniforms } from '../../gfx/materials.js';

const NOISE = /* glsl */`
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }`;
const UV_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const additive = (frag, uniforms, o = {}) => new THREE.ShaderMaterial({ vertexShader: o.vert || UV_VERT, fragmentShader: frag, uniforms, transparent: true, depthWrite: false,
  side: THREE.DoubleSide, blending: THREE.AdditiveBlending, ...o.mat });
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------------------------------ sweep band (world)
// A band round a vertical axis (inner radius r0 at h0, outer r1 at h1). uHead (0..1 of the arc) is the blade's leading
// angle: lit behind it over uSpan -- a white-hot leading line, molten crimson body cooling to a dark ember wake, ember
// sparks inside; every edge feathered.
const SWEEP_FRAG = /* glsl */`
uniform float uHead, uSpan, uAmt, uTime, uSparks;
uniform vec3 uCore, uBody, uEdge;
varying vec2 vUv;
${NOISE}
void main() {
  float behind = uHead - vUv.x;
  if (behind < 0.0 || behind > uSpan) discard;
  float w = behind / uSpan, y = vUv.y;
  float caps = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float band = smoothstep(0.0, 0.4, y) * smoothstep(1.0, 0.86, y);
  float rim = exp(-pow((y - 0.85) * 12.0, 2.0));
  float body = band * (1.0 - w) * (1.0 - w);
  float streak = 0.45 + 0.55 * vn(vec2(vUv.x * 70.0, y * 4.0 - uTime * 3.0));
  vec2 sc = vec2(vUv.x * uSparks, y * 6.0), f = fract(sc) - 0.5;
  float h = h21(floor(sc) + 3.0);
  float spark = step(0.82, h) * exp(-dot(f, f) * 40.0) * (0.6 + 0.4 * sin(uTime * 13.0 + h * 50.0));
  float lead = exp(-w * 24.0) * smoothstep(0.0, 0.004, behind);
  vec3 c = mix(uBody, uEdge, w) * body * streak * 0.45 + uCore * rim * (1.0 - w * 0.85) * 1.3 * band + uCore * lead * band * 1.5
    + vec3(1.0, 0.75, 0.4) * spark * band * (1.0 - w * 0.5) * 2.2;
  gl_FragColor = vec4(c * uAmt * caps * smoothstep(1.0, 0.65, w), 1.0);
}`;
export function sweepBand({ r0 = 1.8, r1 = 3.6, h0 = -0.85, h1 = 0.2, arc = Math.PI * 2, seg = 96 } = {}) {
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
  const m = additive(SWEEP_FRAG, { uHead: { value: 0 }, uSpan: { value: 0.3 }, uAmt: { value: 1 }, uTime: materialUniforms.time, uSparks: { value: Math.max(8, Math.round(arc * r1 * 1.2)) },
    uCore: { value: V3(5.0, 3.0, 1.6) }, uBody: { value: V3(2.6, 0.32, 0.12) }, uEdge: { value: V3(0.9, 0.12, 0.05) } });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return mesh;
}

// ------------------------------------------------------------------------------------------ molten fissures (ground)
// Jagged flat ribbons in a local frame (x across, z along -dir): a main fissure plus forks. aAt = distance along the
// path: lit once the front (uFront) has passed, white-orange -> crimson -> a dark ember glow, then fading (uFade).
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
  float lit = smoothstep(0.0, 0.3, uFront - vAt);
  float age = clamp((uFront - vAt) / 5.0, 0.0, 1.0);
  float edge = 1.0 - abs(vW);
  vec3 c = mix(uHot, uCool, age) * edge * edge;
  float flick = 0.8 + 0.2 * sin(uTime * 13.0 + vAt * 9.0);
  gl_FragColor = vec4(c * lit * uFade * flick, 1.0);
}`;
export function fissureMesh(rng, len, width = 1.2, thick = 1) {
  const pos = [], at = [], wv = [], idx = [];
  const ribbon = (pts, w0, w1) => {
    const o = pos.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const [x, z, a] = pts[i], [x2, z2] = pts[Math.min(pts.length - 1, i + 1)], [x0, z0] = pts[Math.max(0, i - 1)];
      let dx = x2 - x0, dz = z2 - z0; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) * thick;
      pos.push(x - dz * w, 0, z + dx * w, x + dz * w, 0, z - dx * w);
      at.push(a, a); wv.push(-1, 1);
    }
    for (let i = 0; i + 1 < pts.length; i++) { const a = o + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  };
  const main = [];
  let x = 0;
  for (let d = 0; d <= len; d += 0.3) { x += (rng() - 0.5) * 0.32; x *= 0.88; main.push([x, -d, d]); }
  ribbon(main, 0.1, 0.035);
  for (let k = 0; k < Math.floor(len * 1.8); k++) {
    const i = 1 + Math.floor(rng() * (main.length - 2)), [mx, mz, ma] = main[i], side = rng() < 0.5 ? -1 : 1;
    const pts = [[mx, mz, ma]], n = 3 + Math.floor(rng() * 3);
    let px = mx, pz = mz;
    for (let j = 1; j <= n; j++) { px += side * (0.12 + rng() * 0.22) * (width / 1.2); pz += (rng() - 0.6) * 0.25; pts.push([px, pz, ma + j * 0.08]); }
    ribbon(pts, 0.045, 0.008);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAt', new THREE.Float32BufferAttribute(at, 1));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(wv, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    vertexShader: CRACK_VERT, fragmentShader: CRACK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    uniforms: { uFront: { value: 0 }, uFade: { value: 1 }, uTime: materialUniforms.time, uHot: { value: V3(6.0, 3.2, 1.2) }, uCool: { value: V3(1.8, 0.16, 0.05) } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return mesh;
}

// ------------------------------------------------------------------------------------------ KE_CLEAVE streak
// A camera-facing cut line across the body along the blow: white-hot core in a crimson halo, swept in (uT 0 -> 1), fading.
const CUT_FRAG = /* glsl */`
uniform float uT, uFade;
uniform vec3 uCore, uHalo;
varying vec2 vUv;
void main() {
  float y = abs(vUv.y * 2.0 - 1.0);
  float reveal = smoothstep(uT * 1.25, uT * 1.25 - 0.25, vUv.x);
  float ends = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
  vec3 c = uCore * exp(-y * y * 36.0) + uHalo * exp(-y * y * 4.0) * 0.7;
  gl_FragColor = vec4(c * reveal * ends * uFade, 1.0);
}`;
let _cutGeo = null;
export function cleaveMesh() {
  if (!_cutGeo) _cutGeo = new THREE.PlaneGeometry(1, 1, 8, 1).translate(0.5, 0, 0);
  const m = additive(CUT_FRAG, { uT: { value: 0 }, uFade: { value: 1 }, uCore: { value: V3(7, 5.2, 3.6) }, uHalo: { value: V3(3.4, 0.4, 0.15) } }, { mat: { depthTest: false } });
  const mesh = new THREE.Mesh(_cutGeo, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 26;
  return mesh;
}

// ------------------------------------------------------------------------------------------ 天墜 landing marker (ground)
// A flat crimson reticle: an outer ring with four inward wedges turning slowly, an inner dashed ring that tightens
// with the stage (uStage 0..2), a faint pool of light; uAmt fades it, uR is the strike radius (m) it shows.
const MARK_FRAG = /* glsl */`
uniform float uAmt, uTime, uStage;
uniform vec3 uCol, uHot;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p), a = atan(p.y, p.x);
  if (r > 1.0) discard;
  float ring = exp(-pow((r - 0.94) * 34.0, 2.0));
  float ang = a + uTime * 0.6;
  float wedge = step(0.78, r) * step(r, 0.9) * step(0.92, cos(ang * 4.0)) * smoothstep(0.78, 0.9, r);
  float ri = 0.62 - 0.1 * uStage;
  float dash = exp(-pow((r - ri) * 40.0, 2.0)) * step(0.0, sin(a * 18.0 - uTime * 3.0));
  float pool = exp(-r * r * 3.0) * 0.08;
  float pulse = 0.75 + 0.25 * sin(uTime * (6.0 + 4.0 * uStage));
  vec3 c = uCol * (ring * 1.4 + wedge * 1.6 + dash * 1.1 + pool) * pulse + uHot * ring * 0.3 * uStage;
  gl_FragColor = vec4(c * uAmt, 1.0);
}`;
export function markerMesh() {
  const g = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const m = additive(MARK_FRAG, { uAmt: { value: 0 }, uTime: materialUniforms.time, uStage: { value: 0 }, uCol: { value: V3(3.2, 0.42, 0.16) }, uHot: { value: V3(5, 3, 1.6) } },
    { mat: { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 } });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  mesh.visible = false;
  return mesh;
}

// ------------------------------------------------------------------------------------------ 狂旋 vortex (world, round the player)
// A low tilted cone band (r0 at h0 .. r1 at h1) carrying fast angular streaks: crimson blade arcs racing round with a
// white-hot leading edge, embers and dust colour at the bottom; uAmt fades it, uSpin is the revolutions per second.
const VORTEX_FRAG = /* glsl */`
uniform float uAmt, uTime, uSpin;
uniform vec3 uCore, uBody;
varying vec2 vUv;
${NOISE}
void main() {
  float x = vUv.x, y = vUv.y;
  float ph = fract(x * 2.0 - uTime * uSpin * 2.0);                    // two blade arcs per turn
  float arc = pow(1.0 - ph, 3.0) * smoothstep(0.0, 0.03, ph);
  float band = smoothstep(0.0, 0.35, y) * smoothstep(1.0, 0.75, y);
  float n = vn(vec2(x * 50.0 - uTime * uSpin * 25.0, y * 5.0));
  vec3 c = uBody * arc * band * (0.5 + n) + uCore * exp(-ph * 60.0) * band * 1.2;
  gl_FragColor = vec4(c * uAmt, 1.0);
}`;
export function vortexMesh({ r0 = 2.6, r1 = 3.5, h0 = -1.1, h1 = -0.35, seg = 72 } = {}) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = u * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
    pos.push(s * r0, h0, c * r0, s * r1, h1, c * r1); uv.push(u, 0, u, 1);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = additive(VORTEX_FRAG, { uAmt: { value: 0 }, uTime: materialUniforms.time, uSpin: { value: 3.5 }, uCore: { value: V3(5, 3, 1.6) }, uBody: { value: V3(2.4, 0.3, 0.1) } });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.visible = false;
  return mesh;
}

// ------------------------------------------------------------------------------------------ 迴戚 whirl disc (world)
// A flat disc in the throw's spin plane: motion-blurred crescent arcs of the spinning blade (white-hot rims, crimson
// body) and a soft core; uAmt fades it.
const DISC_FRAG = /* glsl */`
uniform float uAmt, uTime;
uniform vec3 uCore, uBody;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p), a = atan(p.y, p.x);
  if (r > 1.0) discard;
  float ph = fract(a / 6.2831853 - uTime * 6.0);
  float arc = pow(1.0 - ph, 4.0) * smoothstep(0.45, 0.8, r) * smoothstep(1.0, 0.86, r);
  float rim = exp(-pow((r - 0.9) * 18.0, 2.0)) * (0.5 + 0.5 * pow(1.0 - ph, 2.0));
  vec3 c = uBody * arc * 1.4 + uCore * rim * 0.9 + uBody * exp(-r * r * 5.0) * 0.15;
  gl_FragColor = vec4(c * uAmt, 1.0);
}`;
export function discMesh() {
  const m = additive(DISC_FRAG, { uAmt: { value: 1 }, uTime: materialUniforms.time, uCore: { value: V3(5, 3.2, 1.8) }, uBody: { value: V3(2.6, 0.35, 0.12) } });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return mesh;
}

// ------------------------------------------------------------------------------------------ 猛志 war spirit (ghost geometry)
// Metres, feet at the origin, facing +Z; its right hand side is -X (the axe arm hangs there, built separately with
// spiritArmGeometry, hinged at RSHOULDER). Zones by per-vertex aTint over the ghost's bronze glaze: gold rims and
// belt, crimson eyes / mouth / neck fire, bone teeth, a dark mouth. ≈ 2k triangles.
export const RSHOULDER = [-2.55, 10.35, 0.1];
const GOLD = [0.85, 0.5, 0.12, 0.7], EYE = [3.2, 0.35, 0.12, 1], FIRE = [2.6, 0.6, 0.12, 0.95], TOOTH = [0.85, 0.78, 0.6, 0.9], DARK = [0.03, 0.01, 0.01, 0.95], NONE = [0, 0, 0, 0];
function builder() {
  const P = [], N = [], T = [], I = [];
  const push = (geo, col) => {
    if (geo.index) geo = geo.toNonIndexed();
    geo.deleteAttribute('uv');
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const o = P.length / 3, p = geo.attributes.position, n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); T.push(...(typeof col === 'function' ? col(p.getX(i), p.getY(i), p.getZ(i)) : col)); I.push(o + i); }
  };
  const done = () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('aTint', new THREE.Float32BufferAttribute(T, 4));
    geo.setIndex(I);
    geo.computeBoundingBox();
    return geo;
  };
  return { push, done };
}
const lathe = (pts, seg) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); g.deleteAttribute('uv'); return g; };
/** a limb: lathe along +Y (r profile) turned to run from a to b */
function limb(prof, a, b, seg = 8) {
  const A = V3(...a), B = V3(...b), d = B.clone().sub(A), L = d.length();
  const g = lathe(prof.map(([r, u]) => [r, u * L]), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize()));
  g.translate(A.x, A.y, A.z);
  return g;
}
export function spiritGeometry() {
  const { push, done } = builder();
  // legs: boots, calves, knees, thighs (a wide stance)
  for (const sd of [-1, 1]) {
    push(limb([[0.0, 0], [0.62, 0.02], [0.66, 0.2], [0.82, 0.38], [0.66, 0.55], [0.86, 0.75], [1.0, 0.95], [0.95, 1]], [sd * 1.55, 0.35, 0], [sd * 1.05, 5.4, 0], 9), NONE);
    const boot = new THREE.BoxGeometry(1.15, 0.6, 1.8, 1, 1, 1); boot.translate(sd * 1.58, 0.3, 0.35); push(boot, NONE);
    const knee = new THREE.SphereGeometry(0.62, 8, 5); knee.scale(1, 0.8, 0.9); knee.translate(sd * 1.33, 2.85, 0.42); push(knee, GOLD);
  }
  // armoured skirt (faceted tassets) with a gold hem, the belt
  push(lathe([[2.55, 4.0], [2.2, 4.9], [1.85, 6.2], [0, 6.25]], 10), (x, y) => (y < 4.15 ? GOLD : NONE));
  const belt = new THREE.TorusGeometry(1.86, 0.24, 6, 18); belt.rotateX(Math.PI / 2); belt.scale(1.22, 1, 0.9); belt.translate(0, 6.3, 0); push(belt, GOLD);
  // torso: waist -> belly -> barrel chest -> shoulders -> the neck stump (oval)
  const torso = lathe([[1.6, 6.1], [1.95, 7.2], [2.2, 8.5], [2.35, 9.4], [2.2, 10.3], [1.75, 10.95], [0.95, 11.3], [0.85, 11.45], [0, 11.5]], 14);
  torso.scale(1.25, 1, 0.85);
  push(torso, (x, y) => (y > 11.35 ? FIRE : NONE));
  // pauldrons
  for (const sd of [-1, 1]) {
    const pd = new THREE.SphereGeometry(1.15, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.62); pd.scale(1, 0.85, 1.05); pd.translate(sd * 2.55, 10.2, 0.05);
    push(pd, (x, y) => (y < 10.62 ? GOLD : NONE));
  }
  // the chest face: eyes ("以乳為目") under gold brows, the navel mouth ("以臍為口") with teeth
  const zf = (y) => 0.85 * (y > 8.5 ? 2.35 : 2.0) + 0.06;
  for (const sd of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.46, 10, 7); eye.scale(1, 0.85, 0.6); eye.translate(sd * 1.05, 9.45, zf(9.45) - 0.05); push(eye, EYE);
    const brow = new THREE.TorusGeometry(0.62, 0.11, 4, 10, Math.PI * 0.8); brow.rotateZ(Math.PI * 0.1); brow.translate(sd * 1.05, 9.5, zf(9.5) - 0.12); push(brow, GOLD);
  }
  const mouth = new THREE.CircleGeometry(1, 16); mouth.scale(0.85, 0.32, 1); mouth.translate(0, 7.45, zf(7.45) + 0.02); push(mouth, DARK);
  const lipU = new THREE.TorusGeometry(0.88, 0.09, 4, 14, Math.PI); lipU.scale(1, 0.36, 1); lipU.translate(0, 7.45, zf(7.45)); push(lipU, GOLD);
  const lipD = lipU.clone(); lipD.scale(1, -1, 1); lipD.translate(0, 14.9, 0); push(lipD, GOLD);
  for (let i = 0; i < 6; i++) {
    const x = -0.62 + i * 0.25, up = new THREE.ConeGeometry(0.075, 0.22, 4); up.rotateZ(Math.PI); up.translate(x, 7.6, zf(7.45) + 0.06); push(up, TOOTH);
    const dn = new THREE.ConeGeometry(0.07, 0.2, 4); dn.translate(x + 0.12, 7.3, zf(7.45) + 0.06); push(dn, TOOTH);
  }
  push(mouth.clone().scale(0.6, 0.45, 1).translate(0, 4.1, 0.03), FIRE);   // the core glowing in the mouth
  // neck stump fire
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, f = new THREE.ConeGeometry(0.28, 1.3 + (i % 2) * 0.5, 5);
    f.rotateZ(Math.cos(a) * 0.35); f.rotateX(Math.sin(a) * 0.35); f.translate(Math.cos(a) * 0.45, 12.0 + (i % 2) * 0.25, Math.sin(a) * 0.4); push(f, FIRE);
  }
  // left arm with the 干 shield on the forearm (its left = +X)
  push(limb([[0.85, 0], [0.75, 0.5], [0.62, 1]], [2.6, 10.3, 0], [3.15, 7.9, 0.7], 8), NONE);
  push(limb([[0.62, 0], [0.55, 0.6], [0.5, 1]], [3.15, 7.9, 0.7], [2.55, 6.5, 2.0], 8), NONE);
  const shield = new THREE.CylinderGeometry(1, 1, 0.26, 18, 1); shield.rotateX(Math.PI / 2); shield.scale(1.45, 2.3, 1); shield.translate(2.95, 7.7, 2.45);
  push(shield, NONE);
  const rim = new THREE.TorusGeometry(1, 0.1, 4, 24); rim.scale(1.45, 2.3, 1); rim.translate(2.95, 7.7, 2.6); push(rim, GOLD);
  const boss = new THREE.SphereGeometry(0.42, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); boss.rotateX(Math.PI / 2); boss.translate(2.95, 7.7, 2.58); push(boss, EYE);
  for (const dy of [-1.15, 1.15]) { const bar = new THREE.BoxGeometry(1.6, 0.12, 0.12); bar.translate(2.95, 7.7 + dy, 2.62); push(bar, GOLD); }
  return done();
}
/**
 * The axe arm, origin at the right shoulder: the arm reaches along +Z (upper arm, forearm, fist at 5.3 m), the haft runs
 * on through the fist to 12.6 m, the 鉞 head (the weapon's own crescent with the pierced face) spans +X from the haft:
 * its cutting edge points +X. Edge, eyes and mouth glow (aTint). ≈ 0.7k triangles.
 */
export function spiritArmGeometry() {
  const { push, done } = builder();
  push(limb([[0.82, 0], [0.7, 0.55], [0.6, 1]], [0, 0, 0], [0, -0.1, 2.8], 8), NONE);
  push(limb([[0.6, 0], [0.55, 0.5], [0.45, 1]], [0, -0.1, 2.8], [0, -0.05, 5.0], 8), NONE);
  const fist = new THREE.SphereGeometry(0.62, 8, 6); fist.scale(1, 0.9, 1.1); fist.translate(0, -0.05, 5.35); push(fist, NONE);
  push(limb([[0.17, 0], [0.17, 1]], [0, -0.05, 4.3], [0, -0.05, 12.7], 6), GOLD);
  for (const z of [10.1, 12.75]) { const c = new THREE.TorusGeometry(0.24, 0.07, 4, 10); c.translate(0, -0.05, z); push(c, GOLD); }
  // head: crescent outline in (x across, z along the haft); holes for the eyes and the grinning mouth
  const sh = new THREE.Shape(), zc = 11.4;
  sh.moveTo(0.15, zc - 1.0);
  sh.quadraticCurveTo(1.6, zc - 1.05, 2.45, zc - 1.62);                      // lower shoulder flaring into the horn
  sh.quadraticCurveTo(3.35, zc, 2.45, zc + 1.62);                             // the crescent edge
  sh.quadraticCurveTo(1.6, zc + 1.05, 0.15, zc + 1.0);                        // upper shoulder
  sh.lineTo(0.15, zc - 1.0);
  for (const dz of [-0.36, 0.36]) { const h = new THREE.Path(); h.absarc(1.25, zc + dz, 0.2, 0, Math.PI * 2, true); sh.holes.push(h); }
  const m = new THREE.Path(); m.moveTo(0.85, zc - 0.45); m.quadraticCurveTo(0.6, zc, 0.85, zc + 0.45); m.lineTo(1.0, zc + 0.42); m.quadraticCurveTo(0.82, zc, 1.0, zc - 0.42); m.lineTo(0.85, zc - 0.45); sh.holes.push(m);
  const head = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 10 });
  head.translate(0, 0, -0.08);
  head.rotateX(Math.PI / 2);                                                  // shape (x, y=z along the haft), depth -> -y
  head.translate(0, -0.05, 0);
  // edge zone white-hot crimson, the rest bronze glaze with gold piping near the rim
  push(head, (x) => (x > 2.35 ? [4.4, 1.1, 0.35, 1] : x > 2.1 ? [2.2, 0.35, 0.12, 0.85] : NONE));
  return done();
}
