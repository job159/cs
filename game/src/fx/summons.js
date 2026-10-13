// Summons (PREMIUM_WEAPONS §1.7.3 beats ③–⑤, §1.10 KE_SHADOW, 05b §8.7): the CSO "giant spirit" moments,
// kept readable next to realistic zombies — spirits are translucent glazed porcelain (or black silhouettes)
// with an element-colour fresnel rim, never solid realistic creatures.
//   GHOST   any mesh / geometry (or a built-in shape) drawn as a glazed spirit: depth pre-pass so only the
//           front surface shows (no self-overlap mush), fresnel rim, glaze highlight, internal flowing light,
//           dissolve-in from the ground up (0.35 s) and dissolve-out from the extremities (0.5 s) with a hot
//           edge, exit burst of theme motes sampled from the body surface. One big spirit at a time (§1.7.3).
//   SHADOW  flat puppet clones (look 'piying' = original shadow-puppet swordsman: five riveted leather plates,
//           vermilion + ink with lace cut-outs, backlit, gold edge) propped up from the ground in 0.1 s.
//   SWARM   instanced flock (birds / fish / any shape): orbit, dive at targets (with trails), return / exit.
// Built-in procedural shapes (≤ 3k tris): bird (wing flap + long-tail option), fish (whale flukes), serpent
// (water dragon, travelling body wave), bell, stele, orb, blade. Weapon-specific spirits (lion, nian beast...)
// come from GLBs: pass `mesh` (Object3D) or `geometry`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hdr, GLSL_NOISE } from './kitutil.js';
import { FRAME } from './atlas.js';

// ------------------------------------------------------------------ ghost shader
const GHOST_VERT = /* glsl */`
attribute vec4 aAnim;          // x: wing span weight (signed), y: body-wave weight, z: along body 0..1 (head = 0)
#ifdef USE_INSTANCING
attribute vec4 aInst;          // x: phase, y: dissolve, z: flap rate multiplier, w: -
#endif
uniform float uTime;
uniform vec4 uFlap;            // amplitude (rad), rate (Hz), wave amplitude (m), wave rate (Hz)
uniform vec3 uWaveAxis;
uniform float uWaveLen;        // body waves per length
varying vec3 vN;
varying vec3 vV;
varying vec3 vObj;
varying float vDis;
void main() {
  vec3 p = position, n = normal;
  float ph = 0.0, rate = 1.0;
  vDis = 0.0;
#ifdef USE_INSTANCING
  ph = aInst.x; vDis = aInst.y; rate = aInst.z;
#endif
  if (aAnim.x != 0.0) {
    float w = min(1.0, abs(aAnim.x) * 1.3);
    float ang = (sin(uTime * uFlap.y * rate * 6.2831853 + ph) * uFlap.x + 0.12) * sign(aAnim.x) * w;
    float c = cos(ang), s = sin(ang);
    p.xy = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    n.xy = vec2(c * n.x - s * n.y, s * n.x + c * n.y);
  }
  p += uWaveAxis * sin(uTime * uFlap.w * 6.2831853 - aAnim.z * uWaveLen * 6.2831853 + ph) * uFlap.z * aAnim.y;
  vObj = p;
  vec4 lp = vec4(p, 1.0);
  vec3 ln = n;
#ifdef USE_INSTANCING
  lp = instanceMatrix * lp;
  ln = mat3(instanceMatrix) * ln;
#endif
  vec4 mv = modelViewMatrix * lp;
  vN = normalize(normalMatrix * ln);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const GHOST_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uBase, uCore, uRim, uEdge;
uniform vec4 uLook;            // opacity, rim power, glaze, dark (black silhouette 0..1)
uniform vec4 uDis;             // dissolve 0..1, mode (0 ground-up, 1 extremities first), flash, flow speed
uniform vec3 uBoxMin, uBoxSize, uCenter;
uniform vec3 uKey;             // key light direction (view space)
${GLSL_NOISE}
varying vec3 vN;
varying vec3 vV;
varying vec3 vObj;
varying float vDis;
void main() {
  vec3 q = (vObj - uBoxMin) / uBoxSize;                       // 0..1 inside the body's box
  float nz = texture2D(tNoise, q.xz * 1.7 + q.y * 0.35).r * 0.6 + texture2D(tNoise, q.zy * 3.1).g * 0.4;
  float dis = max(uDis.x, vDis);
  float edge = 0.0;
  if (dis > 0.001) {
    float f = uDis.y < 0.5 ? 1.0 - q.y * 0.82 - nz * 0.18                         // ground up: top goes last
                           : 1.0 - clamp(length((vObj - uCenter) / uBoxSize) * 1.4, 0.0, 1.0) * 0.75 - nz * 0.25; // limbs first
    float e = f - dis * 1.15 + 0.05;
    if (e < 0.0) discard;
    edge = 1.0 - smoothstep(0.0, 0.06, e);
  }
#ifdef PREPASS
  gl_FragColor = vec4(0.0);
#else
  vec3 N = normalize(vN), V = normalize(vV);
  if (!gl_FrontFacing) N = -N;
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  float fres = pow(1.0 - ndv, uLook.y);
  // glaze: a sharp key highlight + a soft sky gradient (porcelain), internal light flowing upwards
  vec3 R = reflect(-V, N);
  float spec = pow(max(dot(R, uKey), 0.0), 60.0) * uLook.z;
  float sky = 0.55 + 0.45 * N.y;
  float fl = texture2D(tNoise, vec2(q.x * 0.45 + q.z * 0.3, q.y * 0.7 - uTime * uDis.w * 0.4)).g;
  float flow = pow(1.0 - abs(fl * 2.0 - 1.0), 7.0);                // thin veins of light drifting up the body
  float cloud = texture2D(tNoise, vec2(q.x * 0.3 - q.z * 0.2, q.y * 0.45 - uTime * uDis.w * 0.2)).r;
  vec3 body = mix(uBase, uCore * 0.6, smoothstep(0.45, 0.8, cloud) * 0.5) * sky;
  body = mix(body, vec3(0.01, 0.008, 0.012), uLook.w);
  float a = clamp(uLook.x + fres * 0.45 + spec * 0.6, 0.0, 1.0);
  vec3 emit = uRim * fres * 2.2 + vec3(1.0, 0.97, 0.92) * spec * 2.0 + uCore * flow * 0.9 * (1.0 - uLook.w);
  emit += uEdge * edge * 6.0 + vec3(1.0) * uDis.z * (0.4 + fres);
  gl_FragColor = vec4(body * a + emit, a);
#endif
}`;

