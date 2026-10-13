// Image I/O for the map tools (Node, pure JS): decode JPEG/PNG, box-filter downsizing (normal maps are
// renormalised), JPEG/PNG writers and the per-quality size variants the runtime picks from.
//
// Size variants: every map image in game/assets/maps/common/ also ships at smaller power-of-two edges
// ("x_diff.jpg" -> "x_diff@1k.jpg", "x_diff@512.jpg"), listed per manifest entry as
//   { sizes: { diff: 2048, nor: 2048, arm: 1024 }, variants: { diff: [1024, 512], nor: [1024, 512], arm: [512] } }
// compile.mjs copies them into map.json materials and game/src/world/mapPackage.js fetches the smallest file
// that still covers the quality's texture limit, so phones never download / decode the 2k originals.
import fs from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { encodeJPEG } from './jpeg.mjs';

/** Decodes a JPEG/PNG buffer into { width, height, data: RGBA Uint8Array }. */
export function decodeImage(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) { const p = PNG.sync.read(buf); return { width: p.width, height: p.height, data: p.data }; }
  const d = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024, maxResolutionInMP: 100 });
  return { width: d.width, height: d.height, data: d.data };
}

/** Halves an RGBA image until it is <= maxSize (2x2 box filter; normal maps are renormalised). */
export function downsize(img, maxSize, isNormal = false) {
  let { width: w, height: h, data } = img;
  while (Math.max(w, h) > maxSize) {
    const W = Math.max(1, w >> 1), H = Math.max(1, h >> 1);
    const out = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const k = (Math.min(h - 1, y * 2 + dy) * w + Math.min(w - 1, x * 2 + dx)) * 4;
        a0 += data[k]; a1 += data[k + 1]; a2 += data[k + 2]; a3 += data[k + 3];
      }
      const o = (y * W + x) * 4;
      if (isNormal) {
        let nx = a0 / 510 - 1, ny = a1 / 510 - 1, nz = a2 / 510 - 1;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        out[o] = Math.round((nx * 0.5 + 0.5) * 255); out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255); out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        out[o + 3] = 255;
      } else { out[o] = Math.round(a0 / 4); out[o + 1] = Math.round(a1 / 4); out[o + 2] = Math.round(a2 / 4); out[o + 3] = Math.round(a3 / 4); }
    }
    w = W; h = H; data = out;
  }
  return { width: w, height: h, data };
}

export const writeJPEG = (file, img, quality, subsample) => fs.writeFileSync(file, encodeJPEG({ width: img.width, height: img.height, data: img.data, channels: 4 }, { quality, subsample }));
export const writePNG = (file, img) => { const p = new PNG({ width: img.width, height: img.height, colorType: 6 }); p.data = Buffer.from(img.data); fs.writeFileSync(file, PNG.sync.write(p, { deflateLevel: 9 })); };

// ------------------------------------------------------------------------------------------- size variants
export const VARIANT_SIZES = [1024, 512];
/** "a/x_diff.jpg", 1024 -> "a/x_diff@1k.jpg"; 512 -> "a/x_diff@512.jpg" (same rule as mapPackage.js). */
export const variantName = (file, size) => file.replace(/(\.\w+)$/, `@${size >= 1024 ? size / 1024 + 'k' : size}$1`);

/** Writes the smaller variants of one image file; returns { size: full edge, variants: [edges...] }. */
export function writeVariants(file, kind) {
  let img = decodeImage(fs.readFileSync(file));
  const full = Math.max(img.width, img.height);
  const variants = [];
  for (const v of VARIANT_SIZES) {
    if (v >= full) continue;
    img = downsize(img, v, kind === 'nor');
    const out = variantName(file, v);
    if (/\.png$/i.test(file)) writePNG(out, img);
    else writeJPEG(out, img, kind === 'diff' ? 84 : kind === 'nor' ? 88 : 85, kind === 'diff');
    variants.push(v);
  }
  return { size: full, variants };
}

/** Adds { sizes, variants } for every map of a manifest entry ({ maps: { kind: relative file } }) in place. */
export function addVariants(entry, dir) {
  entry.sizes = {}; entry.variants = {};
  for (const [k, file] of Object.entries(entry.maps || {})) {
    const r = writeVariants(path.join(dir, file), k);
    entry.sizes[k] = r.size; entry.variants[k] = r.variants;
  }
  return entry;
}

/** True when every variant file listed by the entry exists on disk. */
export function variantsOk(entry, dir) {
  if (!entry?.variants) return false;
  for (const [k, file] of Object.entries(entry.maps || {})) {
    const list = entry.variants[k];
    if (!list) return false;
    for (const v of list) if (!fs.existsSync(path.join(dir, variantName(file, v)))) return false;
  }
  return true;
}
