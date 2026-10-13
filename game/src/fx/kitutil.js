// Shared helpers of the premium FX kit (kit.js): seeded PRNG, easing, HDR colours, one tiling noise texture
// and the GLSL that samples it. Separate module so the component files can import it without a cycle.
import * as THREE from 'three';

/** Small seeded PRNG (mulberry32): same seed -> same effect on every client. */
export function rng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const easeOutBack = (x, s = 1.70158) => { const u = x - 1; return 1 + (s + 1) * u * u * u + s * u * u; };
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** HDR colour helper: '#rrggbb' | [r,g,b] | THREE.Color | Vector3, times k -> THREE.Vector3 (linear). */
export function hdr(c, k = 1, out = new THREE.Vector3()) {
  if (c == null) return out.set(k, k, k);
  if (typeof c === 'string' || typeof c === 'number') { const col = new THREE.Color(c); return out.set(col.r * k, col.g * k, col.b * k); }
  if (Array.isArray(c)) return out.set(c[0] * k, c[1] * k, c[2] * k);
  if (c.isColor) return out.set(c.r * k, c.g * k, c.b * k);
  return out.set(c.x * k, c.y * k, c.z * k);
}

// One tiling value-noise texture shared by every kit shader (RGBA = 4 independent octaves, periodic so it
// wraps without seams). A texture fetch is far cheaper than ALU fbm on phones.
let noiseData = null;
function buildNoise(N = 256) {
  const out = new Uint8Array(N * N * 4);
  const r = rng(1234567);
  const lattice = (cells) => { const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = r(); return g; };
  const octs = [8, 16, 32, 64].map((c) => ({ c, g: lattice(c) }));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    for (let k = 0; k < 4; k++) {
      const { c, g } = octs[k];
      const fx = (x / N) * c, fy = (y / N) * c;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (i, j) => g[((j % c + c) % c) * c + ((i % c + c) % c)];
      const v = (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
      out[(y * N + x) * 4 + k] = Math.round(v * 255);
    }
  }
  return { data: out, N };
}
export function noiseTexture() {
  if (!noiseData) noiseData = buildNoise();
  const t = new THREE.DataTexture(noiseData.data, noiseData.N, noiseData.N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// GLSL helpers shared by the kit shaders (noise texture sampled as fbm, hashes)
export const GLSL_NOISE = /* glsl */`
uniform sampler2D tNoise;
float n1(vec2 p) { return texture2D(tNoise, p).r; }
float fbm2(vec2 p) { vec4 a = texture2D(tNoise, p); vec4 b = texture2D(tNoise, p * 2.03 + 0.37); return a.r * 0.5 + a.g * 0.3 + b.b * 0.2; }
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;