// ------------------------------------------------------------------ procedural shapes
function withAnim(g, fn) {
  if (g.attributes.uv) g.deleteAttribute('uv');
  const p = g.attributes.position, n = p.count;
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const r = fn(p.getX(i), p.getY(i), p.getZ(i)); a[i * 4] = r[0]; a[i * 4 + 1] = r[1]; a[i * 4 + 2] = r[2]; a[i * 4 + 3] = 0; }
  g.setAttribute('aAnim', new THREE.BufferAttribute(a, 4));
  return g;
}
function grid(cols, rows, fn) {
  // (u, v) grid surface, fn(u, v) -> [x, y, z]; two-sided via the material
  const pos = [], idx = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) pos.push(...fn(i / cols, j / rows));
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function tube(n, seg, radius, path) {
  // generalised tube along path(t) (t 0 head .. 1 tail) with radius(t); rings perpendicular to the path
  const pos = [], idx = [];
  const P = new THREE.Vector3(), P2 = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    path(t, P); path(Math.min(1, t + 0.01), P2);
    T.subVectors(P2, P); if (T.lengthSq() < 1e-10) path(Math.max(0, t - 0.01), P2), T.subVectors(P, P2);
    T.normalize();
    N.crossVectors(up, T); if (N.lengthSq() < 1e-6) N.set(1, 0, 0); N.normalize();
    B.crossVectors(T, N);
    const r = radius(t);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      pos.push(P.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r, P.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r, P.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < seg; k++) { const a = i * (seg + 1) + k, b = a + 1, c = a + seg + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const SHAPES = {
  // bird ~1 m long, beak towards -z, wings along ±x. opts.tail: tail length multiplier (magpie 2.4)
  bird(o = {}) {
    const tl = o.tail ?? 1;
    const parts = [];
    parts.push(withAnim(new THREE.SphereGeometry(0.5, 12, 8).scale(0.17, 0.15, 0.46), () => [0, 0, 0.4]));
    parts.push(withAnim(new THREE.SphereGeometry(0.5, 10, 8).scale(0.15, 0.15, 0.17).translate(0, 0.05, -0.27), () => [0, 0, 0]));
    parts.push(withAnim(new THREE.ConeGeometry(0.03, 0.12, 6).rotateX(-Math.PI / 2).translate(0, 0.04, -0.4), () => [0, 0, 0]));
    // tail: tapered strip, slightly fanned, long for the magpie
    parts.push(withAnim(grid(2, 6, (u, v) => { const w = 0.05 + 0.07 * v; return [(u - 0.5) * 2 * w, 0.02 - v * 0.06 * tl * 0.3, 0.18 + v * 0.42 * tl]; }), (x, y, z) => [0, 0.6 * Math.min(1, (z - 0.18) / 0.4), 1]));
    // wings: swept, tapering, primaries splayed into a notched trailing edge
    for (const s of [-1, 1]) {
      parts.push(withAnim(grid(8, 2, (u, v) => {
        const x = s * (0.06 + u * 0.68);
        const lead = -0.12 + u * 0.12, chord = 0.32 * (1 - u * 0.7);
        const notch = u > 0.55 ? 0.05 * Math.abs(Math.sin(u * 30)) : 0;
        return [x, 0.02 + u * 0.04, lead + v * (chord + notch * v)];
      }), (x) => [x / 0.74, 0, 0.3]));
    }
    return mergeGeometries(parts);
  },
  // fish / whale (鯤) ~1 m, mouth at -z, horizontal flukes; body wave weight grows towards the tail
  fish() {
    const prof = [[0, -0.5], [0.07, -0.47], [0.12, -0.38], [0.15, -0.2], [0.14, 0.0], [0.11, 0.2], [0.06, 0.36], [0.025, 0.46], [0, 0.48]];
    const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14).rotateX(Math.PI / 2);
    const parts = [withAnim(lathe, (x, y, z) => [0, Math.max(0, (z + 0.1) / 0.6) ** 1.5, (z + 0.5)])];
    const fluke = grid(6, 2, (u, v) => { const s = u * 2 - 1; return [s * 0.28, 0, 0.44 + Math.abs(s) * 0.12 + v * (0.12 - Math.abs(s) * 0.06)]; });
    parts.push(withAnim(fluke, (x, y, z) => [0, 1.2, 1]));
    for (const s of [-1, 1]) parts.push(withAnim(grid(3, 1, (u, v) => [s * (0.12 + u * 0.16), -0.05 - u * 0.04, -0.15 + u * 0.08 + v * (0.12 - u * 0.08)]), () => [0, 0.1, 0.35]));
    return mergeGeometries(parts);
  },
  // water dragon (螭吻 spirit): long tapering body along +y (head at the top), horns, whiskers, dorsal spikes
  serpent() {
    const L = 1;
    const path = (t, out) => out.set(Math.sin(t * 7.0) * 0.13 * (0.3 + t), (1 - t) * L, Math.cos(t * 5.2) * 0.1 * (0.3 + t));
    const body = tube(72, 14, (t) => 0.06 * (t < 0.05 ? 0.8 + t * 4 : Math.max(0.1, 1 - Math.pow(t, 1.5) * 0.92)), path);
    const parts = [withAnim(body, (x, y) => { const t = 1 - y / L; return [0, Math.min(1, t * 1.6), t]; })];
    // head: elongated skull + jaw, pointing up-forward
    const head = new THREE.SphereGeometry(0.5, 14, 10).scale(0.1, 0.085, 0.19).rotateX(-0.45).translate(0, L + 0.03, -0.06);
    const jaw = new THREE.SphereGeometry(0.5, 10, 6).scale(0.075, 0.04, 0.15).rotateX(-0.15).translate(0, L - 0.035, -0.09);
    parts.push(withAnim(head, () => [0, 0, 0]), withAnim(jaw, () => [0, 0, 0]));
    for (const s of [-1, 1]) {
      parts.push(withAnim(new THREE.ConeGeometry(0.014, 0.16, 5).rotateX(0.9).rotateZ(-s * 0.35).translate(s * 0.045, L + 0.12, 0.05), () => [0, 0, 0]));
      const wh = tube(12, 4, (t) => 0.007 * (1 - t * 0.8), (t, out) => out.set(s * (0.05 + t * 0.22), L - 0.03 - t * 0.1 + Math.sin(t * 5) * 0.03, -0.14 + t * 0.08));
      parts.push(withAnim(wh, () => [0, 0, 0]));
    }
    // dorsal spikes along the back
    for (let i = 0; i < 16; i++) {
      const t = 0.07 + i * 0.055, P = path(t, new THREE.Vector3());
      const h = 0.06 * (1 - t * 0.7);
      parts.push(withAnim(new THREE.ConeGeometry(0.018 * (1 - t * 0.5), h, 4).rotateX(-0.5).translate(P.x, P.y, P.z + 0.055 * (1 - t * 0.6)), () => [0, Math.min(1, t * 1.6), t]));
    }
    return mergeGeometries(parts);
  },
  bell() {
    const prof = [[0.02, 1.0], [0.18, 0.98], [0.3, 0.9], [0.34, 0.7], [0.36, 0.4], [0.42, 0.12], [0.5, 0.02], [0.47, 0.0], [0.38, 0.04]];
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
    const loop = new THREE.TorusGeometry(0.08, 0.025, 6, 14).translate(0, 1.07, 0);
    return mergeGeometries([withAnim(g, () => [0, 0, 0]), withAnim(loop, () => [0, 0, 0])]);
  },
  stele() {
    const slab = new THREE.BoxGeometry(0.62, 1.6, 0.18, 2, 6, 1).translate(0, 0.95, 0);
    const cap = new THREE.CylinderGeometry(0.31, 0.31, 0.18, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 1.75, 0);
    const base = new THREE.BoxGeometry(0.9, 0.16, 0.4).translate(0, 0.08, 0);
    return mergeGeometries([slab, cap, base].map((g) => withAnim(g, () => [0, 0, 0])));
  },
  orb() { return withAnim(new THREE.IcosahedronGeometry(0.5, 3), () => [0, 0, 0]); },
  blade() {
    const g = grid(2, 10, (u, v) => { const w = 0.07 * Math.sin(Math.PI * Math.min(1, v * 1.1)) + 0.01; return [(u - 0.5) * 2 * w, 0, -v]; });
    return withAnim(g, (x, y, z) => [0, 0.3 * -z, -z]);
  },
};

// ------------------------------------------------------------------ piying (shadow puppet) texture
let puppetCanvas = null;
function puppetTexture() {
  if (puppetCanvas) return puppetCanvas;
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const RED = '#b3122a', INK = '#16100e', GOLD = '#ffd77a', BLADE = '#c9d4dc';
  const cut = (fn) => { c.save(); c.globalCompositeOperation = 'destination-out'; fn(); c.restore(); };
  const outline = (path, w = 3) => { c.save(); c.strokeStyle = GOLD; c.lineWidth = w; c.lineJoin = 'round'; c.stroke(path); c.restore(); };
  // torso: robe with flared hem, belt, collar; boots under the hem; lace cut-outs (cloud rows, diamonds)
  const robe = new Path2D('M60,40 C80,20 140,20 160,40 L178,150 L200,300 L20,300 L42,150 Z');
  c.fillStyle = RED; c.fill(robe);
  c.fillStyle = INK; c.fillRect(44, 140, 132, 22);
  c.beginPath(); c.moveTo(80, 30); c.lineTo(110, 70); c.lineTo(140, 30); c.closePath(); c.fill();
  c.fillRect(54, 300, 40, 40); c.fillRect(126, 300, 40, 40);
  cut(() => {
    for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) {
      const x = 46 + k * 26 + (r % 2) * 13, y = 186 + r * 28;
      c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x + 7, y); c.lineTo(x, y + 8); c.lineTo(x - 7, y); c.closePath(); c.fill();
    }
    for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(70 + k * 27, 100, 8, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(70 + k * 27, 100, 3, 0, Math.PI * 2); }
    c.fillRect(48, 148, 124, 4);
  });
  outline(robe);
  c.strokeStyle = GOLD; c.lineWidth = 2;
  for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) { const x = 46 + k * 26 + (r % 2) * 13, y = 186 + r * 28; c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 8, y); c.lineTo(x, y + 9); c.lineTo(x - 8, y); c.closePath(); c.stroke(); }
  for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(70 + k * 27, 100, 9, 0, Math.PI * 2); c.stroke(); }
  // head (profile facing right): helmet with plume, hollow face outlined, eye slit
  c.save(); c.translate(200, 0);
  const helm = new Path2D('M20,60 C20,20 70,8 100,30 L104,58 Z');
  c.fillStyle = INK; c.fill(helm);
  c.beginPath(); c.moveTo(30, 30); c.bezierCurveTo(10, 0, -10, 10, -5, 40); c.lineWidth = 7; c.strokeStyle = RED; c.stroke();
  const face = new Path2D('M30,58 L104,58 C112,70 116,80 108,88 C114,96 108,104 100,106 L96,122 L42,122 C30,110 28,80 30,58 Z');
  c.fillStyle = '#e8c9a0'; c.fill(face);
  cut(() => { c.fill(new Path2D('M40,66 L92,66 C98,78 98,90 92,98 L88,114 L48,114 C38,100 38,80 40,66 Z')); });
  c.fillStyle = INK; c.beginPath(); c.moveTo(70, 74); c.lineTo(96, 72); c.lineTo(92, 78); c.closePath(); c.fill();
  outline(helm, 2.5); outline(face, 2.5);
  c.fillStyle = GOLD; c.beginPath(); c.arc(70, 118, 5, 0, Math.PI * 2); c.fill();
  c.restore();
  // back arm: long flowing sleeve
  c.save(); c.translate(330, 0);
  const sleeve = new Path2D('M20,20 L60,14 C110,30 160,60 172,120 C150,130 120,110 100,128 C80,100 40,70 14,40 Z');
  c.fillStyle = RED; c.fill(sleeve);
  cut(() => { for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(70 + k * 22, 50 + k * 16, 6, 10, 0.6, 0, Math.PI * 2); c.fill(); } });
  outline(sleeve); c.fillStyle = GOLD; c.beginPath(); c.arc(28, 28, 6, 0, Math.PI * 2); c.fill();
  c.restore();
  // sword arm: sleeve + hand + dao (slightly curved broadsword) with a gold guard
  c.save(); c.translate(0, 360);
  const arm = new Path2D('M10,40 C50,20 120,24 170,40 L178,70 C120,76 60,80 12,70 Z');
  c.fillStyle = RED; c.fill(arm);
  cut(() => { for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(40 + k * 26, 52, 6, 0, Math.PI * 2); c.fill(); } });
  outline(arm);
  c.fillStyle = '#e8c9a0'; c.beginPath(); c.ellipse(190, 55, 16, 14, 0, 0, Math.PI * 2); c.fill(); outline(new Path2D('M174,55 a16,14 0 1,0 32,0 a16,14 0 1,0 -32,0'), 2);
  c.fillStyle = GOLD; c.fillRect(200, 38, 12, 36);
  const blade = new Path2D('M212,46 L470,40 C492,40 506,50 508,58 C470,66 300,68 212,66 Z');
  c.fillStyle = BLADE; c.fill(blade); outline(blade, 2);
  c.fillStyle = GOLD; c.beginPath(); c.arc(20, 55, 7, 0, Math.PI * 2); c.fill();
  c.restore();
  // bamboo rod
  c.fillStyle = '#6b5432'; c.fillRect(490, 140, 10, 210);
  puppetCanvas = cv;
  return cv;
}
// atlas rects (px, y down) for the puppet parts: [x, y, w, h]
const PUP = { torso: [10, 10, 200, 340], head: [200, 0, 130, 130], sleeve: [330, 0, 182, 140], arm: [0, 360, 512, 110], rod: [488, 140, 14, 210] };

