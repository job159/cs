// Albedo QA: sRGB average of every material's baseColor texture over the texels its meshes actually paint
// (UV triangles rasterised onto the texture grid; alpha-MASK holes excluded), plus the ORM ambient-occlusion
// average over the same texels. Catches the "black silhouette" failure (AO / grime baked into baseColor on top
// of an occlusionTexture). Decodes one image at a time.
//   node tools/assets/zombies/albedo.mjs game/assets/zombies/walker_a.glb [more.glb ...] [--json] [--uv u0,v0,u1,v1]
// --uv limits the measure to a texture rectangle (glTF uv, v down), e.g. the MakeHuman head island 0.62,0.12,1,0.86.
// Targets (sRGB 0..255, mean of R,G,B): corpse skin 95-140, clothing 55-120 depending on fabric colour.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const TARGET = { skin: [95, 140], cloth: [55, 120] };

function readGLB(file) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  return { json, bin: buf.subarray(binStart) };
}

function accessorArray({ json, bin }, idx) {
  const acc = json.accessors[idx];
  const bv = json.bufferViews[acc.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const T = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[acc.componentType];
  const es = T.BYTES_PER_ELEMENT;
  const stride = bv.byteStride || es * comps;
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new T(acc.count * comps);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  for (let i = 0; i < acc.count; i++) for (let c = 0; c < comps; c++) {
    const o = base + i * stride + c * es;
    out[i * comps + c] = es === 4 ? (T === Float32Array ? dv.getFloat32(o, true) : dv.getUint32(o, true)) : es === 2 ? dv.getUint16(o, true) : dv.getUint8(o);
  }
  return out;
}

function decodeImage(g, imgIdx) {
  const im = g.json.images[imgIdx];
  const bv = g.json.bufferViews[im.bufferView];
  const b = g.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  if (b[0] === 0x89) { const p = PNG.sync.read(Buffer.from(b)); return { width: p.width, height: p.height, data: p.data }; }
  const j = jpeg.decode(b, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  return { width: j.width, height: j.height, data: j.data };
}

/** Coverage mask (Uint8Array w*h) of the UV triangles of all primitives using material `mi`. */
function coverage(g, mi, w, h) {
  const mask = new Uint8Array(w * h);
  for (const m of g.json.meshes) for (const p of m.primitives) {
    if (p.material !== mi || p.attributes.TEXCOORD_0 === undefined) continue;
    const uv = accessorArray(g, p.attributes.TEXCOORD_0);
    const ix = accessorArray(g, p.indices);
    for (let t = 0; t < ix.length; t += 3) {
      const ax = uv[ix[t] * 2] * w, ay = uv[ix[t] * 2 + 1] * h;
      const bx = uv[ix[t + 1] * 2] * w, by = uv[ix[t + 1] * 2 + 1] * h;
      const cx = uv[ix[t + 2] * 2] * w, cy = uv[ix[t + 2] * 2 + 1] * h;
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area) < 1e-12) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
        const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
        if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) mask[y * w + x] = 1;
      }
    }
  }
  return mask;
}

export function measure(file, uvRect = null) {
  const g = readGLB(file);
  const rows = [];
  g.json.materials.forEach((mat, mi) => {
    const pbr = mat.pbrMetallicRoughness || {};
    const meshes = g.json.meshes.filter((m) => m.primitives.some((p) => p.material === mi)).map((m) => m.name);
    const row = { material: mat.name, meshes, factor: pbr.baseColorFactor || [1, 1, 1, 1], ao: !!mat.occlusionTexture };
    if (!pbr.baseColorTexture) { row.srgb = (row.factor.slice(0, 3).map((c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255)); row.avg = row.srgb.reduce((a, b) => a + b) / 3; rows.push(row); return; }
    let img = decodeImage(g, g.json.textures[pbr.baseColorTexture.index].source);
    const { width: w, height: h } = img;
    const mask = coverage(g, mi, w, h);
    if (uvRect) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, v = (y + 0.5) / h;
      if (u < uvRect[0] || v < uvRect[1] || u > uvRect[2] || v > uvRect[3]) mask[y * w + x] = 0;
    }
    const masked = mat.alphaMode === 'MASK', cut = (mat.alphaCutoff ?? 0.5) * 255;
    const sum = [0, 0, 0]; let n = 0;
    for (let i = 0; i < w * h; i++) {
      if (!mask[i] || (masked && img.data[i * 4 + 3] < cut)) continue;
      sum[0] += img.data[i * 4]; sum[1] += img.data[i * 4 + 1]; sum[2] += img.data[i * 4 + 2]; n++;
    }
    // drop alpha-cut texels from the AO pass too
    if (masked) for (let i = 0; i < w * h; i++) if (img.data[i * 4 + 3] < cut) mask[i] = 0;
    img = null;
    n = Math.max(1, n);
    row.srgb = [sum[0] / n * row.factor[0], sum[1] / n * row.factor[1], sum[2] / n * row.factor[2]];
    row.avg = (row.srgb[0] + row.srgb[1] + row.srgb[2]) / 3;
    row.texels = n; row.size = `${w}x${h}`;
    if (mat.occlusionTexture) {
      const ao = decodeImage(g, g.json.textures[mat.occlusionTexture.index].source);
      let s = 0, k = 0;
      for (let y = 0; y < ao.height; y++) for (let x = 0; x < ao.width; x++) {
        const mx = Math.min(w - 1, Math.floor((x + 0.5) * w / ao.width)), my = Math.min(h - 1, Math.floor((y + 0.5) * h / ao.height));
        if (!mask[my * w + mx]) continue;
        s += ao.data[(y * ao.width + x) * 4]; k++;
      }
      row.aoAvg = s / Math.max(1, k) / 255;
    }
    rows.push(row);
  });
  return rows;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('albedo.mjs')) {
  const argv = process.argv.slice(2);
  const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--uv');
  const asJson = process.argv.includes('--json');
  const ui = process.argv.indexOf('--uv');
  const uvRect = ui > 0 ? process.argv[ui + 1].split(',').map(Number) : null;
  const all = {};
  for (const f of files) {
    const rows = measure(f, uvRect);
    all[path.basename(f)] = rows;
    if (asJson) continue;
    console.log(path.basename(f));
    for (const r of rows) {
      const t = TARGET[r.material];
      const flag = t ? (r.avg < t[0] ? '  << DARK' : r.avg > t[1] ? '  >> bright' : '  ok') : '';
      console.log(`  ${r.material.padEnd(6)} ${r.meshes.join(',').padEnd(26)} avg ${r.avg.toFixed(1).padStart(6)}  rgb ${r.srgb.map((c) => c.toFixed(0)).join('/').padEnd(12)}${r.ao ? ` AO ${r.aoAvg?.toFixed(2)}` : '        '}  ${r.size || 'factor'}${flag}`);
    }
  }
  if (asJson) console.log(JSON.stringify(all, null, 1));
}
