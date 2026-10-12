// Tileable texture synthesis helpers (Node, Float32 planes of N*N, row 0 = top of the image).
// Everything wraps at the borders so generated PBR sets tile seamlessly.

export function hash(x, y, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mod = (a, n) => ((a % n) + n) % n;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

/** Tileable gradient (Perlin) noise with `period` lattice cells across the tile (stretch: [sx, sy]). Range ~[-1, 1]. */
export function perlin(N, period, seed, stretch = [1, 1]) {
  const px = Math.max(1, Math.round(period * stretch[0])), py = Math.max(1, Math.round(period * stretch[1]));
  const gx = new Float32Array(px * py), gy = new Float32Array(px * py);
  for (let j = 0; j < py; j++) for (let i = 0; i < px; i++) {
    const a = hash(i, j, seed) * Math.PI * 2;
    gx[j * px + i] = Math.cos(a); gy[j * px + i] = Math.sin(a);
  }
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const fy = (y / N) * py, iy = Math.floor(fy), ty = fy - iy;
    const sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
    const j0 = iy % py, j1 = (iy + 1) % py;
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * px, ix = Math.floor(fx), tx = fx - ix;
      const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
      const i0 = ix % px, i1 = (ix + 1) % px;
      const a = gx[j0 * px + i0] * tx + gy[j0 * px + i0] * ty;
      const b = gx[j0 * px + i1] * (tx - 1) + gy[j0 * px + i1] * ty;
      const c = gx[j1 * px + i0] * tx + gy[j1 * px + i0] * (ty - 1);
      const d = gx[j1 * px + i1] * (tx - 1) + gy[j1 * px + i1] * (ty - 1);
      const ab = a + (b - a) * sx, cd = c + (d - c) * sx;
      out[y * N + x] = (ab + (cd - ab) * sy) * 1.41;
    }
  }
  return out;
}

/** Fractal sum of perlin octaves, remapped to [0, 1] by its actual range. */
export function fbm(N, period, octaves, seed, { gain = 0.5, stretch = [1, 1], ridged = false } = {}) {
  const out = new Float32Array(N * N);
  let amp = 1;
  for (let o = 0; o < octaves; o++) {
    const n = perlin(N, period << o, seed + o * 101, stretch);
    if (ridged) for (let i = 0; i < out.length; i++) out[i] += (1 - Math.abs(n[i])) * amp;
    else for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    amp *= gain;
  }
  return normalize(out);
}

export function normalize(a, lo = 0.002, hi = 0.998) {
  // robust range via sampled percentiles
  const s = [];
  const step = Math.max(1, Math.floor(a.length / 20000));
  for (let i = 0; i < a.length; i += step) s.push(a[i]);
  s.sort((x, y) => x - y);
  const mn = s[Math.floor(s.length * lo)], mx = s[Math.floor(s.length * hi)];
  const k = 1 / Math.max(1e-6, mx - mn);
  for (let i = 0; i < a.length; i++) a[i] = clamp01((a[i] - mn) * k);
  return a;
}

/**
 * Tileable Worley (cellular) noise with `cells` x `cells` feature points (cellsY optional for stretched cells).
 * Returns { f1, f2 (distances in cell units), id (0..1 per nearest cell), ix, iy (cell of nearest) }.
 */
export function worley(N, cells, seed, { jitter = 0.9, cellsY = cells } = {}) {
  const f1 = new Float32Array(N * N), f2 = new Float32Array(N * N), id = new Float32Array(N * N);
  const nx = new Int32Array(N * N), ny = new Int32Array(N * N);
  const fpX = new Float32Array(cells * cellsY), fpY = new Float32Array(cells * cellsY);
  for (let j = 0; j < cellsY; j++) for (let i = 0; i < cells; i++) {
    fpX[j * cells + i] = 0.5 + (hash(i, j, seed) - 0.5) * jitter;
    fpY[j * cells + i] = 0.5 + (hash(i, j, seed + 7) - 0.5) * jitter;
  }
  for (let y = 0; y < N; y++) {
    const fy = (y / N) * cellsY, cy = Math.floor(fy);
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * cells, cx = Math.floor(fx);
      let d1 = 1e9, d2 = 1e9, best = 0, bi = 0, bj = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = mod(cx + di, cells), j = mod(cy + dj, cellsY);
        const k = j * cells + i;
        const ddx = cx + di + fpX[k] - fx, ddy = cy + dj + fpY[k] - fy;
        const d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d < d1) { d2 = d1; d1 = d; best = k; bi = i; bj = j; } else if (d < d2) d2 = d;
      }
      const o = y * N + x;
      f1[o] = d1; f2[o] = d2; id[o] = hash(bi, bj, seed + 13); nx[o] = bi; ny[o] = bj;
    }
  }
  return { f1, f2, id, ix: nx, iy: ny };
}

