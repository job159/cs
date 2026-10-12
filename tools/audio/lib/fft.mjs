// Iterative radix-2 complex FFT (Float64Array re/im, in place) + helpers for real signals.
import { nextPow2 } from './buffer.mjs';

const twiddleCache = new Map();
function twiddles(n) {
  let t = twiddleCache.get(n);
  if (!t) {
    const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
    t = { cos, sin };
    if (twiddleCache.size > 16) twiddleCache.clear();
    twiddleCache.set(n, t);
  }
  return t;
}

/** In-place complex FFT. n must be a power of two. inverse=true computes the unscaled inverse (divide by n yourself). */
export function fft(re, im, inverse = false) {
  const n = re.length;
  if (n & (n - 1)) throw new Error('fft size must be a power of 2');
  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  const { cos, sin } = twiddles(n);
  const sgn = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = cos[k], wi = sgn * sin[k];
        const a = i + j, b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

/**
 * Linear convolution of two real arrays via FFT overlap-add. Memory-friendly for long signals.
 * Returns Float32Array of length x.length + h.length - 1.
 */
export function convolveArrays(x, h) {
  const outLen = x.length + h.length - 1;
  const out = new Float64Array(outLen);
  if (!x.length || !h.length) return new Float32Array(Math.max(outLen, 0));
  // pick FFT size ~ 2x IR (at least 4096) and block size so that block + IR - 1 fits
  const n = Math.max(4096, nextPow2(h.length * 2));
  const block = n - h.length + 1;
  const hr = new Float64Array(n), hi = new Float64Array(n);
  hr.set(h);
  fft(hr, hi);
  const br = new Float64Array(n), bi = new Float64Array(n);
  for (let start = 0; start < x.length; start += block) {
    br.fill(0); bi.fill(0);
    const end = Math.min(start + block, x.length);
    for (let i = start; i < end; i++) br[i - start] = x[i];
    fft(br, bi);
    for (let k = 0; k < n; k++) {
      const r = br[k] * hr[k] - bi[k] * hi[k];
      const im = br[k] * hi[k] + bi[k] * hr[k];
      br[k] = r; bi[k] = im;
    }
    fft(br, bi, true);
    const lim = Math.min(n, outLen - start);
    for (let i = 0; i < lim; i++) out[start + i] += br[i] / n;
  }
  return Float32Array.from(out);
}

/** Hann window of length n (periodic=false -> symmetric). */
export function hann(n, periodic = true) {
  const w = new Float64Array(n);
  const d = periodic ? n : n - 1;
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / d);
  return w;
}

/** Magnitude spectrum (power, linear) of a real frame (length = power of 2). Returns n/2+1 bins. */
export function powerSpectrum(frame) {
  const n = frame.length;
  const re = Float64Array.from(frame), im = new Float64Array(n);
  fft(re, im);
  const p = new Float64Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
  return p;
}
