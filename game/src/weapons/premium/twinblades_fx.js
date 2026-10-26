// 虹霓．雙絕 — procedural FX pieces (docs/PREMIUM_WEAPONS.md §2.33): the 虹橋 X wave (two crossing crescents, the
// warm 虹 arm and the cool 霓 arm), the 虹貫 dash path on the street, the KE_PRISM cut (a warm and a cool slash
// crossing on the body), the faint rainbow ring of the 虹輪 blade storm and the phantom sabre every spirit blade is
// made of (storm blades, the twelve 千刃蓮華 petals, the final-blow pair). Colours are HDR linear; a 虹 colour reads
// as gold -> vermilion, a 霓 one as cyan -> violet, both with a white-hot leading edge.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { materialUniforms } from '../../gfx/materials.js';

export const HONG = { core: [5.2, 3.6, 1.7], body: [2.6, 0.95, 0.22], tail: [0.9, 0.12, 0.04] };     // 虹: white-gold -> vermilion -> ember
export const NI = { core: [2.6, 3.4, 5.4], body: [0.75, 0.55, 2.7], tail: [0.32, 0.06, 0.75] };      // 霓: white-cyan -> violet -> deep violet

const NOISE = /* glsl */`
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }`;
const UV_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const additive = (frag, uniforms, o = {}) => new THREE.ShaderMaterial({ vertexShader: o.vert || UV_VERT, fragmentShader: frag, uniforms, transparent: true, depthWrite: false,
  side: THREE.DoubleSide, blending: THREE.AdditiveBlending, ...o.mat });
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// ------------------------------------------------------------------------------------------ 虹橋 X wave (world)
// Two crescents in a local frame travelling along -Z: each an arc band (uv.x along the arc, uv.y inner -> outer edge)
// whose tips sweep back behind the centre; arm 0 is turned +45° (the 虹 stroke), arm 1 -45° (霓). A white-hot outer
// edge, the body in the arm's colour, the tips feathered, a streaky shimmer; uAmt fades the whole wave.
const SPECTRUM = /* glsl */`
vec3 spectrum(float x) { return clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0), 2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0); }`;
const WAVE_FRAG = /* glsl */`
uniform float uAmt, uTime, uRev;
uniform vec3 uCore, uBody, uTail;
varying vec2 vUv;
${NOISE}
${SPECTRUM}
void main() {
  float x = vUv.x, y = vUv.y;
  float ends = smoothstep(0.0, 0.22, x) * smoothstep(1.0, 0.78, x);
  float mid = 1.0 - abs(x * 2.0 - 1.0);
  float edge = exp(-pow((1.0 - y) * 9.0, 2.0));                 // white-hot outer rim
  float body = smoothstep(0.0, 0.55, y) * (1.0 - edge * 0.6);
  float streak = 0.6 + 0.4 * vn(vec2(x * 40.0 - uTime * 6.0, y * 3.0));
  vec3 c = uCore * edge * (0.6 + 0.4 * mid) + mix(uTail, uBody, smoothstep(0.1, 0.8, y)) * body * streak;
  // a thin spectral fringe inside the rim (虹 red outermost, 霓 violet outermost)
  float f = clamp((y - 0.72) / 0.2, 0.0, 1.0), hue = uRev > 0.5 ? 0.78 * f : 0.78 * (1.0 - f);
  c += spectrum(hue) * exp(-pow((y - 0.83) * 13.0, 2.0)) * 1.5 * (0.6 + 0.4 * mid);
  gl_FragColor = vec4(c * ends * uAmt, 1.0);
}`;
function crescentGeo(R = 1.35, width = 0.42, arc = 2.0, sweep = 0.55, seg = 36) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = (u - 0.5) * arc, s = Math.sin(a), c = Math.cos(a);
    const back = sweep * (1 - c) / (1 - Math.cos(arc / 2));    // the tips trail behind the centre
    const w = width * (0.35 + 0.65 * Math.sin(Math.PI * u));
    pos.push(s * (R - w), c * (R - w), back * 0.8, s * R, c * R, back); uv.push(u, 0, u, 1);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.translate(0, -R * 0.62, 0);                                  // the arc's middle near the centre of the X
  return g;
}
let _crescent = null;
/** the X wave: a group of two crescent meshes (set amt on group.userData.mats[i].uniforms.uAmt) */
export function waveMesh() {
  _crescent ||= crescentGeo();
  const grp = new THREE.Group(), mats = [];
  [[HONG, Math.PI / 4], [NI, -Math.PI / 4]].forEach(([C, rot]) => {
    const m = additive(WAVE_FRAG, { uAmt: { value: 1 }, uTime: materialUniforms.time, uRev: { value: C === NI ? 1 : 0 }, uCore: { value: V3(C.core) }, uBody: { value: V3(C.body) }, uTail: { value: V3(C.tail) } });
    const mesh = new THREE.Mesh(_crescent, m);
    mesh.rotation.z = rot;
    mesh.frustumCulled = false; mesh.renderOrder = 8;
    grp.add(mesh); mats.push(m);
  });
  grp.userData.mats = mats;
  return grp;
}

