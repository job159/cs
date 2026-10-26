// 刑天．舞戚 — procedural FX pieces (docs/PREMIUM_WEAPONS.md §2.32): the crimson swept arc band (狂旋 burst, 猛志
// sweep and chop), molten ground fissures (開山, 天墜, 猛志), the KE_CLEAVE cut streak, the 天墜 landing marker, the 狂旋
// dust vortex and blade ring round the player, the whirl disc round the thrown 迴戚 and the 猛志 war spirit (a heroic
// headless glazed-bronze giant: chest eyes in pectoral plates, a fanged navel mouth, a Shang 干 shield; its axe arm
// is a separate ghost hinged at the shoulder). Built once per game and reused; colours are HDR linear (crimson bodies
// stay under ~1.5: brighter tonemaps to cream).
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
// angle: lit behind it over uSpan -- a white-hot spine hottest just behind the blade, a crimson body (kept under
// ~1.5 HDR: brighter tonemaps to cream) cooling to a dark ember wake, ember sparks inside; the head ramps in over a
// few degrees and the tail feathers out (no hard cut either end).
const SWEEP_FRAG = /* glsl */`
uniform float uHead, uSpan, uAmt, uTime, uSparks;
uniform vec3 uCore, uBody, uEdge;
varying vec2 vUv;
${NOISE}
void main() {
  float behind = uHead - vUv.x;
  if (behind < -0.04 || behind > uSpan) discard;
  float w = clamp(behind / uSpan, 0.0, 1.0), y = vUv.y;
  float head = smoothstep(-0.04, 0.012, behind);
  float tail = 1.0 - smoothstep(0.45, 1.0, w);
  float caps = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);
  float band = smoothstep(0.0, 0.3, y) * smoothstep(1.0, 0.82, y);
  float spine = exp(-pow((y - 0.64) * 4.5, 2.0));
  float lead = exp(-max(behind, 0.0) / uSpan * 6.0);
  float streak = 0.55 + 0.45 * vn(vec2(vUv.x * 70.0, y * 4.0 - uTime * 3.0));
  vec2 sc = vec2(vUv.x * uSparks, y * 6.0), f = fract(sc) - 0.5;
  float h = h21(floor(sc) + 3.0);
  float spark = step(0.82, h) * exp(-dot(f, f) * 40.0) * (0.6 + 0.4 * sin(uTime * 13.0 + h * 50.0));
  vec3 c = mix(uBody, uEdge, w) * band * streak + uCore * spine * lead * band * 1.4
    + vec3(1.6, 0.6, 0.18) * spark * band * (1.0 - w * 0.5);
  gl_FragColor = vec4(c * uAmt * caps * head * tail, 1.0);
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
    uCore: { value: V3(4.2, 2.9, 1.9) }, uBody: { value: V3(1.45, 0.13, 0.045) }, uEdge: { value: V3(0.45, 0.04, 0.015) } });
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
export function fissureGeo(rng, len, width = 1.2, thick = 1) {
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
  return g;
}
export const fissureMat = () => new THREE.ShaderMaterial({
  vertexShader: CRACK_VERT, fragmentShader: CRACK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  uniforms: { uFront: { value: 0 }, uFade: { value: 1 }, uTime: materialUniforms.time, uHot: { value: V3(6.0, 3.2, 1.2) }, uCool: { value: V3(1.6, 0.14, 0.045) } },
});
export function fissureMesh(rng, len, width = 1.2, thick = 1) {
  const mesh = new THREE.Mesh(fissureGeo(rng, len, width, thick), fissureMat());
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
  const m = additive(CUT_FRAG, { uT: { value: 0 }, uFade: { value: 1 }, uCore: { value: V3(4.2, 2.6, 1.6) }, uHalo: { value: V3(1.5, 0.15, 0.05) } }, { mat: { depthTest: false } });
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
// A low tilted cone band (r0 at h0 .. r1 at h1) on the street carrying fast angular streaks: hot dust racing round
// (soft heads, no hard leading line; the blade ring above carries the crimson), uAmt fades it, uSpin = rev/s.
const VORTEX_FRAG = /* glsl */`
uniform float uAmt, uTime, uSpin;
uniform vec3 uCore, uBody;
varying vec2 vUv;
${NOISE}
void main() {
  float x = vUv.x, y = vUv.y;
  float ph = fract(x * 2.0 - uTime * uSpin * 2.0);                    // two dust arcs per turn
  float arc = pow(1.0 - ph, 3.0) * smoothstep(0.0, 0.12, ph);
  float band = smoothstep(0.0, 0.35, y) * smoothstep(1.0, 0.75, y);
  float n = vn(vec2(x * 50.0 - uTime * uSpin * 25.0, y * 5.0));
  vec3 c = uBody * arc * band * (0.35 + 0.8 * n) + uCore * smoothstep(0.0, 0.12, ph) * exp(-ph * 12.0) * band * 0.4;
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
  const m = additive(VORTEX_FRAG, { uAmt: { value: 0 }, uTime: materialUniforms.time, uSpin: { value: 3.5 }, uCore: { value: V3(1.2, 0.5, 0.2) }, uBody: { value: V3(0.75, 0.22, 0.08) } });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.visible = false;
  return mesh;
}

