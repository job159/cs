// Sky model for the lightmap baker: Radiance .hdr parsing, sun removal (clamping), a small
// equirect radiance map for ray lookups and an irradiance table E(n) for cheap fallbacks.
//
// Direction <-> equirect mapping matches three.js `equirectUv` (EquirectangularReflectionMapping):
//   u = atan2(d.z, d.x) / 2pi + 0.5, v = asin(d.y) / pi + 0.5, with v = 1 at the top row of the image.
import fs from 'node:fs';

/** Parses a Radiance RGBE (.hdr) file. Returns { width, height, data: Float32Array rgb }, row 0 = top. */
export function parseHDR(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let pos = 0;
  const line = () => {
    let s = '';
    while (pos < bytes.length && bytes[pos] !== 0x0a) s += String.fromCharCode(bytes[pos++]);
    pos++;
    return s;
  };
  const magic = line();
  if (!magic.startsWith('#?')) throw new Error('not a Radiance HDR file');
  let exposure = 1;
  for (;;) {
    const l = line();
    if (l === '') break;
    if (l.startsWith('EXPOSURE=')) exposure *= parseFloat(l.slice(9)) || 1;
    if (pos >= bytes.length) throw new Error('HDR header truncated');
  }
  const res = line().trim().split(/\s+/);
  // standard orientation "-Y H +X W"
  if (res[0] !== '-Y' || res[2] !== '+X') throw new Error('unsupported HDR orientation ' + res.join(' '));
  const height = parseInt(res[1], 10), width = parseInt(res[3], 10);
  const data = new Float32Array(width * height * 3);
  const scan = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    if (width >= 8 && width < 0x8000 && bytes[pos] === 2 && bytes[pos + 1] === 2 && ((bytes[pos + 2] << 8) | bytes[pos + 3]) === width) {
      pos += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < width) {
          let count = bytes[pos++];
          if (count > 128) {
            count -= 128;
            const v = bytes[pos++];
            for (let i = 0; i < count; i++) scan[(x++) * 4 + c] = v;
          } else {
            for (let i = 0; i < count; i++) scan[(x++) * 4 + c] = bytes[pos++];
          }
        }
      }
    } else {
      // flat (or old RLE, which we treat as flat - never produced by Poly Haven)
      for (let x = 0; x < width; x++) {
        scan[x * 4] = bytes[pos++]; scan[x * 4 + 1] = bytes[pos++]; scan[x * 4 + 2] = bytes[pos++]; scan[x * 4 + 3] = bytes[pos++];
      }
    }
    for (let x = 0; x < width; x++) {
      const e = scan[x * 4 + 3];
      const o = (y * width + x) * 3;
      if (e === 0) { data[o] = data[o + 1] = data[o + 2] = 0; continue; }
      const f = Math.pow(2, e - 136) / exposure; // 2^(e-128) / 256
      data[o] = scan[x * 4] * f; data[o + 1] = scan[x * 4 + 1] * f; data[o + 2] = scan[x * 4 + 2] * f;
    }
  }
  return { width, height, data };
}

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Direction (unit) of the centre of equirect pixel (x, y) in a w x h map (row 0 = top). */
export function pixelDir(x, y, w, h, out = [0, 0, 0]) {
  const u = (x + 0.5) / w, v = 1 - (y + 0.5) / h;
  const phi = (u - 0.5) * 2 * Math.PI, lat = (v - 0.5) * Math.PI;
  const c = Math.cos(lat);
  out[0] = Math.cos(phi) * c; out[1] = Math.sin(lat); out[2] = Math.sin(phi) * c;
  return out;
}

/**
 * Builds the baker's sky.
 * @param {object} o
 *   hdr: path | Buffer | parsed {width,height,data} | function(dir:[x,y,z]) -> [r,g,b] radiance
 *   intensity: radiance multiplier (match scene.environmentIntensity), rotation: radians about +Y
 *   clamp: 'auto' | number | 0 (luminance clamp that removes the sun disc; 'auto' = 8x median sky)
 *   sun: { dir, color:[r,g,b] linear, intensity } used for the below-horizon ground estimate
 *   groundAlbedo: albedo of the virtual ground seen by rays escaping below the horizon (0.2)
 * @returns {{w,h,data:Float32Array, irrW, irrH, irr:Float32Array, sunDir:number[]|null, sunIrradiance:number[], clampValue:number}}
 */
