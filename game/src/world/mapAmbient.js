// Map ambient FX from map.json `fx` (layout ENV.fx): rising smoke plumes (a burning tower in the skyline, a burning
// car), licking fire at their base, and ash / paper scraps drifting with the wind around the camera.
//   fx: { wind: [x, z] (m/s),
//         smoke: [{ pos: [x, y, z], height, r0, r1, count, life (s), drift: [dx, dz] (m of drift at the top),
//                   color: '#hex' (base) , color1: '#hex' (top), opacity, fog (0..1 share of scene fog), fire: 0..n }],
//         ash: { count, radius, color, size } }
// One draw call per layer (smoke = alpha blended, fire = additive, ash = alpha tested); every particle is a camera-
// facing quad expanded in the vertex shader from an instanced centre, so there is no per-frame matrix work on the CPU
// beyond writing the instance attributes. Smoke and ash use a procedural puff / flake texture (no image files).
import * as THREE from 'three';

const QUAL = { low: 0.5, medium: 0.75, high: 1, ultra: 1 };

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec4 iData;   // size, rotation, alpha, shade
varying vec2 vUv;
varying float vA, vShade, vFog;
uniform float fogDensity, fogShare;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iData.y), s = sin(iData.y);
  mv.xy += mat2(c, s, -s, c) * position.xy * iData.x;
  gl_Position = projectionMatrix * mv;
  vUv = uv; vA = iData.z; vShade = iData.w;
  float d = length(mv.xyz);
  vFog = (1.0 - exp(-fogDensity * fogDensity * d * d)) * fogShare;
}`;
const FRAG_SMOKE = /* glsl */`
uniform sampler2D map;
uniform vec3 color0, color1, fogColor;
varying vec2 vUv;
varying float vA, vShade, vFog;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vA;
  if (a < 0.004) discard;
  vec3 c = mix(color0, color1, vShade) * (0.55 + 0.45 * t.r);
  gl_FragColor = vec4(mix(c, fogColor, vFog), a);
}`;
const FRAG_FIRE = /* glsl */`
uniform sampler2D map;
uniform vec3 color0, color1, fogColor;
varying vec2 vUv;
varying float vA, vShade, vFog;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * t.a * vA * (1.0 - vFog);
  gl_FragColor = vec4(mix(color1, color0, vShade) * a, 1.0);
}`;
const FRAG_ASH = /* glsl */`
uniform sampler2D map;
uniform vec3 color0, color1, fogColor;
varying vec2 vUv;
varying float vA, vShade, vFog;
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.5) discard;
  gl_FragColor = vec4(mix(mix(color0, color1, vShade) * (0.7 + 0.3 * t.r), fogColor, vFog), vA);
}`;

/** Value-noise fBm on a torus (tiles), 0..1. */
function makeNoise(seed) {
  const N = 64, g = new Float32Array(N * N);
  let s = seed >>> 0;
  for (let i = 0; i < g.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; g[i] = s / 4294967296; }
  const at = (x, y) => g[((y % N + N) % N) * N + ((x % N + N) % N)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
  return (x, y) => { let v = 0, amp = 0.5, f = 1, tot = 0; for (let o = 0; o < 5; o++) { v += vn(x * f, y * f) * amp; tot += amp; amp *= 0.5; f *= 2; } return v / tot; };
}

/** 4 puff variants in a 2x2 atlas (R = self-shadow shade, A = density). */
function puffTexture() {
  const S = 256, C = S / 2, data = new Uint8Array(S * S * 4);
  for (let v = 0; v < 4; v++) {
    const n = makeNoise(17 + v * 101), ox = (v % 2) * C, oy = (v >> 1) * C;
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const u = (x + 0.5) / C * 2 - 1, w = (y + 0.5) / C * 2 - 1;
      const r = Math.hypot(u, w);
      const nz = n(x / 9 + v * 7, y / 9);
      const edge = 1 - smoothstep(0.35, 1.0, r + (nz - 0.5) * 0.55);
      const dens = Math.max(0, Math.min(1, edge * (0.45 + 0.75 * nz)));
      const shade = Math.max(0, Math.min(1, 0.55 + 0.6 * (w * 0.5 - u * 0.2) * -1 + (nz - 0.5) * 0.5)); // lit from above
      const i = ((oy + y) * S + ox + x) * 4;
      data[i] = shade * 255; data[i + 1] = shade * 255; data[i + 2] = shade * 255; data[i + 3] = dens * 255;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
/** Ash flake / paper scrap: irregular polygon blobs (alpha-tested), 2x2 variants. */
function flakeTexture() {
  const S = 64, C = S / 2, data = new Uint8Array(S * S * 4);
  for (let v = 0; v < 4; v++) {
    const n = makeNoise(311 + v * 37), ox = (v % 2) * C, oy = (v >> 1) * C;
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const u = (x + 0.5) / C * 2 - 1, w = (y + 0.5) / C * 2 - 1;
      const sq = v < 2 ? Math.max(Math.abs(u) * 1.1, Math.abs(w) * (v ? 1.6 : 1.2)) : Math.hypot(u, w);
      const a = sq + (n(x / 3, y / 3) - 0.5) * 0.5 < 0.8 ? 1 : 0;
      const i = ((oy + y) * S + ox + x) * 4;
      const sh = 0.6 + 0.4 * n(x / 2 + 9, y / 2);
      data[i] = data[i + 1] = data[i + 2] = sh * 255; data[i + 3] = a * 255;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
function smoothstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
const lin = (hex) => { const c = new THREE.Color(hex); return new THREE.Vector3(c.r, c.g, c.b); };

/** A camera-facing instanced quad layer (n particles). uv selects one of the 2x2 atlas cells per instance. */
function makeLayer(n, frag, tex, { blending = THREE.NormalBlending, transparent = true, color0, color1, fogShare = 1, order = 2 }) {
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  // per-instance uv cell: store the cell in the integer part of a uv attribute via a second instanced attribute
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iData = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iCell = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
  for (let i = 0; i < n; i++) { iCell.array[i * 2] = (i % 2) * 0.5; iCell.array[i * 2 + 1] = ((i >> 1) % 2) * 0.5; }
  quad.setAttribute('iPos', iPos); quad.setAttribute('iData', iData); quad.setAttribute('iCell', iCell);
  quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5], 2));
  quad.instanceCount = n;
  const vert = VERT.replace('attribute vec4 iData;', 'attribute vec4 iData;\nattribute vec2 iCell;').replace('vUv = uv;', 'vUv = uv + iCell;');
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent, blending, depthWrite: false, depthTest: true,
    uniforms: {
      map: { value: tex }, color0: { value: color0 }, color1: { value: color1 }, fogColor: { value: new THREE.Vector3(0.1, 0.12, 0.1) },
      fogDensity: { value: 0 }, fogShare: { value: fogShare },
    },
  });
  if (!transparent) { mat.depthWrite = true; mat.transparent = false; }
  const mesh = new THREE.Mesh(quad, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  mesh.matrixAutoUpdate = false;
  return { mesh, mat, iPos, iData, n };
}

/**
 * Builds the ambient layers of a map. Returns { root, update(dt, t, camera, scene) } or null when the map has no fx.
 */
export function createMapAmbient(fx, { quality = 'high' } = {}) {
  if (!fx) return null;
  const k = QUAL[quality] ?? 1;
  const root = new THREE.Group();
  root.name = 'map-ambient';
  const wind = new THREE.Vector2(...(fx.wind || [0.8, -0.45]));
  const layers = [];
  const puff = (fx.smoke?.length || fx.fire) ? puffTexture() : null;
  let rnd = 12345;
  const R = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };

  // ---- smoke plumes (+ fire at their base)
  for (const p of fx.smoke || []) {
    const n = Math.max(6, Math.round((p.count || 30) * k));
    const L = makeLayer(n, FRAG_SMOKE, puff, { color0: lin(p.color || '#2a2522'), color1: lin(p.color1 || '#5d5a55'), fogShare: p.fog ?? 1, order: 3 });
    const parts = Array.from({ length: n }, (_, i) => ({ ph: i / n + R() * 0.5 / n, rot: R() * 6.28, spin: (R() - 0.5) * 0.12, jx: R() - 0.5, jz: R() - 0.5, sz: 0.8 + R() * 0.45 }));
    layers.push({ kind: 'smoke', p, L, parts, base: new THREE.Vector3(...p.pos) });
    root.add(L.mesh);
    if (p.fire) {
      const nf = Math.max(4, Math.round(p.fire * k));
      const F = makeLayer(nf, FRAG_FIRE, puff, { blending: THREE.AdditiveBlending, color0: lin(p.fireColor || '#ff7a22').multiplyScalar(p.fireIntensity ?? 6), color1: lin('#ffd27a').multiplyScalar(p.fireIntensity ?? 6), fogShare: p.fog ?? 1, order: 4 });
      const fparts = Array.from({ length: nf }, (_, i) => ({ ph: i / nf, rot: R() * 6.28, jx: R() - 0.5, jz: R() - 0.5, sz: 0.7 + R() * 0.6 }));
      layers.push({ kind: 'fire', p, L: F, parts: fparts, base: new THREE.Vector3(...p.pos) });
      root.add(F.mesh);
    }
  }

  // ---- ash / paper drifting around the camera
  if (fx.ash) {
    const a = fx.ash, n = Math.max(8, Math.round((a.count || 90) * k));
    const L = makeLayer(n, FRAG_ASH, flakeTexture(), { transparent: false, color0: lin(a.color || '#4a4844'), color1: lin(a.color1 || '#a9a59a'), fogShare: 1, order: 1 });
    const rad = a.radius || 14;
    const parts = Array.from({ length: n }, () => ({ x: (R() - 0.5) * 2 * rad, y: R() * 7, z: (R() - 0.5) * 2 * rad, ph: R() * 6.28, rot: R() * 6.28, spin: (R() - 0.5) * 4, sz: (a.size || 0.05) * (0.6 + R() * 0.9), paper: R() < (a.paper ?? 0.12) }));
    layers.push({ kind: 'ash', p: a, L, parts, rad });
    root.add(L.mesh);
  }

  const camPos = new THREE.Vector3();
  const update = (dt, t, camera, scene) => {
    if (!camera) return;
    camera.getWorldPosition(camPos);
    const fog = scene?.fog;
    for (const ly of layers) {
      const u = ly.L.mat.uniforms;
      if (fog) { u.fogDensity.value = fog.density ?? 0; u.fogColor.value.set(fog.color.r, fog.color.g, fog.color.b); }
      const P = ly.L.iPos.array, D = ly.L.iData.array;
      if (ly.kind === 'smoke') {
        const p = ly.p, H = p.height || 60, r0 = p.r0 || 2, r1 = p.r1 || 20, life = p.life || 40, dr = p.drift || [0, 0], op = p.opacity ?? 0.85;
        ly.parts.forEach((q, i) => {
          const s = (q.ph + t / life) % 1;
          const r = r0 + (r1 - r0) * Math.pow(s, 0.8);
          const along = s * s * 0.75 + s * 0.25;
          P[i * 3] = ly.base.x + dr[0] * along + q.jx * r * 0.6;
          P[i * 3 + 1] = ly.base.y + H * Math.pow(s, 0.92) + q.jz * r * 0.25;
          P[i * 3 + 2] = ly.base.z + dr[1] * along + q.jz * r * 0.6;
          D[i * 4] = r * 2.2 * q.sz;
          D[i * 4 + 1] = q.rot + q.spin * t;
          D[i * 4 + 2] = op * smoothstep(0, 0.06, s) * (1 - smoothstep(0.6, 1, s));
          D[i * 4 + 3] = Math.min(1, s * 1.6);
        });
      } else if (ly.kind === 'fire') {
        const p = ly.p, fh = p.fireHeight || Math.max(1.2, (p.r0 || 1) * 1.6), fw = p.fireWidth || (p.r0 || 1) * 1.4;
        ly.parts.forEach((q, i) => {
          const s = (q.ph + t * 1.6) % 1;
          P[i * 3] = ly.base.x + q.jx * fw + wind.x * 0.15 * s;
          P[i * 3 + 1] = ly.base.y - 0.3 + fh * s;
          P[i * 3 + 2] = ly.base.z + q.jz * fw + wind.y * 0.15 * s;
          D[i * 4] = fw * 1.2 * q.sz * (1 - s * 0.55);
          D[i * 4 + 1] = q.rot + s * 1.5;
          D[i * 4 + 2] = smoothstep(0, 0.15, s) * (1 - smoothstep(0.45, 1, s)) * (0.75 + 0.25 * Math.sin(t * 23 + i * 1.7));
          D[i * 4 + 3] = s;
        });
      } else if (ly.kind === 'ash') {
        const rad = ly.rad, fall = ly.p.fall ?? 0.35;
        ly.parts.forEach((q, i) => {
          q.x += (wind.x + Math.sin(t * 0.7 + q.ph) * 0.6) * dt; q.z += (wind.y + Math.cos(t * 0.5 + q.ph) * 0.6) * dt;
          q.y -= (q.paper ? fall * 0.6 : fall) * dt * (0.6 + 0.4 * Math.sin(t * 1.3 + q.ph));
          // wrap inside a box around the camera (ground .. +7 m)
          let x = q.x - camPos.x, z = q.z - camPos.z;
          if (x > rad) q.x -= 2 * rad; else if (x < -rad) q.x += 2 * rad;
          if (z > rad) q.z -= 2 * rad; else if (z < -rad) q.z += 2 * rad;
          if (q.y < camPos.y - 2) q.y += 9; else if (q.y > camPos.y + 7) q.y -= 9;
          P[i * 3] = q.x; P[i * 3 + 1] = q.y; P[i * 3 + 2] = q.z;
          D[i * 4] = q.sz * (q.paper ? 2.6 : 1);
          D[i * 4 + 1] = q.rot + q.spin * t;
          D[i * 4 + 2] = 1;
          D[i * 4 + 3] = q.paper ? 1 : 0.15 + 0.2 * Math.sin(q.ph);
        });
      }
      ly.L.iPos.needsUpdate = true; ly.L.iData.needsUpdate = true;
    }
  };
  return { root, update, layers };
}
