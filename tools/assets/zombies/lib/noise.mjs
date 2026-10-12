// Deterministic 3D noise for procedural masks (evaluated on rest-pose surface positions in metres, so masks
// are continuous across UV seams and identical for body and clothes that overlap in space).
export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function makeNoise(seed = 1) {
  const r = rng(seed * 7919 + 13);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const G = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1], [1, 1, 0], [0, -1, 1], [-1, 1, 0], [0, -1, -1]];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y, z) => { const g = G[h & 15]; return g[0] * x + g[1] * y + g[2] * z; };
  /** Improved Perlin noise, roughly -1..1. */
  function noise(x, y, z) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z;
    const xi = X & 255, yi = Y & 255, zi = Z & 255;
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[xi] + yi, AA = perm[A] + zi, AB = perm[A + 1] + zi;
    const B = perm[xi + 1] + yi, BA = perm[B] + zi, BB = perm[B + 1] + zi;
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u), l(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
      l(l(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u), l(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
      w,
    );
  }
  /** fBm, roughly -1..1. */
  function fbm(x, y, z, oct = 4, lac = 2.03, gain = 0.5) {
    let a = 0, amp = 1, norm = 0;
    for (let i = 0; i < oct; i++) { a += amp * noise(x, y, z); norm += amp; amp *= gain; x *= lac; y *= lac; z *= lac; x += 17.3; }
    return a / norm * 1.6;
  }
  /** Ridged noise (1 at the ridge lines), 0..1: thin vein / crack networks. */
  function ridged(x, y, z, oct = 3) {
    let a = 0, amp = 1, norm = 0;
    for (let i = 0; i < oct; i++) { a += amp * (1 - Math.abs(noise(x, y, z))) ** 6; norm += amp; amp *= 0.55; x *= 2.1; y *= 2.1; z *= 2.1; z += 5.1; }
    return a / norm;
  }
  /** Worley F1 distance (cell size 1). */
  function worley(x, y, z) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    let best = 9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const h = perm[(perm[(perm[(X + i) & 255] + Y + j) & 255] + Z + k) & 255];
      const fx = X + i + (h / 255), fy = Y + j + (perm[(h + 31) & 255] / 255), fz = Z + k + (perm[(h + 97) & 255] / 255);
      const d = (fx - x) ** 2 + (fy - y) ** 2 + (fz - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }
  return { noise, fbm, ridged, worley };
}

export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const mix = (a, b, t) => a + (b - a) * t;