// ------------------------------------------------------------------------------------------ 迴戚 whirl disc (world)
// A flat disc in the throw's spin plane: motion-blurred crescent arcs of the spinning blade (crimson body under
// ~1.5 HDR, a thin white-hot rim line on the leading arcs) and a faint core; uAmt fades it.
const DISC_FRAG = /* glsl */`
uniform float uAmt, uTime;
uniform vec3 uCore, uBody;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p), a = atan(p.y, p.x);
  if (r > 1.0) discard;
  float ph = fract(a / 6.2831853 - uTime * 6.0);
  float arc = pow(1.0 - ph, 4.0) * smoothstep(0.45, 0.8, r) * smoothstep(1.0, 0.86, r) * smoothstep(0.0, 0.05, ph);
  float rim = exp(-pow((r - 0.92) * 40.0, 2.0)) * pow(1.0 - ph, 3.0) * smoothstep(0.0, 0.05, ph);
  vec3 c = uBody * arc + uCore * rim + uBody * exp(-r * r * 5.0) * 0.1;
  gl_FragColor = vec4(c * uAmt, 1.0);
}`;
export function discMesh() {
  const m = additive(DISC_FRAG, { uAmt: { value: 1 }, uTime: materialUniforms.time, uCore: { value: V3(4.2, 2.9, 1.9) }, uBody: { value: V3(1.4, 0.12, 0.04) } });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return mesh;
}

// ------------------------------------------------------------------------------------------ 狂旋 blade ring (world, round the player)
// The whirling axe as a ring of light at waist height (a cone band r0 at h0 .. r1 at h1 round the eye): the blade's
// wake runs once round every turn (uPhase 0..1 = the blade's angle, driven in step with the swing), white-hot along
// its spine, crimson body, a soft head and a long feathered tail; a faint full ring stays while the whirl lasts.
const RING_FRAG = /* glsl */`
uniform float uAmt, uPhase, uTime;
uniform vec3 uCore, uBody;
varying vec2 vUv;
${NOISE}
void main() {
  float x = vUv.x, y = vUv.y;
  float ph = fract(uPhase - x);                                   // 0 at the blade, growing behind it
  float wake = smoothstep(0.0, 0.045, ph) * exp(-ph * 4.6);       // soft head, a feathered tail ~ half a turn
  float band = smoothstep(0.0, 0.3, y) * smoothstep(1.0, 0.72, y);
  float core = exp(-pow((y - 0.56) * 6.5, 2.0));
  float streak = 0.6 + 0.4 * vn(vec2(x * 90.0 + uTime * 4.0, y * 3.0));
  vec3 c = uBody * band * (wake + 0.035) * streak + uCore * core * wake * wake * 1.3;
  gl_FragColor = vec4(c * uAmt, 1.0);
}`;
export function bladeRing({ r0 = 2.3, r1 = 3.4, h0 = -1.0, h1 = -0.55, seg = 96 } = {}) {
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
  const m = additive(RING_FRAG, { uAmt: { value: 0 }, uPhase: { value: 0 }, uTime: materialUniforms.time, uCore: { value: V3(4.2, 2.9, 1.9) }, uBody: { value: V3(1.45, 0.13, 0.045) } });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.visible = false;
  return mesh;
}