// ------------------------------------------------------------------------------------------ 虹貫 dash path (ground)
// A strip along local -Z, length uLen (m), 1 m wide (scale x for the real width uW): a thin white-hot core line with a
// spectral fringe either side (虹 right: red outermost, 霓 left: violet outermost), motes running forward along it,
// two faint hairlines at the lane's edges, and at the far end a pulsing double ring with a cross (the landing mark);
// uAmt fades it, uHot brightens it at release. (A filled full-spectrum band read as a toy rainbow road.)
const PATH_VERT = /* glsl */`
varying vec2 vP;
void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PATH_FRAG = /* glsl */`
uniform float uLen, uAmt, uHot, uTime, uW;
varying vec2 vP;
${SPECTRUM}
void main() {
  float along = -vP.y, across = vP.x * 2.0;                      // along 0 .. uLen (m), across -1 .. 1
  if (along < 0.0 || along > uLen + 0.9) discard;
  float ax = abs(across);
  float fadeIn = smoothstep(0.0, 0.8, along), endFade = 1.0 - smoothstep(uLen - 0.45, uLen - 0.1, along);
  float core = exp(-pow(ax * 26.0, 2.0));
  float f = clamp((ax - 0.05) / 0.12, 0.0, 1.0), hue = across > 0.0 ? 0.78 * (1.0 - f) : 0.78 * f;
  float fr = smoothstep(0.03, 0.06, ax) * (1.0 - smoothstep(0.15, 0.21, ax));
  float m = fract(along * 0.9 - uTime * 2.6);
  float mote = exp(-pow((m - 0.5) * 12.0, 2.0)) * exp(-pow(ax * 10.0, 2.0));
  float rim = exp(-pow((ax - 0.92) * 30.0, 2.0)) * 0.22;
  vec2 e = vec2(vP.x * uW, along - uLen);
  float r = length(e);
  float ring = (exp(-pow((r - 0.6) * 24.0, 2.0)) + 0.6 * exp(-pow((r - 0.42) * 34.0, 2.0))) * (0.75 + 0.25 * sin(uTime * 9.0));
  float crs = (exp(-pow(e.x * 45.0, 2.0)) + exp(-pow(e.y * 45.0, 2.0))) * (1.0 - smoothstep(0.22, 0.32, r));
  vec3 W = vec3(2.7, 2.5, 2.3);
  vec3 c = (W * core * 1.2 + spectrum(hue) * fr * 1.7 + W * mote * 1.4 + vec3(1.5, 1.4, 1.8) * rim) * fadeIn * endFade + W * ring * 1.1 + vec3(2.3, 2.1, 2.7) * crs;
  gl_FragColor = vec4(c * uAmt * (1.0 + uHot * 2.0), 1.0);
}`;
export function pathMesh() {
  const g = new THREE.PlaneGeometry(1, 12, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -5.6);                                       // from 0.4 behind the feet to 11.6 ahead
  const m = additive(PATH_FRAG, { uLen: { value: 8 }, uAmt: { value: 0 }, uHot: { value: 0 }, uW: { value: 1.4 }, uTime: materialUniforms.time }, { vert: PATH_VERT, mat: { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 } });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false;
  return mesh;
}

// ------------------------------------------------------------------------------------------ KE_PRISM cut
// A cut line across the body: white-hot core in the arm's colour halo, swept in (uT 0 -> 1), fading (uFade).
const CUT_FRAG = /* glsl */`
uniform float uT, uFade;
uniform vec3 uCore, uHalo;
varying vec2 vUv;
void main() {
  float y = abs(vUv.y * 2.0 - 1.0);
  if (vUv.x > uT) discard;
  float core = exp(-y * y * 60.0), halo = exp(-y * y * 6.0);
  float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  float head = 1.0 + 1.5 * exp(-pow((uT - vUv.x) * 10.0, 2.0));
  gl_FragColor = vec4((uCore * core + uHalo * halo * 0.6) * ends * uFade * head, 1.0);
}`;
let _cutGeo = null;
/** a pair of crossing cuts (warm + cool) in one group; userData.mats[2] */
export function cutPair() {
  _cutGeo ||= new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
  const grp = new THREE.Group(), mats = [];
  for (const C of [HONG, NI]) {
    const m = additive(CUT_FRAG, { uT: { value: 0 }, uFade: { value: 1 }, uCore: { value: V3(C.core) }, uHalo: { value: V3(C.body) } });
    const mesh = new THREE.Mesh(_cutGeo, m);
    mesh.frustumCulled = false; mesh.renderOrder = 9;
    grp.add(mesh); mats.push(m);
  }
  grp.userData.mats = mats;
  grp.visible = false;
  return grp;
}

// ------------------------------------------------------------------------------------------ 虹輪 ground ring
// A faint rainbow annulus round the caster (r0 .. r1), spinning, the colour order walking round with the blades.
const RING_FRAG = /* glsl */`
uniform float uAmt, uPhase, uTime;
varying vec2 vUv;
vec3 spectrum(float x) { return clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0), 2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0); }
void main() {
  float a = fract(vUv.x - uPhase), y = vUv.y;
  float band = smoothstep(0.0, 0.35, y) * smoothstep(1.0, 0.6, y);
  float six = 0.35 + 0.65 * pow(0.5 + 0.5 * cos(a * 6.2831853 * 6.0), 6.0);
  vec3 c = spectrum(fract(a * 2.0)) * 0.55 + vec3(0.6);
  gl_FragColor = vec4(c * band * six * uAmt, 1.0);
}`;
export function orbitRing(r0 = 1.6, r1 = 3.2, seg = 96) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) { const u = i / seg, a = u * Math.PI * 2, s = Math.sin(a), c = Math.cos(a); pos.push(s * r0, 0, c * r0, s * r1, 0, c * r1); uv.push(u, 0, u, 1); }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = additive(RING_FRAG, { uAmt: { value: 0 }, uPhase: { value: 0 }, uTime: materialUniforms.time }, { mat: { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = 6;
  return mesh;
}

// ------------------------------------------------------------------------------------------ phantom sabre (GHOST)
// The sabre's own silhouette for fx.summons.ghost (glazed spirit look): a curved willow-leaf blade with a raised spine
// and a fuller groove, the dragon-head guard (skull block, snout, two swept horns, a jaw), the grip and the ring
// pommel. Real size (blade 0.62 m), the grip at the origin, the blade along +y, the edge towards -z. ~1.2k triangles.
function bladeGeo() {
  const rings = [], T = [];
  for (let i = 0; i <= 26; i++) T.push(0.02 + 0.62 * (1 - Math.pow(1 - i / 26, 1.15)));
  for (const t of T) {
    const u = (t - 0.02) / 0.62, sb = -0.022 - 0.038 * u * u;
    let W = 0.05 + 0.012 * Math.min(1, u * 1.6), se = sb + W;
    const pnt = -0.022 - 0.038 + 0.014;
    if (u > 0.75) { const v = (u - 0.75) / 0.25; se = pnt + (se - pnt) * Math.pow(Math.max(0, 1 - v * v), 0.55); }
    const sbk = u > 0.75 ? sb + (pnt - sb) * Math.pow((u - 0.75) / 0.25, 1.6) : sb;
    const h = 0.0032 * (1 - 0.7 * u);
    // spine, flat, ridge, edge (s = -z)
    const sec = [[sbk, 0], [sbk, h * 0.7], [sbk + 0.3 * (se - sbk), h], [sbk + 0.65 * (se - sbk), h * 0.85], [se, 0], [sbk + 0.65 * (se - sbk), -h * 0.85], [sbk + 0.3 * (se - sbk), -h], [sbk, -h * 0.7]];
    rings.push(sec.map(([s, w]) => [w, t, -s]));
  }
  return loftXYZ(rings, true, false);
}
function loftXYZ(rings, capA = true, capB = true) {
  const n = rings[0].length, pos = [], idx = [];
  for (const r of rings) for (const p of r) pos.push(...p);
  for (let k = 0; k + 1 < rings.length; k++) for (let j = 0; j < n; j++) {
    const a = k * n + j, b = k * n + (j + 1) % n, c = (k + 1) * n + j, d = (k + 1) * n + (j + 1) % n;
    idx.push(a, c, b, b, c, d);
  }
  const cap = (k, rev) => {
    const ci = pos.length / 3, c = [0, 0, 0];
    for (const p of rings[k]) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
    pos.push(...c);
    for (let j = 0; j < n; j++) { const a = k * n + j, b = k * n + (j + 1) % n; idx.push(...(rev ? [ci, b, a] : [ci, a, b])); }
  };
  if (capA) cap(0, false);
  if (capB) cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // outward winding
  let vol = 0;
  const P = pos;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    vol += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
  }
  if (vol < 0) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } }
  return g.toNonIndexed();
}
const _phantom = new Map();
/** the phantom sabre; wide > 1: a broader spirit blade (width x wide, thickness half as much) for the storm / petals */
export function phantomGeometry(wide = 1) {
  if (_phantom.has(wide)) return _phantom.get(wide);
  if (wide !== 1) {
    const g = toCreasedNormals(phantomGeometry(1).clone().scale(1 + (wide - 1) * 0.5, 1, wide), 0.7);
    g.computeBoundingBox();
    _phantom.set(wide, g);
    return g;
  }
  const parts = [bladeGeo()];
  // the head: a skull over the spine side, a snout along the blade, a jaw under the edge, two horns swept back
  const skull = new THREE.SphereGeometry(1, 12, 8); skull.scale(0.017, 0.034, 0.02); skull.translate(0, 0.03, 0.04);
  const snout = new THREE.SphereGeometry(1, 10, 6); snout.scale(0.012, 0.024, 0.012); snout.translate(0, 0.062, 0.034);
  const jaw = new THREE.SphereGeometry(1, 10, 6); jaw.scale(0.012, 0.028, 0.009); jaw.translate(0, 0.024, -0.036);
  const pearl = new THREE.IcosahedronGeometry(0.009, 1); pearl.translate(0, 0.05, -0.036);
  for (const sd of [1, -1]) {
    const horn = new THREE.ConeGeometry(0.0045, 0.06, 6); horn.rotateX(Math.PI * 0.82); horn.rotateZ(sd * 0.35); horn.translate(sd * 0.01, 0.0, 0.075);
    parts.push(horn);
  }
  const grip = new THREE.CylinderGeometry(0.014, 0.0145, 0.15, 10); grip.scale(1, 1, 1.2); grip.translate(0, -0.084, 0.002);
  const ring = new THREE.TorusGeometry(0.022, 0.005, 6, 16); ring.rotateY(Math.PI / 2); ring.translate(0, -0.192, 0.002);
  parts.push(skull, snout, jaw, pearl, grip, ring);
  const geos = parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position') n.deleteAttribute(k); return n; });
  const g = toCreasedNormals(mergeGeometries(geos, false), 0.7);
  g.computeBoundingBox();
  _phantom.set(1, g);
  return g;
}