/** Bilinear wrapped sample of plane a at (x, y) in pixels. */
export function sample(a, N, x, y) {
  x = mod(x, N); y = mod(y, N);
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  const x1 = (x0 + 1) % N, y1 = (y0 + 1) % N;
  const a0 = a[y0 * N + x0], a1 = a[y0 * N + x1], b0 = a[y1 * N + x0], b1 = a[y1 * N + x1];
  return (a0 + (a1 - a0) * tx) + ((b0 + (b1 - b0) * tx) - (a0 + (a1 - a0) * tx)) * ty;
}

/** Domain warp: out(x,y) = a(x + dx*amt, y + dy*amt) (dx, dy in [0,1] planes centred at 0.5; amt in pixels). */
export function warp(a, N, dx, dy, amt) {
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    out[i] = sample(a, N, x + (dx[i] - 0.5) * amt, y + (dy[i] - 0.5) * amt);
  }
  return out;
}

/** Separable wrapped box blur (run twice for a tent, three times ~ gaussian). */
export function blur(a, N, r, passes = 2) {
  r = Math.max(1, Math.round(r));
  let src = a;
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(N * N), out = new Float32Array(N * N);
    const w = 1 / (2 * r + 1);
    for (let y = 0; y < N; y++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[y * N + mod(k, N)];
      for (let x = 0; x < N; x++) {
        tmp[y * N + x] = s * w;
        s += src[y * N + mod(x + r + 1, N)] - src[y * N + mod(x - r, N)];
      }
    }
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[mod(k, N) * N + x];
      for (let y = 0; y < N; y++) {
        out[y * N + x] = s * w;
        s += tmp[mod(y + r + 1, N) * N + x] - tmp[mod(y - r, N) * N + x];
      }
    }
    src = out;
  }
  return src;
}

/** Cavity AO from a height field (metres): darkens texels below their blurred neighbourhood. */
export function cavityAO(h, N, radiusPx, depthScale, floor = 0.35) {
  const b = blur(h, N, radiusPx, 2);
  const out = new Float32Array(N * N);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(floor, Math.min(1, 1 - Math.max(0, b[i] - h[i]) * depthScale));
  return out;
}

/** Height (metres) -> OpenGL tangent-space normal map RGB bytes (green = +v = up in the image). */
export function heightToNormal(h, N, texelM, strength = 1) {
  const out = new Uint8Array(N * N * 3);
  const k = strength / (2 * texelM);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const l = h[y * N + mod(x - 1, N)], r = h[y * N + mod(x + 1, N)];
    const up = h[mod(y - 1, N) * N + x], dn = h[mod(y + 1, N) * N + x];
    let nx = -(r - l) * k, ny = -(up - dn) * k, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    nx /= len; ny /= len; nz /= len;
    const o = (y * N + x) * 3;
    out[o] = Math.round((nx * 0.5 + 0.5) * 255);
    out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
  }
  return out;
}

/** '#rrggbb' -> [r, g, b] in 0..1 (sRGB, authoring space). */
export function hex(c) {
  const v = parseInt(c.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
export function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

/** RGB albedo plane helper. */
export class RGB {
  constructor(N, base = [0.5, 0.5, 0.5]) {
    this.N = N; this.d = new Float32Array(N * N * 3);
    for (let i = 0; i < N * N; i++) { this.d[i * 3] = base[0]; this.d[i * 3 + 1] = base[1]; this.d[i * 3 + 2] = base[2]; }
  }
  get(i) { return [this.d[i * 3], this.d[i * 3 + 1], this.d[i * 3 + 2]]; }
  set(i, c) { this.d[i * 3] = c[0]; this.d[i * 3 + 1] = c[1]; this.d[i * 3 + 2] = c[2]; }
  /** blend colour c into pixel i with weight t */
  blend(i, c, t) {
    if (t <= 0) return;
    const d = this.d, o = i * 3;
    d[o] += (c[0] - d[o]) * t; d[o + 1] += (c[1] - d[o + 1]) * t; d[o + 2] += (c[2] - d[o + 2]) * t;
  }
  mul(i, k) { const o = i * 3; this.d[o] *= k; this.d[o + 1] *= k; this.d[o + 2] *= k; }
  mulc(i, c) { const o = i * 3; this.d[o] *= c[0]; this.d[o + 1] *= c[1]; this.d[o + 2] *= c[2]; }
  bytes(alpha) {
    const N = this.N, ch = alpha ? 4 : 3;
    const out = new Uint8Array(N * N * ch);
    for (let i = 0; i < N * N; i++) {
      out[i * ch] = Math.round(clamp01(this.d[i * 3]) * 255);
      out[i * ch + 1] = Math.round(clamp01(this.d[i * 3 + 1]) * 255);
      out[i * ch + 2] = Math.round(clamp01(this.d[i * 3 + 2]) * 255);
      if (alpha) out[i * ch + 3] = Math.round(clamp01(alpha[i]) * 255);
    }
    return out;
  }
}

export function plane(N, v = 0) { const a = new Float32Array(N * N); if (v) a.fill(v); return a; }