// ------------------------------------------------------------------------------------------ 猛志 war spirit (ghost geometry)
// Metres, feet at the origin, facing +Z; its right hand side is -X (the axe arm, built separately with
// spiritArmGeometry, hinges at RSHOULDER). A heroic headless giant: broad shoulders under layered pauldrons tapering
// to a narrow belted waist, the eyes ("以乳為目") set in angular pectoral plates under scowling gold brows, the navel
// mouth ("以臍為口") a fanged maw in gold lips with fire inside, an armoured skirt of eight tassets and a long apron,
// greaves and sabatons, fire licking from the neck; the left forearm carries a tall rectangular Shang 干 shield
// with a beast-mask boss and crimson plumes. Zones by per-vertex aTint over the ghost's bronze glaze. ≈ 6k triangles.
export const SPIRIT_H = 12.5;                                 // authored height (m); geometries are divided by it
export const RSHOULDER = [-2.75 / SPIRIT_H, 10.2 / SPIRIT_H, 0.1 / SPIRIT_H];
const GOLD = [0.85, 0.5, 0.12, 0.7], EYE = [3.2, 0.35, 0.12, 1], FIRE = [2.6, 0.6, 0.12, 0.95], TOOTH = [0.85, 0.78, 0.6, 0.9], DARK = [0.03, 0.01, 0.01, 0.95], NONE = [0, 0, 0, 0];
const TURQ = [0.12, 0.5, 0.44, 0.75], LACQ = [0.05, 0.025, 0.02, 0.6], CINN = [0.5, 0.05, 0.035, 0.75], HOT = [5.0, 3.3, 2.1, 1], EDGEC = [2.3, 0.28, 0.09, 0.95];
function builder() {
  const P = [], N = [], T = [], I = [];
  /** geometry already in place; col: a tint, a function of the vertex position, or (geo.aTint set) per vertex */
  const push = (geo, col = NONE) => {
    if (geo.index) geo = geo.toNonIndexed();
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const o = P.length / 3, p = geo.attributes.position, n = geo.attributes.normal, at = geo.attributes.aTint;
    for (let i = 0; i < p.count; i++) {
      P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i));
      T.push(...(at ? [at.getX(i), at.getY(i), at.getZ(i), at.getW(i)] : typeof col === 'function' ? col(p.getX(i), p.getY(i), p.getZ(i)) : col)); I.push(o + i);
    }
  };
  const done = (k = 1) => {
    for (let i = 0; i < P.length; i++) P[i] *= k;
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
const TAU = Math.PI * 2;
const _m4 = new THREE.Matrix4(), _eu = new THREE.Euler();
/** rotate (Euler YXZ) then move a piece into place */
const place = (g, pos, rot = [0, 0, 0]) => g.applyMatrix4(_m4.makeRotationFromEuler(_eu.set(rot[0], rot[1], rot[2], 'YXZ')).setPosition(pos[0], pos[1], pos[2]));
/** per-vertex tint from the piece's own (pre-placement) coordinates */
const tint = (g, fn) => { const p = g.attributes.position, a = new Float32Array(p.count * 4); for (let i = 0; i < p.count; i++) a.set(fn(p.getX(i), p.getY(i), p.getZ(i)), i * 4); g.setAttribute('aTint', new THREE.BufferAttribute(a, 4)); return g; };
/** faceted (armour plates read by their facets) */
const flat = (g) => { const f = g.index ? g.toNonIndexed() : g; f.computeVertexNormals(); return f; };
/** an extruded plate from an [x, y] outline (holes: outlines), centred on z = 0 */
function ext(pts, depth, bevel = 0.04, holes = [], curve = 6) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1, curveSegments: curve });
  g.deleteAttribute('uv');
  return g.translate(0, 0, -depth / 2);
}
/** an almond / lens outline w x h, centred (cx, cy), turned rot */
function lens(w, h, n = 10, cx = 0, cy = 0, rot = 0) {
  const o = [];
  for (let i = 0; i <= n; i++) { const u = -1 + 2 * i / n; o.push([u * w / 2, h / 2 * Math.pow(Math.max(0, 1 - u * u), 0.75)]); }
  for (let i = n - 1; i > 0; i--) { const u = -1 + 2 * i / n; o.push([u * w / 2, -h / 2 * Math.pow(Math.max(0, 1 - u * u), 0.75)]); }
  const c = Math.cos(rot), s = Math.sin(rot);
  return o.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
/** curve a plate about its vertical axis (convex towards +z) */
const bend = (g, R) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - p.getX(i) ** 2 / (2 * R)); g.computeVertexNormals(); return g; };
const lathe = (pts, seg, a0 = 0, arc = TAU) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, a0, arc); g.deleteAttribute('uv'); return g; };
const sphere = (r, w, h, pos, sc = [1, 1, 1]) => new THREE.SphereGeometry(r, w, h).scale(...sc).translate(...pos);
/** a limb: lathe along +Y (r profile) turned to run from a to b */
function limb(prof, a, b, seg = 8) {
  const A = V3(...a), B = V3(...b), d = B.clone().sub(A), L = d.length();
  const g = lathe(prof.map(([r, u]) => [r, u * L]), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize()));
  g.translate(A.x, A.y, A.z);
  return g;
}
/** a ring round a limb at fraction u from a to b */
function cuff(a, b, u, r, tube) {
  const A = V3(...a), B = V3(...b), d = B.clone().sub(A);
  const g = new THREE.TorusGeometry(r, tube, 5, 14);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), d.clone().normalize()));
  return g.translate(A.x + d.x * u, A.y + d.y * u, A.z + d.z * u);
}
/** loft of oval rings [y, half width, front depth, back depth] (smooth: the glazed body), capped on top */
function loft(L, seg) {
  const pos = [], idx = [];
  for (const [y, hw, f, b] of L) for (let j = 0; j < seg; j++) { const a = j / seg * TAU, c = Math.cos(a); pos.push(hw * Math.sin(a), y, (c >= 0 ? f : b) * c); }
  for (let i = 0; i + 1 < L.length; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + (j + 1) % seg, c = a + seg, d = b + seg;
    idx.push(a, b, c, b, d, c);
  }
  const top = pos.length / 3; pos.push(0, L.at(-1)[0] + 0.05, 0);
  for (let j = 0; j < seg; j++) idx.push((L.length - 1) * seg + j, (L.length - 1) * seg + (j + 1) % seg, top);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/**
 * The Shang 干: a tall rectangular shield curved round its vertical axis, a raised gold frame, two gold cross bands, a
 * beast-mask boss in the middle field (crimson eyes under hooked gold brows, a nose ridge, curling horns), three
 * crimson plumes on top and a spike below; W x H (m), facing +Z, placed by pos / rot.
 */
function ganShield(push, W, H, pos, rot) {
  const R = W * 1.5, k = W / 2.3;   // detail authored for a 2.3 m wide shield
  const put = (g, col) => { place(g, pos, rot); push(g, col); };
  put(bend(new THREE.BoxGeometry(W, H, 0.2 * k, 8, 10, 1), R));
  put(bend(new THREE.BoxGeometry(W + 0.24 * k, H + 0.24 * k, 0.12 * k, 8, 10, 1), R).translate(0, 0, -0.06 * k), GOLD);
  for (const y of [-0.21 * H, 0.21 * H]) put(bend(new THREE.BoxGeometry(W + 0.02 * k, 0.17 * k, 0.1 * k, 8, 1, 1).translate(0, y, 0.12 * k), R), GOLD);
  // beast mask: the eyes, hooked brows, a nose ridge, horns curling up
  for (const sd of [-1, 1]) {
    put(bend(ext(lens(0.52 * k, 0.24 * k, 8, sd * 0.42 * k, 0.12 * k, -sd * 0.18), 0.06 * k, 0).translate(0, 0, 0.15 * k), R), EYE);
    put(bend(ext([[0.12, 0.3], [0.2, 0.44], [0.7, 0.56], [0.78, 0.4]].map(([x, y]) => [sd * x * k, y * k]), 0.1 * k, 0.02 * k).translate(0, 0, 0.14 * k), R), GOLD);
    put(bend(ext([[0.55, 0.62], [0.8, 0.95], [0.72, 1.32], [0.5, 1.4], [0.6, 1.18], [0.6, 0.98], [0.42, 0.7]].map(([x, y]) => [sd * x * k, y * k]), 0.08 * k, 0.02 * k).translate(0, 0, 0.13 * k), R), GOLD);
  }
  put(bend(ext([[0, 0.38], [0.13, 0.0], [0, -0.55], [-0.13, 0.0]].map(([x, y]) => [x * k, y * k]), 0.1 * k, 0.02 * k).translate(0, 0, 0.14 * k), R), GOLD);
  // plumes and the spike
  for (const x of [-0.7, 0, 0.7]) {
    const c = new THREE.ConeGeometry(0.15 * k, 1.5 * k, 5).translate(0, 0.75 * k, 0);
    c.rotateZ(-x * 0.45); c.translate(x * k, H / 2 + 0.05 * k, -0.02 * k);
    put(c, FIRE);
  }
  put(new THREE.ConeGeometry(0.16 * k, 0.6 * k, 6).rotateZ(Math.PI).translate(0, -H / 2 - 0.3 * k, -0.02 * k), GOLD);
}
export function spiritGeometry() {
  const { push, done } = builder();
  // ---- legs: thighs, greaves with a shield plate, gold knee cops with a spike, sabatons (a wide planted stance)
  for (const sd of [-1, 1]) {
    const hip = [sd * 0.95, 6.1, 0], knee = [sd * 1.48, 3.35, 0.3], ank = [sd * 1.72, 0.8, 0.12];
    push(limb([[0.95, 0], [1.02, 0.3], [0.86, 0.8], [0.66, 1]], hip, knee, 9));
    push(limb([[0.64, 0], [0.74, 0.25], [0.6, 0.75], [0.5, 1]], knee, ank, 9));
    const mid = [(knee[0] + ank[0]) / 2, (knee[1] + ank[1]) / 2, (knee[2] + ank[2]) / 2 + 0.6], gr = [0.07, sd * 0.06, -sd * 0.09];
    const gp = [[-0.42, 1.0], [0.42, 1.0], [0.52, -0.6], [0, -1.15], [-0.52, -0.6]];
    push(place(ext(gp, 0.1, 0.03), mid, gr));
    push(place(ext(gp.map(([x, y]) => [x * 1.14, y * 1.06]), 0.06, 0.02).translate(0, 0, -0.05), mid, gr), GOLD);
    push(sphere(0.6, 9, 6, [knee[0], knee[1], knee[2] + 0.22], [1, 0.85, 0.9]), GOLD);
    push(new THREE.ConeGeometry(0.17, 0.62, 5).rotateX(Math.PI / 2).translate(knee[0], knee[1] + 0.05, knee[2] + 0.92), GOLD);
    push(flat(place(ext([[-0.55, 0], [1.75, 0], [1.98, 0.12], [1.25, 0.42], [0.45, 0.76], [-0.45, 0.72]], 0.95, 0.06), [sd * 1.75, 0, 0], [0, -Math.PI / 2 + sd * 0.12, 0])));
  }
  // ---- armoured skirt: eight tassets round the hips with gold hems, a long front apron with a crimson boss, the belt
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) / 8 * TAU;
    const t = tint(lathe([[1.5, 6.5], [2.38, 4.05], [2.28, 4.05], [1.42, 6.5], [1.5, 6.5]], 3, a - 0.34, 0.68), (x, y) => (y < 4.35 ? GOLD : NONE));
    push(flat(t.scale(1, 1, 0.82)));
  }
  const ap = [[-0.6, 0], [0.6, 0], [0.8, -2.5], [0, -3.1], [-0.8, -2.5]], apP = [0, 6.45, 1.3], apR = [-0.3, 0, 0];
  push(place(ext(ap, 0.12, 0.04), apP, apR));
  push(place(ext(ap.map(([x, y]) => [x * 1.12, y * 1.05 + 0.04]), 0.07, 0.02).translate(0, 0, -0.06), apP, apR), GOLD);
  push(place(ext([[0, 0.34], [0.24, 0], [0, -0.34], [-0.24, 0]], 0.08, 0.02).translate(0, -1.55, 0.09), apP, apR), EYE);
  push(place(ext([[-0.5, -0.9], [0.5, -0.9], [0.5, -1.0], [-0.5, -1.0]], 0.06, 0.01).translate(0, 0, 0.08), apP, apR), GOLD);
  push(new THREE.TorusGeometry(1.0, 0.2, 6, 24).rotateX(Math.PI / 2).scale(1.53, 1, 1.07).translate(0, 6.5, 0), GOLD);
  push(place(ext([[-0.36, 0.3], [0.36, 0.3], [0.42, 0], [0.36, -0.3], [-0.36, -0.3], [-0.42, 0]], 0.14, 0.04), [0, 6.5, 1.14]), GOLD);
  // ---- torso: a narrow waist flaring into a broad chest and heavy shoulders, the neck stump
  const L = [[6.3, 1.45, 1.0, 0.95], [6.9, 1.5, 1.08, 0.98], [7.6, 1.72, 1.2, 1.02], [8.3, 2.02, 1.32, 1.1], [9.0, 2.38, 1.46, 1.2], [9.6, 2.64, 1.55, 1.25],
    [10.15, 2.72, 1.38, 1.22], [10.55, 2.3, 1.05, 1.05], [10.85, 1.35, 0.75, 0.75], [11.0, 0.95, 0.55, 0.55]];
  push(loft(L, 20), (x, y) => (y > 10.95 ? FIRE : NONE));
  // ---- the chest eyes in angular pectoral plates on gold backings, scowling gold brows slanting to the middle
  for (const sd of [-1, 1]) {
    const pp = [sd * 1.2, 9.55, 1.4], pr = [-0.1, sd * 0.42, -sd * 0.06];
    const pec = [[-1.0, 0.5], [0.5, 0.78], [1.08, 0.3], [1.0, -0.42], [0.25, -0.78], [-1.0, -0.6]].map(([x, y]) => [x * sd, y]);
    const on = (g, z, col) => push(place(g.translate(0, 0, z), pp, pr), col);
    on(ext(pec, 0.2, 0.05), 0);
    on(ext(pec.map(([x, y]) => [x * 1.1, y * 1.12]), 0.12, 0.03), -0.06, GOLD);
    const ec = [sd * 0.06, 0.0], er = sd * 0.2;
    on(ext(lens(1.1, 0.52, 12, ec[0], ec[1], er), 0.06, 0), 0.12, DARK);
    on(ext(lens(0.88, 0.34, 12, ec[0], ec[1], er), 0.06, 0), 0.16, EYE);
    on(ext(lens(0.36, 0.09, 6, ec[0], ec[1], Math.PI / 2 + er), 0.05, 0), 0.2, DARK);
    on(ext([[-0.6, 0.22], [-0.52, 0.42], [0.66, 0.66], [0.74, 0.46]].map(([x, y]) => [x * sd, y]), 0.14, 0.03), 0.15, GOLD);
  }
  push(place(ext([[0, 0.5], [0.16, 0], [0, -0.6], [-0.16, 0]], 0.12, 0.03), [0, 9.35, 1.6], [-0.12, 0, 0]), GOLD);   // sternum boss
  // ---- the navel mouth: a fanged maw in thick gold lips, fire in the throat
  {
    const mp = [0, 7.5, 1.12], mr = [-0.12, 0, 0], on = (g, col) => push(place(g, mp, mr), col);
    on(ext(lens(2.2, 1.02, 14), 0.18, 0.05, [lens(1.74, 0.6, 14)]), GOLD);
    on(ext(lens(1.8, 0.66, 14), 0.06, 0).translate(0, 0, -0.05), DARK);
    on(ext(lens(1.25, 0.3, 10), 0.05, 0).translate(0, -0.02, -0.01), FIRE);
    const top = (x) => 0.3 * Math.pow(Math.max(0, 1 - (x / 0.87) ** 2), 0.75);
    [-0.66, -0.44, -0.22, 0, 0.22, 0.44, 0.66].forEach((x, i) => {
      const big = i === 1 || i === 5, h = big ? 0.36 : 0.24;
      on(new THREE.ConeGeometry(big ? 0.1 : 0.075, h, 4).rotateZ(Math.PI).translate(x, top(x) - h / 2 + 0.02, 0.05), TOOTH);
    });
    [-0.55, -0.33, -0.11, 0.11, 0.33, 0.55].forEach((x, i) => {
      const big = i === 0 || i === 5, h = big ? 0.3 : 0.2;
      on(new THREE.ConeGeometry(big ? 0.09 : 0.07, h, 4).translate(x, -top(x) + h / 2 - 0.02, 0.05), TOOTH);
    });
  }
  // ---- the neck stump: licking tongues of uneven height leaning out, the tallest at the back, a hot core
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU, h = 1.0 + ((i * 5) % 7) * 0.24 + (Math.sin(a) < -0.3 ? 0.8 : 0), f = new THREE.ConeGeometry(0.22 + (i % 3) * 0.07, h, 5);
    f.translate(0, h / 2, 0); f.rotateZ(Math.cos(a) * 0.5); f.rotateX(-Math.sin(a) * 0.45); f.translate(Math.cos(a) * 0.62, 10.92, Math.sin(a) * 0.45); push(f, FIRE);
  }
  push(new THREE.ConeGeometry(0.5, 1.6, 6).translate(0, 11.7, -0.05), EYE);
  // ---- pauldrons: three lames over each shoulder, gold-edged, sloping out
  for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
    const r = 1.3 + k * 0.13, th0 = 0.08 * Math.PI + k * 0.1 * Math.PI, th1 = th0 + 0.24 * Math.PI;
    const g = new THREE.SphereGeometry(r, 12, 3, sd > 0 ? Math.PI / 2 - 0.55 : -Math.PI / 2 - 0.55, Math.PI + 1.1, th0, th1 - th0);
    tint(g, (x, y) => (y < r * Math.cos(th1) + 0.17 ? GOLD : NONE));
    g.scale(1.12, 0.9, 1.0).rotateZ(-sd * 0.32).translate(sd * 2.72, 10.1 - k * 0.14, 0.05);
    push(flat(g));
  }
  // ---- the left arm with the 干 on its forearm (its left = +X)
  const sh0 = [2.72, 10.0, 0.1], el = [3.3, 8.0, 0.8], wr = [3.0, 7.3, 2.35];
  push(limb([[0.92, 0], [0.96, 0.3], [0.8, 0.75], [0.7, 1]], sh0, el, 9));
  push(sphere(0.55, 8, 6, el), GOLD);
  push(limb([[0.7, 0], [0.76, 0.3], [0.6, 1]], el, wr, 9));
  for (const u of [0.45, 0.85]) push(cuff(el, wr, u, 0.74 - u * 0.12, 0.09), GOLD);
  ganShield(push, 2.3, 4.7, [3.45, 7.55, 2.8], [-0.05, 0.32, 0]);
  return done(1 / SPIRIT_H);
}
/**
 * The axe arm, origin at the right shoulder: the arm reaches along +Z (upper arm, forearm with a gold bracer, the fist
 * at 5.3 m), the lacquered haft runs through the fist to the finial; the 鉞 head (the weapon's own crescent: a bronze
 * body with the pierced scowling face, gold-railed turquoise shoulder bands, a forged iron edge band tapering into
 * flared horn points with a white-hot cutting line) spans +X from the haft: its edge points +X; the turquoise 內
 * behind with a crimson tassel. ARM_HEAD = [head centre along the haft, its half span, the edge's reach] (m).
 */
