// Pure-JS image helpers: decode PNG (pngjs) / JPEG (jpeg-js), area-resample, encode JPEG / PNG, normal maps
// from height, and a disk cache of downscaled sources (the 4096^2 skins are decoded once, never kept around).
// Image = { width, height, data: Uint8Array RGBA }.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { SRC } from './fetch.mjs';

export function createImage(width, height, fill = [0, 0, 0, 255]) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3]; }
  return { width, height, data };
}

export function decodeImage(file) {
  const buf = fs.readFileSync(file);
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const j = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
    return { width: j.width, height: j.height, data: j.data };
  }
  throw new Error('unknown image format ' + file);
}

export function encodePNG(img) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
  return PNG.sync.write(png, { colorType: 6 });
}

export function encodeJPEG(img, quality = 85) {
  return Buffer.from(jpeg.encode({ width: img.width, height: img.height, data: img.data }, quality).data);
}

/** Area-average resample (good for large downscales) with bilinear fallback for upscales. */
export function resize(img, w, h) {
  if (img.width === w && img.height === h) return img;
  const out = new Uint8Array(w * h * 4);
  const sx = img.width / w, sy = img.height / h;
  if (sx >= 1 && sy >= 1 && Number.isInteger(sx) && Number.isInteger(sy)) {
    const n = sx * sy;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < sy; j++) {
        let p = ((y * sy + j) * img.width + x * sx) * 4;
        for (let i = 0; i < sx; i++, p += 4) { r += img.data[p]; g += img.data[p + 1]; b += img.data[p + 2]; a += img.data[p + 3]; }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n + 0.5; out[o + 1] = g / n + 0.5; out[o + 2] = b / n + 0.5; out[o + 3] = a / n + 0.5;
    }
    return { width: w, height: h, data: out };
  }
  for (let y = 0; y < h; y++) {
    const fy = Math.min(img.height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(img.height - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(img.width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(img.width - 1, x0 + 1), tx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const a = img.data[(y0 * img.width + x0) * 4 + c], b = img.data[(y0 * img.width + x1) * 4 + c];
        const d = img.data[(y1 * img.width + x0) * 4 + c], e = img.data[(y1 * img.width + x1) * 4 + c];
        out[(y * w + x) * 4 + c] = (a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty + 0.5;
      }
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Loads an image file downscaled to `size` (square, power of two), caching the result as PNG in src/cache so
 * the big originals are decoded only once per machine.
 */
export function loadImageSized(file, size) {
  const st = fs.statSync(file);
  const key = crypto.createHash('md5').update(`${file}|${st.size}|${size}`).digest('hex').slice(0, 12);
  const cacheFile = path.join(SRC, 'cache', `${path.basename(file).replace(/\.\w+$/, '')}_${size}_${key}.png`);
  if (fs.existsSync(cacheFile)) return decodeImage(cacheFile);
  let img = decodeImage(file);
  if (img.width !== size || img.height !== size) img = resize(img, size, size);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, encodePNG(img));
  return img;
}

export function cloneImage(img) { return { width: img.width, height: img.height, data: new Uint8Array(img.data) }; }

/** Bilinear sample (u,v in glTF convention: v=0 top), returns [r,g,b,a] 0..255 floats. */
export function sample(img, u, v, out = [0, 0, 0, 0]) {
  const fx = u * img.width - 0.5, fy = v * img.height - 0.5;
  const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(img.height - 1, Math.floor(fy)));
  const x1 = Math.min(img.width - 1, x0 + 1), y1 = Math.min(img.height - 1, y0 + 1);
  const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
  for (let c = 0; c < 4; c++) {
    const a = img.data[(y0 * img.width + x0) * 4 + c], b = img.data[(y0 * img.width + x1) * 4 + c];
    const d = img.data[(y1 * img.width + x0) * 4 + c], e = img.data[(y1 * img.width + x1) * 4 + c];
    out[c] = (a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty;
  }
  return out;
}

/**
 * Tangent-space normal map (OpenGL / glTF convention: +X right, +Y towards the top of the image) from a height
 * field Float32Array(w*h) in texels units; `strength` scales slopes.
 */
export function normalFromHeight(height, w, h, strength = 1) {
  const out = createImage(w, h, [128, 128, 255, 255]);
  const H = (x, y) => height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Sobel
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) / 8;
    const dyDown = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) / 8;
    const nx = -dx * strength, ny = dyDown * strength; // up = -down
    const l = Math.hypot(nx, ny, 1);
    const o = (y * w + x) * 4;
    out.data[o] = (nx / l * 0.5 + 0.5) * 255 + 0.5;
    out.data[o + 1] = (ny / l * 0.5 + 0.5) * 255 + 0.5;
    out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255 + 0.5;
  }
  return out;
}

/** Luminance (0..1) of an image as Float32Array. */
export function luminance(img) {
  const n = img.width * img.height, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (img.data[i * 4] * 0.2126 + img.data[i * 4 + 1] * 0.7152 + img.data[i * 4 + 2] * 0.0722) / 255;
  return out;
}

/** Separable box blur of a Float32 field (radius in texels), repeated `passes` times (~gaussian). */
export function blurField(f, w, h, radius, passes = 2) {
  let a = f, b = new Float32Array(f.length);
  const r = Math.max(1, Math.round(radius));
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let acc = 0; const row = y * w;
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc / (2 * r + 1);
        acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a = a === f ? new Float32Array(f.length) : a;
        a[y * w + x] = acc / (2 * r + 1);
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

/** Writes a quick-look PNG (debugging). */
export function savePNG(img, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePNG(img));
}