const PUP_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PUP_FRAG = /* glsl */`
uniform sampler2D tMap;
uniform float uGlow, uFade;
uniform vec3 uBack;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(tMap, vUv);
  if (t.a < 0.5 || t.a < uFade) discard;
  float lum = max(t.r, max(t.g, t.b));
  // backlit leather: colours glow warm, gold edges bloom
  vec3 c = t.rgb * t.rgb * uBack * uGlow * (1.0 + 2.5 * smoothstep(0.82, 0.98, lum) * step(0.6, t.g));
  gl_FragColor = vec4(c, 1.0);
}`;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _o = new THREE.Object3D();
const UP = new THREE.Vector3(0, 1, 0);

export class Summons {
  constructor(kit) {
    this.kit = kit;
    this.fx = kit.fx;
    this.game = kit.game;
    this.ghosts = [];
    this.shadows = [];
    this.swarms = [];
    this.geoCache = new Map();
    this.key = { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() };
    // precompile both ghost programs (plain + instanced) and the puppet program with hidden meshes
    const g = this._shape('orb');
    const pre = this._materials({});
    const inst = new THREE.InstancedMesh(g, pre.color, 1);
    for (const m of [new THREE.Mesh(g, pre.depth), new THREE.Mesh(g, pre.color), inst, new THREE.InstancedMesh(g, pre.depth, 1)]) { m.visible = false; m.frustumCulled = false; this.game.scene.add(m); }
    const pup = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: PUP_VERT, fragmentShader: PUP_FRAG, side: THREE.DoubleSide,
      uniforms: { tMap: { value: null }, uGlow: { value: 1 }, uFade: { value: 0 }, uBack: { value: new THREE.Vector3(1, 1, 1) } } }));
    pup.visible = false; pup.frustumCulled = false; this.game.scene.add(pup);
    this._pupTex = null;
  }

  _shape(name, o = {}) {
    const key = name + JSON.stringify(o);
    if (!this.geoCache.has(key)) {
      const g = (SHAPES[name] || SHAPES.orb)(o);
      g.computeBoundingBox();
      this.geoCache.set(key, g);
    }
    return this.geoCache.get(key);
  }

  _materials(o, instanced = false, geo = null) {
    const k = this.kit;
    const box = geo?.boundingBox || new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
    const size = box.getSize(new THREE.Vector3()).max(new THREE.Vector3(1e-3, 1e-3, 1e-3));
    const u = {
      uTime: k.time, tNoise: k.noise, uKey: this.key,
      uBase: { value: hdr(o.base ?? [0.85, 0.82, 0.76]) }, uCore: { value: hdr(o.core ?? [1.6, 1.2, 0.6]) },
      uRim: { value: hdr(o.rim ?? [2.4, 1.4, 0.5]) }, uEdge: { value: hdr(o.edge ?? o.rim ?? [3, 1.6, 0.6]) },
      uLook: { value: new THREE.Vector4(o.opacity ?? 0.5, o.rimPower ?? 2.6, o.glaze ?? 1, o.dark ? 1 : 0) },
      uDis: { value: new THREE.Vector4(1, 0, 0, o.flowSpeed ?? 0.25) },
      uFlap: { value: new THREE.Vector4(o.flap?.amp ?? 0.7, o.flap?.hz ?? 2.2, o.wave?.amp ?? 0, o.wave?.hz ?? 0.6) },
      uWaveAxis: { value: new THREE.Vector3(...(o.wave?.axis ?? [1, 0, 0])) }, uWaveLen: { value: o.wave?.len ?? 1.2 },
      uBoxMin: { value: box.min.clone() }, uBoxSize: { value: size }, uCenter: { value: box.getCenter(new THREE.Vector3()) },
    };
    const depth = new THREE.ShaderMaterial({ vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG, uniforms: u, defines: { PREPASS: '' }, colorWrite: false, side: THREE.DoubleSide });
    const color = new THREE.ShaderMaterial({ vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG, uniforms: u, transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    return { depth, color, u };
  }

  // ------------------------------------------------------------------ GHOST
  /**
   * Glazed spirit summon. opts:
   *   shape ('bird' | 'fish' | 'serpent' | 'bell' | 'stele' | 'orb' | 'blade') or mesh (Object3D, its meshes are
   *   re-skinned) or geometry; shapeOpts (e.g. { tail: 2.4 }); pos, yaw (rad) or quat; size (m: scales the
   *   shape's 1 m unit); colors: base (glaze body), core (inner light), rim (fresnel), edge (dissolve edge);
   *   opacity (0.35–0.6), glaze (highlight), dark (black silhouette + rim), rimPower;
   *   appear (s, ground-up dissolve, default 0.35), life (s, Infinity = until dissolveOut()), out (s, 0.5);
   *   motion: 'rise' (comes up out of the ground while appearing) | 'hover' | null; bob (m);
   *   flap { amp, hz } (bird wings), wave { amp (m in shape units), hz, axis [x,y,z], len } (body wave);
   *   exit { kind (MOTE key, 'spray' = water), count, palette, color, speed }; big (true: only one big spirit
   *   at a time, the previous one dissolves); seed.
   * Returns a handle { obj, t, alive, dissolveOut(dur), flash(k), lunge(target, dur), remove() }.
   */
  ghost(opts = {}) {
    const geo = opts.geometry || (opts.mesh ? null : this._shape(opts.shape || 'orb', opts.shapeOpts));
    const obj = new THREE.Group();
    const mats = [];
    const add = (g, parent, xf) => {
      if (!g.boundingBox) g.computeBoundingBox();
      if (!g.attributes.aAnim) g.setAttribute('aAnim', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 4), 4));
      const m = this._materials(opts, false, g);
      const a = new THREE.Mesh(g, m.depth), b = new THREE.Mesh(g, m.color);
      a.renderOrder = 24; b.renderOrder = 25; a.frustumCulled = b.frustumCulled = false;
      if (xf) { a.matrixAutoUpdate = b.matrixAutoUpdate = false; a.matrix.copy(xf); b.matrix.copy(xf); }
      parent.add(a, b);
      mats.push(m);
    };
    if (geo) add(geo, obj);
    else {
      opts.mesh.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(opts.mesh.matrixWorld).invert();
      opts.mesh.traverse((o) => { if (o.isMesh) add(o.geometry, obj, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); });
    }
    const size = opts.size ?? 1;
    obj.scale.setScalar(size);
    if (opts.pos) obj.position.copy(opts.pos);
    if (opts.quat) obj.quaternion.copy(opts.quat); else obj.rotation.y = opts.yaw ?? 0;
    this.game.scene.add(obj);
    const h = {
      obj, mats, t: 0, alive: true, size, appear: opts.appear ?? 0.35, life: opts.life ?? 3, out: opts.out ?? 0.5, outT: -1,
      motion: opts.motion ?? 'hover', bob: opts.bob ?? 0.03 * size, base: obj.position.clone(), flashT: 0, exit: opts.exit, big: opts.big ?? size > 3, rand: rng(opts.seed ?? (Math.random() * 1e9) | 0),
      dissolveOut: (dur) => { if (h.outT < 0) { if (dur !== undefined) h.out = dur; h.outT = 0; this._exitBurst(h); } },
      flash: (k = 1) => { h.flashT = 0.12 * k; },
      lunge: (target, dur = 0.35) => { h.lungeFrom = h.base.clone(); h.lungeTo = target.clone(); h.lungeT = 0; h.lungeDur = dur; },
      remove: () => this._removeGhost(h),
    };
    if (h.big) for (const o of this.ghosts) if (o.big && o.outT < 0) o.dissolveOut(0.3);
    this.ghosts.push(h);
    this._updateGhost(h, 0);
    return h;
  }

  _exitBurst(h) {
    const ex = h.exit;
    if (!ex) return;
    // sample points on the body surface (world space) and throw theme motes off them
    const n = Math.round((ex.count ?? 24) * (this.kit.low ? 0.5 : 1));
    const meshes = [];
    h.obj.traverse((o) => { if (o.isMesh && o.material.colorWrite !== false) meshes.push(o); });
    if (!meshes.length) return;
    h.obj.updateMatrixWorld(true);
    const r = h.rand;
    for (let i = 0; i < n; i++) {
      const m = meshes[(r() * meshes.length) | 0];
      const pa = m.geometry.attributes.position;
      const vi = (r() * pa.count) | 0;
      _v.fromBufferAttribute(pa, vi).applyMatrix4(m.matrixWorld);
      _w.subVectors(_v, h.obj.position).normalize().multiplyScalar((ex.speed ?? 2) * (0.5 + r())).add(UP.clone().multiplyScalar(ex.up ?? 1));
      if (ex.kind === 'spray') {
        const sk = Math.min(3, Math.max(1, h.size / 3));
        this.fx.particles.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: _w.x, vy: _w.y + 1, vz: _w.z, life: 0.6 + r() * 0.5, size: 0.03 * sk, stretch: 0.03, color: [0.85, 0.92, 1, 0.8], color1: [0.85, 0.92, 1, 0], frame: FRAME.drop, gravity: 9.8 });
        if (i % 3 === 0) this.fx.particles.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: _w.x * 0.3, vy: 0.4, vz: _w.z * 0.3, life: 0.9, size: 0.25 * sk, size1: 0.7 * sk, color: [0.9, 0.95, 1, 0.35], color1: [0.9, 0.95, 1, 0], frame: FRAME.puff, lit: true, drag: 2 });
      } else {
        const color = ex.palette ? ex.palette[(r() * ex.palette.length) | 0] : ex.color;
        this.fx.motes.spawn(ex.kind || 'goldpaper', _v, { vel: _w.clone(), color, rand: r, life: ex.life, scale: ex.scale ?? Math.min(3, Math.max(1, h.size / 3)) });
      }
    }
  }

  _updateGhost(h, dt) {
    h.t += dt;
    const t = h.t;
    let dis = t < h.appear ? 1 - t / h.appear : 0;
    let mode = 0;
    if (h.outT < 0 && Number.isFinite(h.life) && t >= h.life) h.dissolveOut();
    if (h.outT >= 0) { h.outT += dt; dis = Math.min(1, h.outT / h.out); mode = 1; if (h.outT >= h.out) { this._removeGhost(h); return false; } }
    h.flashT = Math.max(0, h.flashT - dt);
    const flash = Math.max(t < 0.12 ? 1 - t / 0.12 : 0, h.flashT / 0.12) * 0.6;
    for (const m of h.mats) m.u.uDis.value.set(dis, mode, flash, m.u.uDis.value.w);
    // motion
    const p = h.obj.position;
    if (h.lungeTo) {
      h.lungeT += dt;
      const k = Math.min(1, h.lungeT / h.lungeDur), e = Math.sin(k * Math.PI);
      p.lerpVectors(h.lungeFrom, h.lungeTo, e);
      if (k >= 1) h.lungeTo = null;
    } else if (h.motion === 'rise') {
      const k = Math.min(1, t / Math.max(0.05, h.appear * 1.4));
      p.copy(h.base); p.y += (1 - (1 - k) ** 3 - 1) * h.size * 0.35 + Math.sin(t * 1.3) * h.bob;
    } else if (h.motion === 'hover') { p.copy(h.base); p.y += Math.sin(t * 1.3) * h.bob; }
    return true;
  }

  _removeGhost(h) {
    if (!h.alive) return;
    h.alive = false;
    h.obj.removeFromParent();
    for (const m of h.mats) { m.depth.dispose(); m.color.dispose(); }
    const i = this.ghosts.indexOf(h); if (i >= 0) this.ghosts.splice(i, 1);
  }

  // ------------------------------------------------------------------ SHADOW (piying puppets)
  /**
   * Shadow-puppet clone (M02 皮影刀客 and KE_SHADOW style). pos (ground), opts: height (1.8 m), face (Vector3 the
   * puppet looks towards; default the camera), rise (0.1 s prop-up), life (s), slashes (count), every (s
   * between slashes), glow (backlight HDR), seed. Returns { obj, slash(), stop(), alive, tip(out) }.
   */
  shadow(pos, opts = {}) {
    if (!this._pupTex) {
      const t = new THREE.CanvasTexture(puppetTexture());
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      this._pupTex = t;
    }
    const tex = this._pupTex;
    const u = { tMap: { value: tex }, uGlow: { value: opts.glow ?? 1.6 }, uFade: { value: 0 }, uBack: { value: hdr(opts.back ?? [1.25, 0.95, 0.75]) } };
    const mat = new THREE.ShaderMaterial({ vertexShader: PUP_VERT, fragmentShader: PUP_FRAG, uniforms: u, side: THREE.DoubleSide });
    const S = 512;
    const plate = (rect, w, h, px, py) => {
      // plane with its pivot at (px, py) in plate units (0..1 from the left / bottom)
      const g = new THREE.PlaneGeometry(w, h).translate(w * (0.5 - px), h * (0.5 - py), 0);
      const [x, y, rw, rh] = rect, uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * rw) / S, 1 - (y + (1 - uv.getY(i)) * rh) / S);
      return new THREE.Mesh(g, mat);
    };
    const H = (opts.height ?? 1.8) / 1.8;
    const root = new THREE.Group();     // hinge at the feet: rotates up from the ground
    const body = new THREE.Group(); root.add(body);
    const torso = plate(PUP.torso, 0.62, 1.05, 0.5, 0.0); torso.position.set(0, 0.08, 0); body.add(torso);
    const rod = plate(PUP.rod, 0.035, 0.6, 0.5, 0.0); rod.position.set(0.02, -0.5, -0.01); torso.add(rod);
    const head = plate(PUP.head, 0.42, 0.42, 0.45, 0.08); head.position.set(0.03, 1.0, 0.002); torso.add(head);
    const sleeve = plate(PUP.sleeve, 0.52, 0.4, 0.08, 0.85); sleeve.position.set(-0.05, 0.9, -0.004); torso.add(sleeve);
    const arm = plate(PUP.arm, 1.1, 0.24, 0.03, 0.5); arm.position.set(0.06, 0.88, 0.006); torso.add(arm);
    for (const m of [torso, rod, head, sleeve, arm]) { m.renderOrder = 5; m.frustumCulled = false; }
    root.scale.setScalar(H);
    root.position.copy(pos);
    this.game.scene.add(root);
    const r = rng(opts.seed ?? (Math.random() * 1e9) | 0);
    const h = {
      obj: root, mat, arm, head, sleeve, t: 0, alive: true, life: opts.life ?? 1.6, rise: opts.rise ?? 0.1, face: opts.face || null,
      slashes: opts.slashes ?? 0, every: opts.every ?? 0.3, nextSlash: (opts.delay ?? 0.15) + r() * 0.08, slashT: -1, trail: null, swing: opts.trailColor ?? [3, 0.5, 0.35],
      slash: () => { h.slashT = 0; },
      tip: (out = new THREE.Vector3()) => { arm.updateMatrixWorld(true); return out.set(1.05, 0, 0).applyMatrix4(arm.matrixWorld); },
      stop: () => { h.life = Math.min(h.life, h.t + 0.25); },
    };
    this.shadows.push(h);
    this._updateShadow(h, 0);
    return h;
  }

  _updateShadow(h, dt) {
    h.t += dt;
    const t = h.t;
    // stand up from lying flat (prop-up on the rod), slight overshoot; fall back + fade on exit
    const up = Math.min(1, t / h.rise);
    const over = up < 1 ? up * up * (3 - 2 * up) * 1.08 : 1 + 0.08 * Math.exp(-(t - h.rise) * 14) * Math.cos((t - h.rise) * 30);
    const end = Math.max(0, (t - (h.life - 0.25)) / 0.25);
    const cam = this.game.camera.position;
    const face = h.face || cam;
    // upright billboard: plates face the camera; mirrored so the puppet looks towards `face`
    const yaw = Math.atan2(cam.x - h.obj.position.x, cam.z - h.obj.position.z);
    h.obj.rotation.set(0, 0, 0);
    h.obj.rotation.y = yaw;
    _v.set(Math.cos(yaw), 0, -Math.sin(yaw));                 // the plates' +x in the world
    const right = _w.subVectors(face, h.obj.position).dot(_v) >= 0 || face === cam;
    h.obj.children[0].scale.x = right ? 1 : -1;
    h.obj.children[0].rotation.x = -(Math.PI / 2) * (1 - Math.min(1.08, over)) - end * 0.9;
    h.mat.uniforms.uFade.value = end;
    // slashes: the sword arm whips from raised to low; a blade trail follows the tip
    if (h.slashes > 0 && h.slashT < 0 && t >= h.nextSlash && t < h.life - 0.3) { h.slashT = 0; h.slashes--; h.nextSlash = t + h.every; }
    let armAng = 0.9 + Math.sin(t * 3) * 0.05;
    if (h.slashT >= 0) {
      h.slashT += dt;
      const k = Math.min(1, h.slashT / 0.12);
      armAng = 1.3 - k * k * 2.1;
      if (!h.trail) h.trail = this.fx.trail({ width: 0.1, life: 0.12, color: [2.2, 1.6, 1.2, 0.7], color1: [...h.swing, 0.5] });
      const root = h.arm.localToWorld(_v.set(0.45, 0, 0)), tip = h.arm.localToWorld(new THREE.Vector3(1.07, 0, 0));
      h.trail.push(root, tip);
      if (h.slashT > 0.2) { h.trail.stop(); h.trail = null; h.slashT = -1; }
    }
    h.arm.rotation.z = armAng;
    h.sleeve.rotation.z = -0.3 + Math.sin(t * 2.4) * 0.08;
    h.head.rotation.z = Math.sin(t * 1.7) * 0.04;
    if (t >= h.life) { this._removeShadow(h); return false; }
    return true;
  }

  _removeShadow(h) {
    if (!h.alive) return;
    h.alive = false;
    h.trail?.stop();
    h.obj.removeFromParent();
    h.mat.dispose();
    // paper scraps of the puppet scatter (vermilion + ink)
    this.fx.motes.burst('paper', _v.copy(h.obj.position).setY(h.obj.position.y + 0.9), 6, { palette: [[0.55, 0.04, 0.05], [0.05, 0.04, 0.04]], speed: 1.2, radius: 0.3 });
    const i = this.shadows.indexOf(h); if (i >= 0) this.shadows.splice(i, 1);
  }

  // ------------------------------------------------------------------ SWARM (instanced flock)
  /**
   * Instanced flock of ghost spirits. opts: shape ('bird'), shapeOpts, count (12), center (Vector3, or a function
   * returning one), radius (m, orbit), height (m above center), size (m), speed (rad/s orbit), colours as ghost(),
   * life, appear, seed, trails (true: diving members drag a TRAIL), trailColor.
   * Returns { obj, center, dive(i, target, dur), diveAll(targets, every), exit(point?), stop(), alive }.
   */
  swarm(opts = {}) {
    const n = opts.count ?? 12;
    const geo = this._shape(opts.shape || 'bird', opts.shapeOpts);
    const m = this._materials({ ...opts, flap: opts.flap ?? { amp: 0.75, hz: 2.4 } }, true, geo);
    m.u.uDis.value.x = 0;
    const inst = new Float32Array(n * 4);
    const ia = new THREE.InstancedBufferAttribute(inst, 4).setUsage(THREE.DynamicDrawUsage);
    const g = geo.clone();
    g.setAttribute('aInst', ia);
    const a = new THREE.InstancedMesh(g, m.depth, n), b = new THREE.InstancedMesh(g, m.color, n);
    b.instanceMatrix = a.instanceMatrix;
    a.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    a.renderOrder = 24; b.renderOrder = 25; a.frustumCulled = b.frustumCulled = false;
    const obj = new THREE.Group(); obj.add(a, b);
    this.game.scene.add(obj);
    const r = rng(opts.seed ?? (Math.random() * 1e9) | 0);
    const members = [];
    for (let i = 0; i < n; i++) {
      members.push({ a0: (i / n) * Math.PI * 2 + r() * 0.3, rad: (opts.radius ?? 3) * (0.7 + r() * 0.5), y: (opts.height ?? 2.5) * (0.75 + r() * 0.5), w: (opts.speed ?? 1.4) * (0.85 + r() * 0.3),
        ph: r() * 6.28, dis: 1, pos: new THREE.Vector3(), prev: new THREE.Vector3(), dive: null, trail: null, appearAt: r() * 0.25 });
      inst[i * 4] = members[i].ph; inst[i * 4 + 1] = 1; inst[i * 4 + 2] = 0.85 + r() * 0.3;
    }
    const h = {
      obj, mesh: a, mats: [m], members, inst, ia, n, t: 0, alive: true, size: opts.size ?? 0.6, appear: opts.appear ?? 0.4, life: opts.life ?? Infinity,
      center: opts.center?.isVector3 ? opts.center.clone() : new THREE.Vector3(), centerFn: typeof opts.center === 'function' ? opts.center : null,
      queue: [], trails: opts.trails ?? true, trailColor: opts.trailColor ?? hdrArr(opts.rim ?? [1, 2, 3.5]), exitT: -1, exitPoint: null, exitKind: opts.exit?.kind ?? 'feather', exitColor: opts.exit?.color,
      dive: (i, target, dur = 0.6) => { const mm = members[i % n]; mm.dive = { t: 0, dur, from: mm.pos.clone(), to: target.clone() }; },
      diveAll: (targets, every = 0.12) => { targets.forEach((tg, k) => h.queue.push({ at: h.t + k * every, i: k, to: tg.clone() })); },
      exit: (point) => { h.exitT = 0; h.exitPoint = point ? point.clone() : null; },
      stop: () => h.exit(),
    };
    this.swarms.push(h);
    this._updateSwarm(h, 0);
    return h;
  }

  _updateSwarm(h, dt) {
    h.t += dt;
    if (h.centerFn) h.center.copy(h.centerFn());
    for (let k = h.queue.length - 1; k >= 0; k--) if (h.t >= h.queue[k].at) { const q = h.queue[k]; h.dive(q.i, q.to); h.queue.splice(k, 1); }
    if (h.exitT < 0 && Number.isFinite(h.life) && h.t >= h.life) h.exit();
    const exiting = h.exitT >= 0;
    if (exiting) h.exitT += dt;
    let alive = 0;
    for (let i = 0; i < h.n; i++) {
      const mm = h.members[i];
      mm.prev.copy(mm.pos);
      const a = mm.a0 + h.t * mm.w;
      const orbit = _v.set(h.center.x + Math.cos(a) * mm.rad, h.center.y + mm.y + Math.sin(h.t * 1.7 + mm.ph) * 0.25, h.center.z + Math.sin(a) * mm.rad);
      let p = orbit;
      if (mm.dive) {
        // swoop: quadratic arc down to the target and back up to the orbit
        mm.dive.t += dt;
        const k = Math.min(1, mm.dive.t / mm.dive.dur);
        const s = k < 0.5 ? k * 2 : (1 - k) * 2;
        const e = s * s * (3 - 2 * s);
        _w.lerpVectors(orbit, mm.dive.to, e);
        p = _w;
        if (h.trails && !mm.trail) mm.trail = this.fx.trail({ width: 0.12 * h.size / 0.6, life: 0.35, color: [...h.trailColor, 0.9], color1: [...h.trailColor.map((c) => c * 0.4), 0] });
        if (k >= 1) { mm.dive = null; mm.trail?.stop(); mm.trail = null; }
      }
      if (exiting && h.exitPoint) {
        // fly home one after another (back into the weapon / feathers), then dissolve
        const k = Math.min(1, Math.max(0, (h.exitT - i * 0.06) / 0.5));
        p = _w.lerpVectors(p, h.exitPoint, k * k);
      }
      mm.pos.copy(p);
      mm.trail?.push(mm.pos);
      // dissolve: staggered appear; exit dissolves (after reaching home)
      let dis = Math.max(0, 1 - (h.t - mm.appearAt) / h.appear);
      if (exiting) {
        const k = h.exitPoint ? (h.exitT - i * 0.06 - 0.35) / 0.25 : (h.exitT - i * 0.04) / 0.45;
        dis = Math.max(dis, Math.min(1, Math.max(0, k)));
        if (k > 0 && !mm.burst) { mm.burst = true; this.fx.motes.burst(h.exitKind, mm.pos, h.exitPoint ? 1 : 3, { speed: 1, color: h.exitColor }); }
      }
      mm.dis = dis;
      if (dis < 1) alive++;
      h.inst[i * 4 + 1] = dis;
      // orientation: along the velocity, banked into the turn
      _w.subVectors(mm.pos, mm.prev);
      if (_w.lengthSq() < 1e-8) _w.set(-Math.sin(a), 0, Math.cos(a));
      _o.position.copy(mm.pos);
      _o.lookAt(_v.copy(mm.pos).sub(_w));                       // shape's beak is -z: look along the motion
      _o.rotateZ(mm.dive ? 0 : -0.5);
      _o.scale.setScalar(h.size);
      _o.updateMatrix();
      h.mesh.setMatrixAt(i, _o.matrix);
    }
    h.mesh.instanceMatrix.needsUpdate = true;
    h.ia.needsUpdate = true;
    if (exiting && (alive === 0 || h.exitT > 3)) { this._removeSwarm(h); return false; }
    return true;
  }

  _removeSwarm(h) {
    if (!h.alive) return;
    h.alive = false;
    for (const mm of h.members) mm.trail?.stop();
    h.obj.removeFromParent();
    for (const m of h.mats) { m.depth.dispose(); m.color.dispose(); }
    const i = this.swarms.indexOf(h); if (i >= 0) this.swarms.splice(i, 1);
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    // key light follows the scene sun (view space) so the glaze highlight agrees with the world
    const sv = this.fx.particles.shared.sunView?.value;
    if (sv) this.key.value.copy(sv).add(_v.set(0, 0.3, 0.2)).normalize();
    for (let i = this.ghosts.length - 1; i >= 0; i--) this._updateGhost(this.ghosts[i], dt);
    for (let i = this.shadows.length - 1; i >= 0; i--) this._updateShadow(this.shadows[i], dt);
    for (let i = this.swarms.length - 1; i >= 0; i--) this._updateSwarm(this.swarms[i], dt);
  }

  clear() {
    for (const h of [...this.ghosts]) this._removeGhost(h);
    for (const h of [...this.shadows]) this._removeShadow(h);
    for (const h of [...this.swarms]) this._removeSwarm(h);
  }
}

function hdrArr(c) { const v = hdr(c); return [v.x, v.y, v.z]; }
