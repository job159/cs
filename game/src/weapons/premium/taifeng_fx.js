// 颱風眼．斬浪 — procedural FX pieces (docs/PREMIUM_WEAPONS.md E07, 05d §8.2): the swept water / wind ARC bands
// (破浪, the eye-wall cast), the flying crescent wind blades (三階蓄力), the eye WALL (three counter-turning cylinders: a
// dark cloud skin, a cyan rain band, a white inner squall line; a ground swirl), the caster's RAIN screen (L4 雨絲:
// slanted streaks + lens drops, the centre kept clear), the water-wind ghost blade thrown by 斬浪擲 (fx.summons.ghost
// geometry with per-vertex tints) and the KE_GALE kill cut. Everything is built once per game and reused; colours are
// HDR linear.
import * as THREE from 'three';
import { materialUniforms } from '../../gfx/materials.js';

const NOISE = /* glsl */`
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }`;
const V3 = (a) => new THREE.Vector3(...a);

// ------------------------------------------------------------------------------------------ ARC: swept water band (world)
// A band round a vertical axis (inner radius r0 at height h0, outer r1 at h1). uv.x = angle fraction, uv.y = 0 inner ..
// 1 outer. uHead (0..1) is the blade's leading angle: lit behind it over uSpan -- a white foam lip on the outer edge,
// streamlines racing along it, spray specks, cyan body cooling to deep teal in the wake; every edge feathered.
const ARC_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ARC_FRAG = /* glsl */`
uniform float uHead, uSpan, uAmt, uTime, uLen;
uniform vec3 uCore, uBody, uEdge;
varying vec2 vUv;
${NOISE}
void main() {
  float behind = uHead - vUv.x;
  if (behind < 0.0 || behind > uSpan) discard;
  float w = behind / uSpan;
  float y = vUv.y;
  float caps = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float band = smoothstep(0.0, 0.4, y) * smoothstep(1.0, 0.9, y);
  float lip = exp(-pow((y - 0.86) * 11.0, 2.0)) * (0.7 + 0.3 * vn(vec2(vUv.x * uLen * 3.0, uTime * 6.0)));
  float lines = pow(abs(sin((y * 9.0 + vn(vec2(vUv.x * uLen * 1.2 - uTime * 3.0, y * 4.0)) * 1.4) * 3.14159)), 18.0);
  float spray = step(0.86, h21(floor(vec2(vUv.x * uLen * 14.0, y * 10.0) + floor(uTime * 20.0)))) * band;
  float lead = exp(-w * 22.0) * smoothstep(0.0, 0.004, behind);
  float body = band * (1.0 - w) * (1.0 - w);
  vec3 c = mix(uBody, uEdge, w) * body * (0.22 + 0.8 * lines) + uCore * lip * (1.0 - w * 0.7) * 1.4 * band + uCore * lead * band * 1.3 + vec3(1.0) * spray * (1.0 - w) * 1.2;
  gl_FragColor = vec4(c * uAmt * caps * smoothstep(1.0, 0.65, w), 1.0);
}`;
export function gustBand({ r0 = 1.4, r1 = 4, h0 = -0.7, h1 = 0.1, arc = Math.PI, seg = 72 } = {}) {
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
    uniforms: { uHead: { value: 0 }, uSpan: { value: 0.3 }, uAmt: { value: 1 }, uTime: materialUniforms.time, uLen: { value: arc * r1 },
      uCore: { value: V3([3.4, 4.2, 4.8]) }, uBody: { value: V3([0.35, 1.5, 2.4]) }, uEdge: { value: V3([0.1, 0.6, 1.1]) } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return mesh;
}

// ------------------------------------------------------------------------------------------ crescent wind blade (world)
// A crescent in the local XY plane bowing forward (-Z), chord 1 (scaled), feathered horns: a white-hot leading edge, a
// cyan body full of streamlines racing out to the horns, a mist skirt behind it. uAmt fades, uHit flashes on contact.
const BLADE_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BLADE_FRAG = /* glsl */`
uniform float uAmt, uTime, uHit, uSeed;
uniform vec3 uCore, uBody, uEdge;
varying vec2 vUv;
${NOISE}
void main() {
  float x = vUv.x, y = vUv.y;                                  // x 0..1 horn to horn, y 0 tail .. 1 leading edge
  float horn = smoothstep(0.0, 0.22, x) * smoothstep(1.0, 0.78, x);
  float thick = 0.35 + 0.65 * sin(3.14159 * x);
  float yy = y / max(0.05, thick);
  float body = smoothstep(0.0, 0.55, y) * smoothstep(1.0, 0.82, y);
  float edge = exp(-pow((y - 0.9) * 14.0, 2.0));
  float flow = abs(x - 0.5) * 6.0 - uTime * 5.0 + uSeed;
  float lines = pow(abs(sin((y * 7.0 + vn(vec2(flow, y * 3.0)) * 1.6) * 3.14159)), 14.0);
  float mist = fbm(vec2(x * 6.0 + uSeed, y * 2.0 - uTime * 1.5)) * smoothstep(0.0, 0.5, y) * (1.0 - smoothstep(0.5, 0.95, y));
  vec3 c = uBody * body * (0.25 + 0.9 * lines) + uCore * edge * (1.4 + 2.0 * uHit) + uEdge * mist * 0.5;
  gl_FragColor = vec4(c * horn * uAmt * (1.0 + uHit * 0.6), 1.0);
}`;
export function windBladeMesh(seg = 40) {
  const pos = [], uv = [], idx = [];
  // a crescent standing across the flight (local XY, chord along X, horns curling down) whose middle bows forward
  // (-Z): seen from behind it is an arc of light flying away, not a sheet seen edge-on
  const R = 0.58, span = 62 * Math.PI / 180;
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, ph = (u - 0.5) * 2 * span, bow = Math.cos(ph) - Math.cos(span);
    const th = 0.03 + 0.16 * Math.pow(Math.cos((u - 0.5) * Math.PI), 1.4);   // band depth: thick in the middle, thin horns
    const x = Math.sin(ph) * R, y = (Math.cos(ph) - 1) * R * 0.55, z = -bow * 0.55;
    pos.push(x, y - th, z + 0.04, x, y, z); uv.push(u, 0, u, 1);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    vertexShader: BLADE_VERT, fragmentShader: BLADE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uAmt: { value: 1 }, uTime: materialUniforms.time, uHit: { value: 0 }, uSeed: { value: Math.random() * 10 },
      uCore: { value: V3([3.6, 4.6, 5.4]) }, uBody: { value: V3([0.45, 1.7, 2.8]) }, uEdge: { value: V3([0.5, 0.75, 0.95]) } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return mesh;
}

// ------------------------------------------------------------------------------------------ WALL: the typhoon eye wall
// Three open cylinders round the eye (unit radius, height 1: scaled to r x h): 0 = the outer cloud skin (alpha: grey-
// blue cloud rolling upwards in spiral bands, thicker low down), 1 = the rain band (additive cyan-white slanted
// streaks racing round), 2 = the inner squall line (thin white sheets). The near side thins to its silhouette (rim
// alpha), so a player standing close still sees through it. uAmt grows / fades it, uShrink (collapse) is applied by
// scaling the group, uFlash lights the cloud from inside (the bolts).
const WALL_VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vN, vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const WALL_FRAG = /* glsl */`
uniform float uAmt, uTime, uLayer, uSpin, uFlash, uSeed, uRise;
uniform vec3 uCol, uCol2;
varying vec2 vUv;
varying vec3 vN, vV;
${NOISE}
void main() {
  float a = vUv.x, y = vUv.y;
  if (uLayer < 2.5 && y > uRise) discard;                         // it grows up out of the ground
  float ndv = abs(dot(vN, vV));
  float rim = pow(1.0 - ndv, 1.2);
  float vfade = uLayer > 2.5 ? smoothstep(0.0, 0.3, y) * smoothstep(1.0, 0.55, y) : smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(0.75, 1.0, y / max(0.01, uRise)));
  // spiral bands climbing round (the anvil ring: y is the radius, the bands wind outwards)
  vec2 sp = vec2(a * 7.0 - uTime * uSpin + y * 2.2, y * 2.6 - uTime * 0.7);
  vec4 o;
  if (uLayer < 0.5 || uLayer > 2.5) {
    // cloud: two octaves of rolls, a dark rain-laden base, lighter towering tops; the bolts light it from inside
    float cl = fbm(sp * vec2(1.0, 1.5) + uSeed), cl2 = fbm(sp * vec2(2.6, 3.4) + uSeed * 1.7);
    float dens = smoothstep(0.18, 0.6, cl * 0.75 + cl2 * 0.4);
    float lift = uLayer > 2.5 ? 0.75 : smoothstep(0.05, 0.95, y);
    vec3 col = mix(uCol2, uCol, lift * 0.55 + cl2 * 0.45) * (1.0 + uFlash * 3.0 * cl);
    // face-on it thins to a veil (the pulled-in horde stays readable through it), dense at the silhouette
    o = vec4(col, clamp(dens * (uLayer > 2.5 ? 0.8 : 0.22 + 0.78 * pow(rim, 0.8)) * vfade * uAmt, 0.0, 0.9));
  } else if (uLayer < 1.5) {
    // rain band: thin streaks slanting round the wall (they race with it), patchy
    float u = a * 70.0 + y * 9.0 - uTime * uSpin * 6.0;
    float st = fract(u + h21(vec2(floor(u), 3.0)) * 7.0 + y * 3.0 - uTime * 2.5);
    float streak = smoothstep(0.0, 0.05, st) * (1.0 - smoothstep(0.05, 0.3, st)) * step(0.45, h21(vec2(floor(u), 7.0)));
    float band = smoothstep(0.4, 0.8, fbm(sp * vec2(1.6, 0.8) + uSeed + 3.0));
    vec3 col = uCol * (streak * 0.55 * band + band * 0.12) * (0.25 + 0.9 * rim) * (1.0 + uFlash * 2.0);
    o = vec4(col * vfade * uAmt, 1.0);                             // (additive: the colour carries it)
  } else {
    // squall line: thin white sheets only at the silhouette
    float sh = smoothstep(0.55, 0.9, fbm(sp * vec2(2.4, 0.6) + uSeed + 9.0));
    vec3 col = uCol * sh * rim * rim * 1.2 * (1.0 + uFlash);
    o = vec4(col * vfade * uAmt, 1.0);
  }
  gl_FragColor = o;
}`;
function wallLayer(layer, col, col2) {
  let g;
  if (layer === 3) {
    // the anvil: a flat ring of cloud over the top (inner radius 0.92 = the open eye, out to 1.75), uv x = angle, y = radius
    const seg = 64, pos = [], uv = [], idx = [], rings = 4;
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= seg; i++) {
      const u = i / seg, v = j / rings, r = 0.92 + 0.83 * v, an = u * Math.PI * 2;
      pos.push(Math.cos(an) * r, 1.0 + 0.06 * v, Math.sin(an) * r); uv.push(u, v);
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
  } else {
    g = new THREE.CylinderGeometry(1, 1, 1, 64, 12, true);
    g.translate(0, 0.5, 0);
  }
  const add = layer === 1 || layer === 2;
  const m = new THREE.ShaderMaterial({
    vertexShader: WALL_VERT, fragmentShader: WALL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uAmt: { value: 0 }, uTime: materialUniforms.time, uLayer: { value: layer }, uSpin: { value: 0.5 }, uFlash: { value: 0 }, uSeed: { value: Math.random() * 9 }, uRise: { value: 1 },
      uCol: { value: V3(col) }, uCol2: { value: V3(col2 || col) } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6 + layer;
  return mesh;
}
/** the eye wall group: set({ amt, rise, flash }) per frame; scale it to (r, h, r) */
export function eyeWall() {
  const grp = new THREE.Group();
  const outer = wallLayer(0, [0.66, 0.7, 0.76], [0.16, 0.18, 0.22]), rain = wallLayer(1, [0.7, 1.9, 2.5]), squall = wallLayer(2, [1.4, 1.9, 2.2]);
  const anvil = wallLayer(3, [0.7, 0.74, 0.8], [0.26, 0.29, 0.34]);
  rain.scale.set(0.95, 1, 0.95); squall.scale.set(0.86, 0.96, 0.86);
  outer.material.uniforms.uSpin.value = 0.5; rain.material.uniforms.uSpin.value = 0.8; squall.material.uniforms.uSpin.value = 0.65; anvil.material.uniforms.uSpin.value = 0.3;
  grp.add(outer, rain, squall, anvil);
  const layers = [outer, rain, squall, anvil];
  grp.userData.set = ({ amt = 1, rise = 1, flash = 0 } = {}) => {
    for (const l of layers) { const u = l.material.uniforms; u.uAmt.value = l === anvil ? amt * Math.max(0, (rise - 0.7) / 0.3) : amt; u.uRise.value = rise; u.uFlash.value = flash; }
    // the layers turn as solid bodies too (anticlockwise seen from above, the inflow round a low)
    outer.rotation.y += 0.02; rain.rotation.y += 0.035; squall.rotation.y += 0.05; anvil.rotation.y += 0.008;
  };
  grp.userData.dispose = () => { for (const l of layers) { l.geometry.dispose(); l.material.dispose(); } };
  return grp;
}

// ------------------------------------------------------------------------------------------ RAIN: the caster's screen (L4)
// Slanted rain streaks across the frame (three depths), a few drops beading on the lens; the centre 20 % stays clear,
// α ≤ 0.35 (§1.14). Drawn in clip space over everything (like the overlay kit's front layer).
const RAIN_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, -1.0, 1.0); }`;
const RAIN_FRAG = /* glsl */`
uniform float uAmt, uTime, uAspect;
uniform vec3 uCol;
varying vec2 vUv;
${NOISE}
float streaks(vec2 p, float dens, float speed, float len, float seed) {
  p.x += p.y * 0.28;                                             // wind-slanted
  float col = floor(p.x * dens);
  float h = h21(vec2(col, seed));
  float y = fract(p.y * 0.6 + uTime * speed * (0.8 + 0.4 * h) + h * 7.0);
  float on = step(0.55, h21(vec2(col, seed + 1.0)));
  float x = abs(fract(p.x * dens) - 0.5);
  return on * smoothstep(0.08, 0.0, x) * smoothstep(0.0, len * 0.2, y) * (1.0 - smoothstep(len * 0.2, len, y));
}
void main() {
  vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
  float rc = length(p);
  float mask = smoothstep(0.12, 0.42, rc);                        // the crosshair area stays clear
  float s = streaks(p * 1.0, 70.0, 2.6, 0.35, 1.0) * 0.6 + streaks(p * 1.6, 120.0, 3.4, 0.25, 4.0) * 0.4 + streaks(p * 0.6, 40.0, 1.9, 0.45, 9.0) * 0.8;
  // lens drops: a few small beads, darker inside with a faint lit rim on the lower side (refraction, not bubbles)
  vec2 dp = p * 9.0; vec2 di = floor(dp); vec2 df = fract(dp) - 0.5 + (vec2(h21(di), h21(di + 1.7)) - 0.5) * 0.5;
  float dr = 0.08 + 0.1 * h21(di + 9.1);
  float drop = step(0.96, h21(di + 3.3)) * smoothstep(dr, dr * 0.75, length(df));
  float men = drop * smoothstep(0.0, dr, df.y + dr * 0.4) * 0.6;
  vec3 c = uCol * (s * 0.38 + men * 0.25) * mask;
  float a = clamp((s * 0.12 + drop * 0.07) * mask, 0.0, 0.3);
  gl_FragColor = vec4(c * uAmt, a * uAmt);
}`;
export function rainScreen() {
  const m = new THREE.ShaderMaterial({
    vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uAmt: { value: 0 }, uTime: materialUniforms.time, uAspect: { value: 16 / 9 }, uCol: { value: V3([0.75, 0.95, 1.1]) } },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  mesh.frustumCulled = false; mesh.renderOrder = 995; mesh.visible = false;
  return mesh;
}

// ------------------------------------------------------------------------------------------ KE_GALE kill cut (world)
// A camera-facing cut streak (unit quad along X): a white core line torn by spray, cyan halo, the ends whipped thin.
const CUT_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CUT_FRAG = /* glsl */`
uniform float uT, uFade, uSeed;
varying vec2 vUv;
${NOISE}
void main() {
  float x = vUv.x, y = abs(vUv.y - 0.5) * 2.0;
  if (x > uT) discard;
  float taper = sin(3.14159 * x);
  float core = exp(-y * y / max(0.002, 0.012 * taper)) ;
  float halo = exp(-y * y / max(0.01, 0.16 * taper));
  float torn = 0.6 + 0.4 * vn(vec2(x * 30.0 + uSeed, 1.0));
  vec3 c = vec3(4.2, 5.2, 5.8) * core * torn + vec3(0.3, 1.4, 2.4) * halo * 0.6;
  gl_FragColor = vec4(c * uFade, 1.0);
}`;
export function gustCut() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.translate(0.5, 0, 0);
  const m = new THREE.ShaderMaterial({ vertexShader: CUT_VERT, fragmentShader: CUT_FRAG, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uFade: { value: 1 }, uSeed: { value: Math.random() * 10 } } });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = 10;
  return mesh;
}

// ------------------------------------------------------------------------------------------ the thrown water-wind blade
// fx.summons.ghost geometry (unit: the blade 1 long up +Y from the guard at 0, tip at 1): a broad single-edged blade
// with a sheepsfoot point, the wind slot as a bright stripe, the anemometer crown and guard as a stubby hilt. aTint
// rgb = glaze tint, a = weight (0 = the spirit's own glaze colours).
export function ghostBladeGeometry() {
  const P = [], N = [], T = [], I = [];
  const push = (geo, col) => {
    if (geo.index) geo = geo.toNonIndexed();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const o = P.length / 3, p = geo.attributes.position, n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); T.push(...col); I.push(o + i); }
  };
  const NONE = [0, 0, 0, 0], SLOT = [1.6, 3.2, 3.8, 1], EDGE = [2.4, 3.0, 3.4, 0.8], HILT = [0.3, 0.5, 0.7, 0.6];
  const L = 1.05, S = 1 / 1050;                                  // mm -> unit
  const sb = (t) => (t <= 900 ? -53 + 16 * t / 900 : t <= 970 ? -37 : -37 + 21 * Math.pow((t - 970) / 80, 1.1));
  const se = (t) => (t <= 900 ? 57 - 22 * t / 900 : 35 - 51 * Math.pow((t - 900) / 150, 1.7));
  // blade: lofted diamond-ish section (spine, flat, edge)
  {
    const ts = [0, 60, 150, 300, 450, 600, 750, 900, 940, 970, 1000, 1025, 1040, 1050];
    const pos = [], idx = [], R = 8;
    for (const t of ts) {
      const b = sb(Math.min(t, 1049)), e = se(Math.min(t, 1049)), th = t > 900 ? 4.5 * (1 - 0.7 * (t - 900) / 150) : 4.5;
      const ring = [[e, 0], [e - 12, th * 0.5], [b + 10, th], [b, th * 0.7], [b, -th * 0.7], [b + 10, -th], [e - 12, -th * 0.5], [e, 0]].slice(0, R);
      for (const [s, w] of ring) pos.push(w * S * 1.4, t * S, -s * S);
    }
    for (let i = 0; i + 1 < ts.length; i++) for (let j = 0; j < R; j++) { const a = i * R + j, b = i * R + (j + 1) % R, c = a + R, d = b + R; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const ng = g.toNonIndexed(); ng.computeVertexNormals();
    push(ng, NONE);
  }
  // the wind slot: a glowing stripe proud of both flats (t 130 -> 810)
  for (const sd of [1, -1]) {
    const pos = [], idx = [], ts = [];
    for (let t = 130; t <= 810; t += 40) ts.push(t);
    ts.forEach((t) => { const c = se(t) - 46.4; pos.push(sd * 5.1 * S * 1.4, t * S, -(c - 9) * S, sd * 5.1 * S * 1.4, t * S, -(c + 9) * S); });
    for (let i = 0; i + 1 < ts.length; i++) { const a = i * 2; sd > 0 ? idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) : idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(ts.flatMap(() => [sd, 0, 0, sd, 0, 0]), 3));
    g.setIndex(idx);
    push(g, SLOT);
  }
  // edge highlight: a thin bright strip along the cutting edge
  {
    const pos = [], idx = [], ts = [];
    for (let t = 0; t <= 1000; t += 50) ts.push(t);
    ts.forEach((t) => { const e = se(t); pos.push(0, t * S, -(e + 1.5) * S, 0, t * S, -(e - 9) * S); });
    for (let i = 0; i + 1 < ts.length; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    push(g, EDGE);
  }
  // stub hilt: the anemometer ring and the guard bar (so the spirit reads as the sword)
  {
    const ring = new THREE.TorusGeometry(27 * S, 5 * S, 5, 18); ring.rotateX(Math.PI / 2); ring.translate(0, -40 * S, 0); ring.deleteAttribute('uv');
    push(ring, HILT);
    const bar = new THREE.BoxGeometry(14 * S, 22 * S, 220 * S); bar.translate(0, -80 * S, 0); bar.deleteAttribute('uv');
    push(bar, HILT);
    const grip = new THREE.CylinderGeometry(15 * S, 15 * S, 260 * S, 8); grip.translate(0, -220 * S, 0); grip.deleteAttribute('uv');
    push(grip, HILT);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('aTint', new THREE.Float32BufferAttribute(T, 4));
  geo.setIndex(I);
  geo.computeBoundingBox();
  void L;
  return geo;
}

// ------------------------------------------------------------------------------------------ rainbow (10 % after the eye)
const BOW_FRAG = /* glsl */`
uniform float uAmt;
varying vec2 vUv;
void main() {
  float x = vUv.y;                                               // 0 inner .. 1 outer
  float h = 0.78 * (1.0 - x);
  vec3 spec = clamp(vec3(abs(h * 6.0 - 3.0) - 1.0, 2.0 - abs(h * 6.0 - 2.0), 2.0 - abs(h * 6.0 - 4.0)), 0.0, 1.0);
  float a = smoothstep(0.0, 0.2, x) * smoothstep(1.0, 0.8, x) * smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
  gl_FragColor = vec4(spec * a * uAmt * 0.6, 1.0);
}`;
export function rainbowArc(r = 9, w = 1.1) {
  const seg = 48, pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) { const u = i / seg, a = Math.PI * u; pos.push(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a) * (r + w), Math.sin(a) * (r + w), 0); uv.push(u, 0, u, 1); }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({ vertexShader: ARC_VERT, fragmentShader: BOW_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uAmt: { value: 0 } } });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = 5;
  return mesh;
}