export function makeSky(o = {}) {
  const W = o.width || 128, H = W >> 1;
  const intensity = o.intensity ?? 1;
  const rot = o.rotation || 0;
  let src = o.hdr;
  if (typeof src === 'string') src = parseHDR(fs.readFileSync(src));
  else if (src && (src instanceof Uint8Array || src instanceof ArrayBuffer)) src = parseHDR(src);
  if (!src) {
    // simple analytic overcast-ish gradient sky
    const zen = o.zenith || [0.55, 0.68, 0.95], hor = o.horizon || [0.95, 0.95, 0.92];
    src = (d) => {
      const t = Math.pow(Math.max(0, d[1]), 0.6);
      return [hor[0] + (zen[0] - hor[0]) * t, hor[1] + (zen[1] - hor[1]) * t, hor[2] + (zen[2] - hor[2]) * t];
    };
  }
  const d = [0, 0, 0];
  const data = new Float32Array(W * H * 3);
  let sunDir = null;
  let clampValue = 0;
  const sunIrr = [0, 0, 0];

  if (typeof src === 'function') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      pixelDir(x, y, W, H, d);
      // lookups use rotated dir: rotate about Y by -rot
      const c = Math.cos(-rot), s = Math.sin(-rot);
      const rx = c * d[0] + s * d[2], rz = -s * d[0] + c * d[2];
      const v = src([rx, d[1], rz]);
      const k = (y * W + x) * 3;
      data[k] = v[0] * intensity; data[k + 1] = v[1] * intensity; data[k + 2] = v[2] * intensity;
    }
  } else {
    const { width: sw, height: sh, data: sd } = src;
    // 1. sun detection + luminance statistics of the upper hemisphere
    let best = -1, bestI = 0;
    const lums = [];
    for (let y = 0; y < sh / 2; y++) {
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 3;
        const l = lum(sd[i], sd[i + 1], sd[i + 2]);
        if (l > best) { best = l; bestI = y * sw + x; }
        if ((x & 3) === 0) lums.push(l);
      }
    }
    lums.sort((a, b) => a - b);
    const median = lums[lums.length >> 1] || 1;
    clampValue = o.clamp === undefined || o.clamp === 'auto' ? median * 8 : (o.clamp || Infinity);
    if (best > clampValue * 4) {
      const dd = pixelDir(bestI % sw, Math.floor(bestI / sw), sw, sh, [0, 0, 0]);
      // apply rotation (image dir -> world dir: rotate about Y by +rot)
      const c = Math.cos(rot), s = Math.sin(rot);
      sunDir = [c * dd[0] + s * dd[2], dd[1], -s * dd[0] + c * dd[2]];
    }
    // 2. clamp + box downsample into W x H, accumulating the removed (sun) energy
    const acc = new Float64Array(W * H * 4);
    for (let y = 0; y < sh; y++) {
      const lat = (0.5 - (y + 0.5) / sh) * Math.PI;
      const dOmega = (2 * Math.PI / sw) * (Math.PI / sh) * Math.cos(lat);
      const ty = Math.min(H - 1, Math.floor(y * H / sh));
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 3;
        let r = sd[i], g = sd[i + 1], b = sd[i + 2];
        const l = lum(r, g, b);
        if (l > clampValue) {
          const k = clampValue / l;
          if (y < sh / 2) { // removed energy = sun irradiance on a surface facing the sun
            sunIrr[0] += (r - r * k) * dOmega; sunIrr[1] += (g - g * k) * dOmega; sunIrr[2] += (b - b * k) * dOmega;
          }
          r *= k; g *= k; b *= k;
        }
        // world = Ry(rot) * image  =>  world azimuth = image azimuth - rot
        const tx0 = Math.floor(x * W / sw);
        const tx = ((tx0 - Math.round(rot / (2 * Math.PI) * W)) % W + W) % W;
        const t = (ty * W + tx) * 4;
        acc[t] += r * dOmega; acc[t + 1] += g * dOmega; acc[t + 2] += b * dOmega; acc[t + 3] += dOmega;
      }
    }
    for (let i = 0; i < W * H; i++) {
      const w = acc[i * 4 + 3] || 1;
      data[i * 3] = (acc[i * 4] / w) * intensity;
      data[i * 3 + 1] = (acc[i * 4 + 1] / w) * intensity;
      data[i * 3 + 2] = (acc[i * 4 + 2] / w) * intensity;
    }
    for (let c = 0; c < 3; c++) sunIrr[c] *= intensity;
  }

  // 3. below-horizon: replace by a virtual ground lit by the sky (+ sun)
  const solid = (y) => (2 * Math.PI / W) * (Math.PI / H) * Math.cos((0.5 - (y + 0.5) / H) * Math.PI);
  const eUp = [0, 0, 0];
  for (let y = 0; y < H / 2; y++) for (let x = 0; x < W; x++) {
    pixelDir(x, y, W, H, d);
    const k = (y * W + x) * 3, w = solid(y) * Math.max(0, d[1]);
    eUp[0] += data[k] * w; eUp[1] += data[k + 1] * w; eUp[2] += data[k + 2] * w;
  }
  const ga = o.groundAlbedo ?? 0.2;
  const sun = o.sun;
  const sunUp = sun ? Math.max(0, sun.dir[1]) * (sun.intensity ?? 0) : 0;
  const sc = sun?.color || [1, 1, 1];
  const ground = [0, 1, 2].map((c) => (ga / Math.PI) * (eUp[c] + sunUp * sc[c]));
  for (let y = H / 2; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 3;
    // blend over a few degrees below the horizon so the horizon line is soft
    const t = Math.min(1, (y - H / 2 + 0.5) / (H * 0.04));
    for (let c = 0; c < 3; c++) data[k + c] = data[k + c] * (1 - t) + ground[c] * t;
  }

  // 4. irradiance table E(n) on a coarse equirect grid of normals
  const irrW = 32, irrH = 16;
  const irr = new Float32Array(irrW * irrH * 3);
  const n = [0, 0, 0];
  const dirs = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    pixelDir(x, y, W, H, d);
    const i = (y * W + x) * 4;
    dirs[i] = d[0]; dirs[i + 1] = d[1]; dirs[i + 2] = d[2]; dirs[i + 3] = solid(y);
  }
  for (let y = 0; y < irrH; y++) for (let x = 0; x < irrW; x++) {
    pixelDir(x, y, irrW, irrH, n);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < W * H; i++) {
      const c = n[0] * dirs[i * 4] + n[1] * dirs[i * 4 + 1] + n[2] * dirs[i * 4 + 2];
      if (c <= 0) continue;
      const w = c * dirs[i * 4 + 3];
      r += data[i * 3] * w; g += data[i * 3 + 1] * w; b += data[i * 3 + 2] * w;
    }
    const k = (y * irrW + x) * 3;
    irr[k] = r; irr[k + 1] = g; irr[k + 2] = b;
  }
  return { w: W, h: H, data, irrW, irrH, irr, sunDir, sunIrradiance: sunIrr, clampValue, skyUpIrradiance: eUp };
}