export const ARM_HEAD = [11.2, 3.2, 3.75];
export function spiritArmGeometry() {
  const { push, done } = builder();
  const ZC = ARM_HEAD[0], Y = -0.05;
  push(limb([[1.0, 0], [1.03, 0.25], [0.84, 0.75], [0.75, 1]], [0, 0, 0], [0, -0.1, 2.75], 9));
  push(sphere(0.58, 8, 6, [0, -0.1, 2.75]), GOLD);
  push(limb([[0.75, 0], [0.8, 0.3], [0.62, 1]], [0, -0.1, 2.75], [0, Y, 4.85], 9));
  for (const z of [3.7, 4.5]) push(new THREE.TorusGeometry(0.79 - (z - 3.7) * 0.12, 0.09, 5, 14).translate(0, -0.08, z), GOLD);
  push(sphere(0.68, 9, 7, [0, Y, 5.3], [1, 0.85, 1.1]));
  // the haft: black lacquer, cinnabar bands between gold rings, a gold spike butt and a flame finial
  const top = ZC + 3.6;
  push(limb([[0.26, 0], [0.26, 1]], [0, Y, 3.3], [0, Y, top], 8), LACQ);
  for (const [a, b] of [[6.3, 6.9], [7.9, 8.4]]) {
    push(limb([[0.28, 0], [0.28, 1]], [0, Y, a], [0, Y, b], 8), CINN);
    for (const z of [a, b]) push(new THREE.TorusGeometry(0.25, 0.05, 4, 12).translate(0, Y, z), GOLD);
  }
  push(new THREE.ConeGeometry(0.26, 0.95, 6).rotateX(-Math.PI / 2).translate(0, Y, 3.3 - 0.47), GOLD);
  push(new THREE.ConeGeometry(0.3, 0.9, 6).rotateX(Math.PI / 2).translate(0, Y, top + 0.45), GOLD);
  for (const z of [ZC - 1.5, ZC + 1.42, top]) push(new THREE.TorusGeometry(0.27, 0.07, 4, 12).translate(0, Y, z), GOLD);
  // the head, authored in the weapon's own mm (s = edge direction, t along the haft, the eye line at t 640) and scaled
  const KX = 0.0102, P = ([s, t]) => [s * KX, (t - 587) * KX];   // an exaggerated head: half the giant's height
  const CE = [-259.9, 587.5], RE = 624.9, A0 = -30 * Math.PI / 180, A1 = 30 * Math.PI / 180;
  const edgeAt = (u, d) => {   // the crescent (u 0 lower horn .. 1 upper horn), d mm inwards; the horn tips flare out
    const a = A0 + (A1 - A0) * u, fl = 34 * Math.pow(Math.abs(2 * u - 1), 5);
    return [CE[0] + Math.cos(a) * (RE - d) + fl, CE[1] + Math.sin(a) * (RE - d) + Math.sign(u - 0.5) * fl * 0.6];
  };
  const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  const bw = (u) => 72 * Math.min(smooth(0, 0.16, u), smooth(1, 0.84, u));
  const N = 32, arc = (d, u0, u1, f = () => d) => { const o = []; for (let i = 0; i <= N; i++) { const u = u0 + (u1 - u0) * i / N; o.push(edgeAt(u, f(u))); } return o; };
  const quad = (a, c, b, n = 10) => { const o = []; for (let i = 0; i <= n; i++) { const u = i / n; o.push([(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]]); } return o; };
  const jL = edgeAt(0.12, bw(0.12) + 2), jU = edgeAt(0.88, bw(0.88) + 2);
  const shL = quad([21, 405], [175, 430], jL), shU = quad(jU, [175, 744], [21, 762]);
  const body = [...shL, ...arc(0, 0.12, 0.88, (u) => bw(u) + 2).slice(1, -1), ...shU];
  const EYEC = [[117, 640, -0.3], [203, 640, 0.3]];
  const eyes = EYEC.map(([s, t, r]) => lens(74, 30, 10, s, t, r));
  const mouth = lens(150, 40, 12, 160, 518);
  const toM = (pts) => pts.map(P);
  // (shape y = along the haft; extruded across: rotateX puts the shape's y on +Z and the thickness on y)
  const head = (g) => g.rotateX(Math.PI / 2).translate(0, Y, ZC);
  push(head(ext(toM(body), 0.26, 0.05, [...eyes.map(toM), toM(mouth)], 8)));
  for (const [s, t, r] of EYEC) push(head(ext(toM(lens(84, 40, 10, s, t, r)), 0.05, 0)), EYE);
  push(head(ext(toM(lens(156, 46, 12, 160, 518)), 0.05, 0)), FIRE);
  for (const s of [112, 136, 160, 184, 208]) push(head(ext(toM([[s - 8, 538], [s + 8, 538], [s, 516]]), 0.2, 0)), TOOTH);
  // scowling brows (gold, standing proud of both faces), the shoulder rails and turquoise bands
  for (const sd of [-1, 1]) push(head(ext(toM([[160 + sd * 18, 652], [160 + sd * 14, 666], [160 + sd * 92, 690], [160 + sd * 96, 674]]), 0.34, 0.01)), GOLD);
  for (const sh of [shL, shU]) {
    const inner = sh === shL ? 1 : -1;
    const off = (pts, d) => pts.map(([s, t], i) => {
      const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      let nx = -(q[1] - o[1]), ny = q[0] - o[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (ny * inner < 0) { nx = -nx; ny = -ny; }
      return [s + nx * d, t + ny * d];
    });
    const a = off(sh, 10), b = off(sh, 34);
    push(head(ext(toM([...a, ...b.reverse()]), 0.3, 0.01)), TURQ);
    for (const y of [-0.19, 0.19]) {
      const pts = off(sh, 6).map(([s, t]) => V3(s * KX, Y + y, ZC + (t - 587) * KX));
      push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.065, 4, false), GOLD);
    }
  }
  // the forged iron edge: a crimson band with the white-hot cutting line on its outer rim, both tapering into the horns
  push(head(ext(toM([...arc(0, 0, 1, (u) => Math.min(14, bw(u) * 0.5)), ...arc(0, 1, 0, (u) => bw(u)).slice(1, -1)]), 0.17, 0.02)), EDGEC);
  push(head(ext(toM([...arc(0, 0, 1, () => 0), ...arc(0, 1, 0, (u) => Math.min(14, bw(u) * 0.5)).slice(1, -1)]), 0.13, 0.01)), HOT);
  // the 內 behind the haft, a tassel of crimson tongues streaming from its end
  push(head(ext(toM([[-15, 540], [-120, 542], [-152, 522], [-166, 562], [-172, 624], [-15, 628]]), 0.17, 0.03)), TURQ);
  for (let i = 0; i < 5; i++) push(new THREE.ConeGeometry(0.07 + (i % 2) * 0.03, 1.5 + (i % 3) * 0.35, 4).rotateX(-Math.PI / 2).translate(-150 * KX + (i - 2) * 0.06, Y + ((i % 2) - 0.5) * 0.12, ZC + (515 - 587) * KX - 0.8), FIRE);
  return done(1 / SPIRIT_H);
}
/** 干盾 (crisis): a small Shang shield (0.5 x 1 m) facing +Z. */
export function shieldGeometry() {
  const { push, done } = builder();
  ganShield(push, 0.5, 1.0, [0, 0, 0], [0, 0, 0]);
  return done();
}
