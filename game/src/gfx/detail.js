// Procedural tileable detail textures generated at startup (no files):
//   normal detail maps (cast, brushed, stipple, knurl, carbon, fabric) packed as RGBA8 tangent-space
//   normals, and a grunge texture (R: smudges, G: scratches, B: rust/dirt blotches, A: chips noise).
import * as THREE from 'three';

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value noise on an N-periodic lattice. */
function valueNoise(N, period, seed) {
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * period, fy = (y / N) * period;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = hash2(ix % period, iy % period, seed), b = hash2((ix + 1) % period, iy % period, seed);
    const c = hash2(ix % period, (iy + 1) % period, seed), d = hash2((ix + 1) % period, (iy + 1) % period, seed);
    out[y * N + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  return out;
}

function fbm(N, base, octaves, seed, gain = 0.5) {
  const out = new Float32Array(N * N);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(N, base << o, seed + o * 17);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Height field -> tangent space normal map (RGBA8) with wrap-around derivatives. */
function heightToNormal(h, N, strength) {
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const l = h[y * N + ((x - 1 + N) % N)], r = h[y * N + ((x + 1) % N)];
    const d = h[((y - 1 + N) % N) * N + x], u = h[((y + 1) % N) * N + x];
    let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    nx /= len; ny /= len; nz /= len;
    const i = (y * N + x) * 4;
    data[i] = (nx * 0.5 + 0.5) * 255; data[i + 1] = (ny * 0.5 + 0.5) * 255; data[i + 2] = (nz * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  return data;
}

function tex(data, N, srgb = false) {
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const N = 256;

const builders = {
  // fine pitting of cast / parkerized steel
  cast() {
    const h = fbm(N, 32, 3, 11, 0.55);
    for (let i = 0; i < h.length; i++) h[i] = Math.pow(h[i], 1.6);
    return heightToNormal(h, N, 3.0);
  },
  // anisotropic brushing streaks along u
  brushed() {
    const h = new Float32Array(N * N);
    const rows = fbm(N, 64, 3, 23, 0.6);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = rows[y * N + ((x * 7) % N)] * 0.3 + rows[((y * 3) % N) * N] * 0.7;
    return heightToNormal(h, N, 2.0);
  },
  // polymer stipple: dense small bumps
  stipple() {
    const h = new Float32Array(N * N);
    const cell = 6;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      let best = 9;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const gx = (cx + ox + N / cell) % (N / cell), gy = (cy + oy + N / cell) % (N / cell);
        const px = (cx + ox + hash2(gx, gy, 5)) * cell, py = (cy + oy + hash2(gx, gy, 9)) * cell;
        best = Math.min(best, Math.hypot(x - px, y - py) / cell);
      }
      h[y * N + x] = Math.max(0, 1 - best * 1.6);
    }
    return heightToNormal(h, N, 4.0);
  },
  // diamond knurling
  knurl() {
    const h = new Float32Array(N * N);
    const f = (Math.PI * 2 * 16) / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      h[y * N + x] = Math.min(Math.abs(Math.sin((x + y) * f * 0.5)), Math.abs(Math.sin((x - y) * f * 0.5)));
    }
    return heightToNormal(h, N, 5.0);
  },
  // 2x2 twill carbon weave
  carbon() {
    const h = new Float32Array(N * N);
    const tw = 16;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const bx = Math.floor(x / tw), by = Math.floor(y / tw);
      const horiz = ((bx + by) & 3) < 2;
      const u = (horiz ? x : y) % tw / tw, v = (horiz ? y : x) % tw / tw;
      h[y * N + x] = Math.sin(u * Math.PI) * 0.6 + Math.sin(v * Math.PI * 4) * 0.08;
    }
    return heightToNormal(h, N, 3.0);
  },
  // nylon webbing / fabric weave
  fabric() {
    const h = new Float32Array(N * N);
    const p = 8;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const a = Math.sin((x / p) * Math.PI), b = Math.sin((y / p) * Math.PI);
      const over = ((Math.floor(x / p) + Math.floor(y / p)) & 1) ? a : b;
      h[y * N + x] = Math.abs(over);
    }
    return heightToNormal(h, N, 3.0);
  },
  // flat (no detail)
  flat() {
    const d = new Uint8Array(N * N * 4);
    for (let i = 0; i < d.length; i += 4) { d[i] = 128; d[i + 1] = 128; d[i + 2] = 255; d[i + 3] = 255; }
    return d;
  },
};

function grungeData() {
  const smudge = fbm(N, 4, 5, 101, 0.55);
  const blotch = fbm(N, 8, 4, 202, 0.6);
  const chips = fbm(N, 16, 4, 303, 0.5);
  const scratch = new Float32Array(N * N);
  // random thin scratches (wrapped line segments)
  let s = 12345;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 160; k++) {
    let x = r() * N, y = r() * N;
    const a = r() * Math.PI * 2, len = 10 + r() * 60, w = 0.4 + r() * 0.6;
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let t = 0; t < len; t += 0.5) {
      const px = ((Math.round(x + dx * t) % N) + N) % N, py = ((Math.round(y + dy * t) % N) + N) % N;
      scratch[py * N + px] = Math.max(scratch[py * N + px], w * (1 - t / len * 0.5));
    }
  }
  const d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    d[i * 4] = smudge[i] * 255;
    d[i * 4 + 1] = Math.min(1, scratch[i]) * 255;
    d[i * 4 + 2] = blotch[i] * 255;
    d[i * 4 + 3] = chips[i] * 255;
  }
  return d;
}

/** Wood grain albedo modulation: R grain lines, G pores, B large figure. */
function woodData() {
  const d = new Uint8Array(N * N * 4);
  const warp = fbm(N, 2, 4, 404, 0.55);
  const warp2 = fbm(N, 8, 3, 707, 0.5);
  const pores = fbm(N, 64, 2, 505, 0.5);
  const figure = fbm(N, 2, 4, 606, 0.55);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    // grain runs along x; growth rings (late wood = thin dark lines) vary along y, strongly warped
    const ph = (y / N) * 11 + warp[i] * 5.5 + warp2[i] * 0.8;
    const f = ph - Math.floor(ph);
    const late = Math.pow(Math.max(0, 1 - Math.abs(f - 0.82) / 0.18), 1.5);
    const early = 0.25 * Math.sin(f * Math.PI);
    d[i * 4] = Math.min(1, late * 0.9 + (1 - early) * 0.15) * 255;
    d[i * 4 + 1] = pores[(y * N + ((x * 3) % N))] * 255;
    d[i * 4 + 2] = figure[i] * 255;
    d[i * 4 + 3] = 255;
  }
  return d;
}

let cache = null;
export function detailTextures() {
  if (cache) return cache;
  cache = { normal: {} };
  for (const [k, fn] of Object.entries(builders)) cache.normal[k] = tex(fn(), N);
  cache.grunge = tex(grungeData(), N);
  cache.wood = tex(woodData(), N);
  return cache;
}

/**
 * detailTextures() built ahead, one texture per task (pause: () => Promise, e.g. engine/util.js yieldTask): ~0.3 s of
 * CPU noise that the first weapon material compile otherwise paid in one block, inside a match load.
 */
export async function prepareDetailTextures(pause) {
  const c = { normal: {} };
  for (const [k, fn] of Object.entries(builders)) {
    if (cache) return cache;
    c.normal[k] = tex(fn(), N);
    await pause();
  }
  if (!cache) { c.grunge = tex(grungeData(), N); await pause(); }
  if (!cache) { c.wood = tex(woodData(), N); cache = c; }
  return cache;
}
