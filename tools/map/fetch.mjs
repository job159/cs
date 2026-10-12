// Fetches the CC0 assets of the map kit and processes them into game/assets/maps/common/.
//
//   node tools/map/fetch.mjs                 # everything (textures, HDRIs, props), skips what is up to date
//   node tools/map/fetch.mjs --textures      # only texture sets   (--hdris, --props likewise; combinable)
//   node tools/map/fetch.mjs --only brick_red,Barrel_01 [--force]
//   node tools/map/fetch.mjs --list          # print the catalogue
//
// Sources (all CC0, see docs/research/04-asset-sources.md): Poly Haven API (https://api.polyhaven.com, custom
// User-Agent as its ToS asks) and ambientCG (chain-link with opacity). Raw downloads go to tools/map/src/
// (gitignored, re-creatable); processed files to game/assets/maps/common/:
//   <set>_diff.jpg|png, <set>_nor.jpg (OpenGL), <set>_arm.jpg (R AO, G rough, B metal)  + textures.json
//   hdri/<id>_<res>.hdr                                                                  + textures.json .hdri
//   props/<id>.glb (simplified, materials -> props/<id>_<n>_{diff,nor,arm}.jpg)           + props.json
// Every asset is listed in docs/CREDITS.md (section between the map-assets markers, regenerated here).
// Memory: one image is decoded at a time (2k RGBA = 16 MB); the process stays well under 1 GB.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { unzipSync } from 'fflate';
import { MeshoptSimplifier } from 'meshoptimizer';
import { encodeJPEG } from './lib/jpeg.mjs';
import { ROOT, COMMON_DIR, readManifest, writeManifest } from './lib/texlib.mjs';
import { writeGLB } from './lib/glb.mjs';
import { readScene } from '../../game/src/world/glb.js';

const UA = 'CalamityFront/0.1 (github job159)';
const SRC = path.join(ROOT, 'tools', 'map', 'src');
const PROPS_DIR = path.join(COMMON_DIR, 'props');
const HDRI_DIR = path.join(COMMON_DIR, 'hdri');
const PROPS_MANIFEST = path.join(COMMON_DIR, 'props.json');
const CREDITS = path.join(ROOT, 'docs', 'CREDITS.md');

// ------------------------------------------------------------------------------------------- catalogue
// Texture sets. id = name used by the kit materials (tools/map/lib/materials.mjs); hero sets ship at 2k
// (the runtime downsizes per quality), the rest at 1k. tile (m) defaults to the Poly Haven real-world size.
export const TEXTURES = [
  { id: 'asphalt', ph: 'asphalt_04', hero: true, note: 'worn street asphalt' },
  { id: 'asphalt_cracked', ph: 'asphalt_02', hero: true, note: 'cracked asphalt' },
  { id: 'asphalt_dark', ph: 'clean_asphalt', note: 'fresh patches / repairs (decal pieces), parking lots' },
  { id: 'sidewalk', ph: 'concrete_pavement', hero: true, note: 'sidewalk slabs' },
  { id: 'concrete_floor', ph: 'concrete_floor_worn_001', hero: true, note: 'yards, floors, curbs' },
  { id: 'concrete_cracked', ph: 'damaged_concrete_floor_02', note: 'damaged concrete ground' },
  { id: 'concrete_wall', ph: 'concrete_wall_006', note: 'industrial concrete walls' },
  { id: 'brick_red', ph: 'red_brick', hero: true, note: 'red brick facades' },
  { id: 'brick_dark', ph: 'brick_wall_001', note: 'darker mixed brick' },
  { id: 'brick_painted', ph: 'painted_worn_brick', note: 'painted brick (tinted per building)' },
  { id: 'plaster', ph: 'plastered_wall', note: 'stucco / plaster (tinted per building)' },
  { id: 'plaster_worn', ph: 'worn_plaster_wall', note: 'interior plaster' },
  { id: 'corrugated', ph: 'corrugated_iron_02', note: 'galvanised corrugated sheet' },
  { id: 'corrugated_rusty', ph: 'rusty_corrugated_iron', note: 'rusty corrugated sheet' },
  { id: 'metal_container', ph: 'container_side', note: 'shipping container sides' },
  { id: 'metal_painted', ph: 'rusty_painted_metal', note: 'painted metal with rust' },
  { id: 'metal_shutter', ph: 'rusty_metal_shutter', note: 'roller shutters, garage doors' },
  { id: 'metal_rusty', ph: 'rust_coarse_01', note: 'burnt / rusted metal' },
  { id: 'metal_worn', ph: 'rusty_metal_02', note: 'white paint over rust (vehicles, signs; tinted)' },
  { id: 'wood_planks', ph: 'weathered_planks', note: 'boards, barricades' },
  { id: 'wood_siding', ph: 'blue_painted_planks', note: 'painted clapboard siding' },
  { id: 'roof_tar', ph: 'tarred_gravel', note: 'flat roofs' },
  { id: 'roof_shingles', ph: 'roof_slates_02', note: 'pitched roofs' },
  { id: 'tiles', ph: 'dirty_tiles', note: 'interior floor tiles' },
  { id: 'gravel', ph: 'gravel_floor_02', note: 'gravel yards, rail beds' },
  { id: 'dirt', ph: 'dirt', note: 'dirt patches' },
  { id: 'grass', ph: 'sparse_grass', note: 'weedy grass patches' },
  { id: 'rubble', ph: 'concrete_debris', note: 'debris / rubble ground' },
  { id: 'chainlink', acg: 'Fence006', alpha: true, tile: 1.0, note: 'chain-link mesh with opacity' },
];

export const HDRIS = [
  { id: 'kloppenheim_01_puresky', res: ['1k', '2k'], note: 'overcast dusk, low contrast (default sky)' },
  { id: 'industrial_sunset_puresky', res: ['1k'], note: 'dusk, partly cloudy' },
  { id: 'overcast_soil_puresky', res: ['1k'], note: 'overcast day' },
];

// Props: Poly Haven glTF 1k, simplified to maxTris for phones. surf = impact surface; collide = default
// collider kind used by kit.prop() ('box' oriented bbox, 'cyl' upright cylinder approximated by a box, 'none').
export const PROPS = [
  { id: 'Barrel_01', maxTris: 1600, surf: 'metal', collide: 'cyl', note: 'red oil drum' },
  { id: 'barrel_03', maxTris: 1200, surf: 'metal', collide: 'cyl', note: 'blue fuel drum' },
  { id: 'wooden_crate_02', maxTris: 1500, surf: 'wood', collide: 'box', note: 'wooden crate' },
  { id: 'cardboard_box_01', maxTris: 1500, surf: 'wood', collide: 'box', note: 'cardboard box' },
  { id: 'plastic_crate_02', maxTris: 1500, surf: 'wood', collide: 'box', note: 'plastic crate' },
  { id: 'old_tyre', maxTris: 1600, surf: 'dirt', collide: 'cyl', note: 'old tyre' },
  { id: 'metal_trash_can', maxTris: 3000, surf: 'metal', collide: 'box', note: 'dumpster' },
  { id: 'trashbag', maxTris: 1200, surf: 'dirt', collide: 'none', note: 'trash bag' },
  { id: 'fire_hydrant', maxTris: 2500, surf: 'metal', collide: 'cyl', note: 'fire hydrant' },
  { id: 'street_lamp_01', maxTris: 3500, surf: 'metal', collide: 'pole', note: 'street lamp' },
  { id: 'concrete_road_barrier_02', maxTris: 1500, surf: 'concrete', collide: 'box', note: 'jersey barrier' },
  { id: 'exterior_aircon_unit', maxTris: 2500, surf: 'metal', collide: 'box', note: 'wall AC unit' },
  { id: 'utility_box_02', maxTris: 2000, surf: 'metal', collide: 'box', note: 'electrical utility box' },
  { id: 'painted_wooden_bench', maxTris: 700, surf: 'wood', collide: 'box', note: 'bench' },
  { id: 'water_manhole_cover', maxTris: 600, surf: 'metal', collide: 'none', note: 'manhole cover' },
  { id: 'covered_car', maxTris: 5000, surf: 'metal', collide: 'box', note: 'car under a tarp' },
  { id: 'security_light', maxTris: 1500, surf: 'metal', collide: 'none', note: 'wall flood light' },
  { id: 'propane_tank', maxTris: 1500, surf: 'metal', collide: 'cyl', note: 'propane tank' },
];

// ------------------------------------------------------------------------------------------- helpers
const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const only = opt('only') ? new Set(opt('only').split(',')) : null;
const force = flag('force');
const log = (...a) => console.log(...a);

async function fetchRetry(url, tries = 4) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return r;
    } catch (e) { err = e; await new Promise((res) => setTimeout(res, 800 * (i + 1))); }
  }
  throw err;
}
const apiCache = new Map();
async function api(p) {
  if (apiCache.has(p)) return apiCache.get(p);
  const j = await (await fetchRetry('https://api.polyhaven.com' + p)).json();
  apiCache.set(p, j);
  return j;
}
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
/** Downloads url to file unless it exists with the expected md5/size. Returns the Buffer. */
async function download(url, file, { md5: want, size } = {}) {
  if (fs.existsSync(file)) {
    const b = fs.readFileSync(file);
    if ((!want || md5(b) === want) && (!size || b.length === size)) return b;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const b = Buffer.from(await (await fetchRetry(url)).arrayBuffer());
  if (want && md5(b) !== want) throw new Error(`md5 mismatch for ${url}`);
  fs.writeFileSync(file, b);
  log(`    downloaded ${path.relative(ROOT, file)} (${(b.length / 1e6).toFixed(2)} MB)`);
  return b;
}

/** Decodes a JPEG/PNG into { width, height, data: RGBA Uint8Array }. */
function decodeImage(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) { const p = PNG.sync.read(buf); return { width: p.width, height: p.height, data: p.data }; }
  const d = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024, maxResolutionInMP: 100 });
  return { width: d.width, height: d.height, data: d.data };
}
/** Halves an RGBA image until it is <= maxSize (box filter; normal maps are renormalised). */
function downsize(img, maxSize, isNormal = false) {
  let { width: w, height: h, data } = img;
  while (Math.max(w, h) > maxSize) {
    const W = Math.max(1, w >> 1), H = Math.max(1, h >> 1);
    const out = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const acc = [0, 0, 0, 0];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const k = (Math.min(h - 1, y * 2 + dy) * w + Math.min(w - 1, x * 2 + dx)) * 4;
        for (let c = 0; c < 4; c++) acc[c] += data[k + c];
      }
      const o = (y * W + x) * 4;
      if (isNormal) {
        let nx = acc[0] / 510 - 1, ny = acc[1] / 510 - 1, nz = acc[2] / 510 - 1;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        out[o] = Math.round((nx * 0.5 + 0.5) * 255); out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255); out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        out[o + 3] = 255;
      } else for (let c = 0; c < 4; c++) out[o + c] = Math.round(acc[c] / 4);
    }
    w = W; h = H; data = out;
  }
  return { width: w, height: h, data };
}
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** Average linear albedo of an RGBA image (alpha-weighted). */
function averageLinear(img) {
  const { data } = img, n = data.length / 4;
  let r = 0, g = 0, b = 0, wsum = 0;
  const step = Math.max(1, Math.floor(n / 200000));
  for (let i = 0; i < n; i += step) {
    const a = data[i * 4 + 3] / 255;
    r += srgbToLinear(data[i * 4] / 255) * a; g += srgbToLinear(data[i * 4 + 1] / 255) * a; b += srgbToLinear(data[i * 4 + 2] / 255) * a;
    wsum += a;
  }
  return [r / wsum, g / wsum, b / wsum].map((v) => +v.toFixed(4));
}
const writeJPEG = (file, img, quality, subsample) => fs.writeFileSync(file, encodeJPEG({ width: img.width, height: img.height, data: img.data, channels: 4 }, { quality, subsample }));
const writePNG = (file, img) => { const p = new PNG({ width: img.width, height: img.height, colorType: 6 }); p.data = Buffer.from(img.data); fs.writeFileSync(file, PNG.sync.write(p, { deflateLevel: 9 })); };
const rel = (f) => path.relative(COMMON_DIR, f).replace(/\\/g, '/');
const want = (id) => !only || only.has(id);

// ------------------------------------------------------------------------------------------- textures
async function fetchTextures(manifest) {
  const phList = fs.existsSync(path.join(SRC, 'ph_textures.json')) ? JSON.parse(fs.readFileSync(path.join(SRC, 'ph_textures.json'))) : await api('/assets?t=textures');
  for (const t of TEXTURES) {
    if (!want(t.id) && !want(t.ph || t.acg)) continue;
    const cur = manifest.sets[t.id];
    const res = t.hero ? '2k' : '1k';
    const upToDate = cur && cur.source !== 'procedural' && cur.srcId === (t.ph || t.acg) && cur.resName === res
      && Object.values(cur.maps).every((f) => fs.existsSync(path.join(COMMON_DIR, f)));
    if (upToDate && !force) { log(`  tex ${t.id.padEnd(18)} ok`); continue; }
    log(`  tex ${t.id.padEnd(18)} <- ${t.ph ? 'polyhaven ' + t.ph : 'ambientCG ' + t.acg} (${res})`);
    let entry;
    if (t.ph) entry = await polyhavenTexture(t, res, phList);
    else entry = await ambientcgTexture(t, res);
    manifest.sets[t.id] = entry;
    writeManifest(manifest); // incremental: an interrupted run keeps what it finished
  }
}

async function polyhavenTexture(t, res, phList) {
  const files = await api('/files/' + t.ph);
  const info = phList[t.ph] || (await api('/info/' + t.ph));
  const dir = path.join(SRC, 'tex', t.ph);
  const pick = (key) => files[key]?.[res]?.jpg;
  const maps = { diff: pick('Diffuse'), nor: pick('nor_gl'), arm: pick('arm') };
  if (!maps.diff || !maps.nor) throw new Error(`${t.ph}: missing ${res} maps`);
  const out = {};
  let avg = null, size = 0;
  for (const [k, f] of Object.entries(maps)) {
    let img;
    if (f) {
      const buf = await download(f.url, path.join(dir, path.basename(f.url)), f);
      img = decodeImage(buf);
    } else { // no packed ARM: compose from rough (+ AO)
      const r = pick('Rough'), ao = pick('AO');
      const rough = decodeImage(await download(r.url, path.join(dir, path.basename(r.url)), r));
      const aoImg = ao ? decodeImage(await download(ao.url, path.join(dir, path.basename(ao.url)), ao)) : null;
      img = { width: rough.width, height: rough.height, data: new Uint8Array(rough.data.length) };
      for (let i = 0; i < rough.data.length; i += 4) {
        img.data[i] = aoImg ? aoImg.data[i] : 255; img.data[i + 1] = rough.data[i]; img.data[i + 2] = 0; img.data[i + 3] = 255;
      }
    }
    if (k === 'arm') img = downsize(img, 1024); // AO / rough / metal carry little high-frequency detail
    if (k === 'diff') { size = img.width; avg = averageLinear(img); }
    const file = path.join(COMMON_DIR, `${t.id}_${k}.jpg`);
    const big = img.width > 1024;
    if (k === 'diff') writeJPEG(file, img, big ? 82 : 84, true);
    else if (k === 'nor') writeJPEG(file, img, big ? 84 : 88, false);
    else writeJPEG(file, img, 85, false);
    out[k] = rel(file);
    img = null;
  }
  const dims = info.dimensions ? info.dimensions.map((d) => +(d / 1000).toFixed(3)) : [2, 2];
  return {
    id: t.id, source: 'polyhaven', srcId: t.ph, license: 'CC0', url: `https://polyhaven.com/a/${t.ph}`,
    resName: res, res: size, tile: t.tile ?? dims[0], tileV: t.tile ?? (dims[1] > 0.01 ? dims[1] : dims[0]), alpha: false, maps: out, avg, note: t.note,
  };
}

async function ambientcgTexture(t, res) {
  const R = res.toUpperCase();
  const url = `https://ambientcg.com/get?file=${t.acg}_${R}-JPG.zip`;
  const zipFile = path.join(SRC, 'tex', `${t.acg}_${R}-JPG.zip`);
  const zip = await download(url, zipFile);
  const files = unzipSync(new Uint8Array(zip), { filter: (f) => /_(Color|NormalGL|Roughness|Metalness|Opacity|AmbientOcclusion)\.(jpg|png)$/i.test(f.name) });
  const get = (suffix) => { const k = Object.keys(files).find((n) => n.toLowerCase().includes('_' + suffix.toLowerCase() + '.')); return k ? decodeImage(Buffer.from(files[k])) : null; };
  const color = get('Color');
  if (!color) throw new Error(`${t.acg}: no colour map in zip`);
  const op = get('Opacity');
  if (op) for (let i = 0; i < color.data.length; i += 4) color.data[i + 3] = op.data[i];
  const out = {};
  const avg = averageLinear(color);
  if (t.alpha) { const f = path.join(COMMON_DIR, `${t.id}_diff.png`); writePNG(f, color); out.diff = rel(f); }
  else { const f = path.join(COMMON_DIR, `${t.id}_diff.jpg`); writeJPEG(f, color, 84, true); out.diff = rel(f); }
  const nor = get('NormalGL');
  if (nor) { const f = path.join(COMMON_DIR, `${t.id}_nor.jpg`); writeJPEG(f, nor, 90, false); out.nor = rel(f); }
  const rough = get('Roughness'), metal = get('Metalness'), ao = get('AmbientOcclusion');
  const arm = { width: color.width, height: color.height, data: new Uint8Array(color.data.length) };
  for (let i = 0; i < arm.data.length; i += 4) {
    arm.data[i] = ao ? ao.data[i] : 255; arm.data[i + 1] = rough ? rough.data[i] : 200; arm.data[i + 2] = metal ? metal.data[i] : 0; arm.data[i + 3] = 255;
  }
  const fa = path.join(COMMON_DIR, `${t.id}_arm.jpg`); writeJPEG(fa, arm, 86, false); out.arm = rel(fa);
  return {
    id: t.id, source: 'ambientcg', srcId: t.acg, license: 'CC0', url: `https://ambientcg.com/view?id=${t.acg}`,
    resName: res, res: color.width, tile: t.tile ?? 1, tileV: t.tile ?? 1, alpha: !!t.alpha, maps: out, avg, note: t.note,
  };
}

// ------------------------------------------------------------------------------------------- HDRIs
async function fetchHdris(manifest) {
  manifest.hdri ||= {};
  fs.mkdirSync(HDRI_DIR, { recursive: true });
  for (const h of HDRIS) {
    if (!want(h.id)) continue;
    const files = await api('/files/' + h.id);
    const entry = { id: h.id, source: 'polyhaven', license: 'CC0', url: `https://polyhaven.com/a/${h.id}`, files: {}, note: h.note };
    for (const res of h.res) {
      const f = files.hdri[res].hdr;
      const out = path.join(HDRI_DIR, `${h.id}_${res}.hdr`);
      const buf = await download(f.url, path.join(SRC, 'hdri', path.basename(f.url)), f);
      if (!fs.existsSync(out) || fs.statSync(out).size !== buf.length) fs.writeFileSync(out, buf);
      entry.files[res] = rel(out);
    }
    log(`  hdri ${h.id.padEnd(28)} ${h.res.join(', ')}`);
    manifest.hdri[h.id] = entry;
  }
  writeManifest(manifest);
}

// ------------------------------------------------------------------------------------------- props
async function fetchProps() {
  const manifest = fs.existsSync(PROPS_MANIFEST) ? JSON.parse(fs.readFileSync(PROPS_MANIFEST, 'utf8')) : {};
  fs.mkdirSync(PROPS_DIR, { recursive: true });
  await MeshoptSimplifier.ready;
  for (const p of PROPS) {
    if (!want(p.id)) continue;
    const cur = manifest[p.id];
    if (cur && cur.maxTris === p.maxTris && fs.existsSync(path.join(COMMON_DIR, cur.file)) && !force) { log(`  prop ${p.id.padEnd(26)} ok`); continue; }
    const files = await api('/files/' + p.id);
    const g = files.gltf?.['1k']?.gltf;
    if (!g) { log(`  ! prop ${p.id}: no 1k glTF`); continue; }
    const dir = path.join(SRC, 'models', p.id);
    const gltfBuf = await download(g.url, path.join(dir, path.basename(g.url)), g);
    for (const [relp, f] of Object.entries(g.include || {})) await download(f.url, path.join(dir, relp), f);
    const json = JSON.parse(gltfBuf.toString('utf8'));
    const buffers = (json.buffers || []).map((b) => { const bb = fs.readFileSync(path.join(dir, decodeURIComponent(b.uri))); return new Uint8Array(bb.buffer, bb.byteOffset, bb.byteLength); });
    const doc = { json, buffers };
    const entry = await processProp(p, doc, dir);
    manifest[p.id] = entry;
    fs.writeFileSync(PROPS_MANIFEST, JSON.stringify(manifest, null, 1));
    log(`  prop ${p.id.padEnd(26)} ${entry.srcTris} -> ${entry.tris} tris, ${entry.materials.length} material(s), ${entry.size.map((v) => v.toFixed(2)).join(' x ')} m`);
  }
  fs.writeFileSync(PROPS_MANIFEST, JSON.stringify(manifest, null, 1));
}

function transformPoint(m, x, y, z) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}
function transformDir(m, x, y, z) { // assumes uniform-ish scale; renormalised
  const v = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

async function processProp(p, doc, dir) {
  const inst = readScene(doc);
  // gather per material
  const groups = new Map();
  let srcTris = 0;
  for (const m of inst) for (const pr of m.primitives) {
    if (pr.mode !== 4) continue;
    const key = pr.material ?? -1;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { pos: [], nrm: [], uv: [], idx: [] }));
    const P = pr.attributes.position.array, N = pr.attributes.normal?.array, U = pr.attributes.uv?.array;
    const base = g.pos.length / 3;
    const n = P.length / 3;
    for (let i = 0; i < n; i++) {
      g.pos.push(...transformPoint(m.matrix, P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
      g.nrm.push(...(N ? transformDir(m.matrix, N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) : [0, 1, 0]));
      g.uv.push(U ? U[i * 2] : 0, U ? U[i * 2 + 1] : 0);
    }
    const I = pr.index ? pr.index.array : Uint32Array.from({ length: n }, (_, i) => i);
    let flip = false;
    { const mm = m.matrix; const det = mm[0] * (mm[5] * mm[10] - mm[6] * mm[9]) - mm[4] * (mm[1] * mm[10] - mm[2] * mm[9]) + mm[8] * (mm[1] * mm[6] - mm[2] * mm[5]); flip = det < 0; }
    for (let i = 0; i < I.length; i += 3) {
      if (flip) g.idx.push(base + I[i], base + I[i + 2], base + I[i + 1]); else g.idx.push(base + I[i], base + I[i + 1], base + I[i + 2]);
    }
    srcTris += I.length / 3;
  }
  const ratio = Math.min(1, p.maxTris / Math.max(1, srcTris));
  const meshes = [], materials = [], matEntries = [];
  let bbMin = [Infinity, Infinity, Infinity], bbMax = [-Infinity, -Infinity, -Infinity], tris = 0;
  let mi = 0;
  for (const [key, g] of groups) {
    const pos = Float32Array.from(g.pos), nrm = Float32Array.from(g.nrm), uv = Float32Array.from(g.uv);
    let idx = Uint32Array.from(g.idx);
    if (ratio < 1) {
      const target = Math.max(36, Math.floor((idx.length / 3) * ratio) * 3);
      const attrs = new Float32Array((pos.length / 3) * 5);
      for (let i = 0; i < pos.length / 3; i++) { attrs.set(nrm.subarray(i * 3, i * 3 + 3), i * 5); attrs[i * 5 + 3] = uv[i * 2]; attrs[i * 5 + 4] = uv[i * 2 + 1]; }
      const [res] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attrs, 5, [0.4, 0.4, 0.4, 1, 1], null, target, 0.02, []);
      idx = res;
    }
    // compact
    const remap = new Int32Array(pos.length / 3).fill(-1);
    const P = [], N = [], U = [];
    const I = new Uint32Array(idx.length);
    for (let i = 0; i < idx.length; i++) {
      const v = idx[i];
      if (remap[v] < 0) {
        remap[v] = P.length / 3;
        P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); N.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]); U.push(uv[v * 2], uv[v * 2 + 1]);
        for (let c = 0; c < 3; c++) { bbMin[c] = Math.min(bbMin[c], pos[v * 3 + c]); bbMax[c] = Math.max(bbMax[c], pos[v * 3 + c]); }
      }
      I[i] = remap[v];
    }
    tris += I.length / 3;
    // material + textures
    const src = key >= 0 ? doc.json.materials[key] : {};
    const texFile = (ti) => {
      if (ti === undefined) return null;
      const tex = doc.json.textures[ti.index];
      const img = doc.json.images[tex.source];
      return path.join(dir, decodeURIComponent(img.uri));
    };
    const pbr = src.pbrMetallicRoughness || {};
    const fDiff = texFile(pbr.baseColorTexture), fNor = texFile(src.normalTexture);
    const fMR = texFile(pbr.metallicRoughnessTexture), fAO = texFile(src.occlusionTexture);
    const base = `${p.id}_${mi}`;
    const maps = {};
    let avg = [0.5, 0.5, 0.5], alpha = src.alphaMode === 'MASK' || src.alphaMode === 'BLEND';
    if (fDiff) {
      const img = downsize(decodeImage(fs.readFileSync(fDiff)), 1024);
      avg = averageLinear(img);
      let hasAlpha = false;
      for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 250) { hasAlpha = true; break; }
      alpha = alpha && hasAlpha;
      if (alpha) { const f = path.join(PROPS_DIR, base + '_diff.png'); writePNG(f, img); maps.diff = rel(f); }
      else { const f = path.join(PROPS_DIR, base + '_diff.jpg'); writeJPEG(f, img, 84, true); maps.diff = rel(f); }
    }
    if (fNor) { const img = downsize(decodeImage(fs.readFileSync(fNor)), 1024, true); const f = path.join(PROPS_DIR, base + '_nor.jpg'); writeJPEG(f, img, 90, false); maps.nor = rel(f); }
    if (fMR || fAO) {
      const mr = fMR ? downsize(decodeImage(fs.readFileSync(fMR)), 1024) : null;
      const ao = fAO && fAO !== fMR ? downsize(decodeImage(fs.readFileSync(fAO)), 1024) : null;
      const ref = mr || ao;
      const arm = { width: ref.width, height: ref.height, data: new Uint8Array(ref.data.length) };
      for (let i = 0; i < arm.data.length; i += 4) {
        arm.data[i] = ao ? ao.data[i] : mr && fAO === fMR ? mr.data[i] : 255;
        arm.data[i + 1] = mr ? mr.data[i + 1] : 220; arm.data[i + 2] = mr ? mr.data[i + 2] : 0; arm.data[i + 3] = 255;
      }
      const f = path.join(PROPS_DIR, base + '_arm.jpg'); writeJPEG(f, arm, 86, false); maps.arm = rel(f);
    }
    const color = pbr.baseColorFactor || [1, 1, 1, 1];
    const me = {
      name: src.name || base, maps, avg, alpha, doubleSided: !!src.doubleSided,
      color: color.slice(0, 3), rough: pbr.roughnessFactor ?? 1, metal: pbr.metallicFactor ?? (fMR ? 1 : 0),
    };
    matEntries.push(me);
    materials.push({
      name: me.name, doubleSided: me.doubleSided || undefined, alphaMode: alpha ? 'MASK' : undefined, alphaCutoff: alpha ? 0.5 : undefined,
      pbrMetallicRoughness: { baseColorFactor: [...me.color, 1], roughnessFactor: me.rough, metallicFactor: me.metal },
      extras: { maps, avg },
    });
    meshes.push({ name: `${p.id}_${mi}`, attributes: { POSITION: { array: Float32Array.from(P), itemSize: 3 }, NORMAL: { array: Float32Array.from(N), itemSize: 3 }, TEXCOORD_0: { array: Float32Array.from(U), itemSize: 2 } }, indices: I, material: mi });
    mi++;
  }
  const glb = await writeGLB({ meshes, materials, extras: { id: p.id, source: 'polyhaven', license: 'CC0' } });
  const file = path.join(PROPS_DIR, `${p.id}.glb`);
  fs.writeFileSync(file, glb);
  return {
    id: p.id, file: rel(file), source: 'polyhaven', license: 'CC0', url: `https://polyhaven.com/a/${p.id}`,
    srcTris, tris, maxTris: p.maxTris, bbox: [bbMin.map((v) => +v.toFixed(4)), bbMax.map((v) => +v.toFixed(4))],
    size: bbMax.map((v, i) => +(v - bbMin[i]).toFixed(3)), surf: p.surf, collide: p.collide, materials: matEntries, note: p.note,
  };
}

// ------------------------------------------------------------------------------------------- credits
function writeCredits(manifest) {
  const props = fs.existsSync(PROPS_MANIFEST) ? JSON.parse(fs.readFileSync(PROPS_MANIFEST, 'utf8')) : {};
  const lines = [];
  lines.push('<!-- map-assets:begin (generated by tools/map/fetch.mjs - do not edit by hand) -->');
  lines.push('### 地圖素材 Map assets (CC0)');
  lines.push('');
  lines.push('All map textures, HDRIs and props are CC0 1.0 (public domain). Downloaded at build time by `tools/map/fetch.mjs`,');
  lines.push('re-encoded / simplified for phones. Attribution is not required; listed here for provenance.');
  lines.push('');
  lines.push('| Kind | Asset (ours) | Source | Author / site | License |');
  lines.push('|---|---|---|---|---|');
  for (const s of Object.values(manifest.sets || {})) {
    if (s.source === 'procedural') { lines.push(`| texture | \`${s.id}\` | generated by tools/map/lib/proctex.mjs | original | CC0 |`); continue; }
    lines.push(`| texture | \`${s.id}\` | [${s.srcId}](${s.url}) | ${s.source === 'polyhaven' ? 'Poly Haven' : 'ambientCG'} | CC0 |`);
  }
  for (const h of Object.values(manifest.hdri || {})) lines.push(`| HDRI | \`${h.id}\` | [${h.id}](${h.url}) | Poly Haven | CC0 |`);
  for (const p of Object.values(props)) lines.push(`| model | \`${p.id}\` | [${p.id}](${p.url}) | Poly Haven | CC0 |`);
  lines.push('<!-- map-assets:end -->');
  const block = lines.join('\n');
  let text = fs.existsSync(CREDITS) ? fs.readFileSync(CREDITS, 'utf8') : '# 素材來源 CREDITS\n\n本專案程式碼為 MIT；以下列出所有第三方素材與授權。\n\n';
  const re = /<!-- map-assets:begin[\s\S]*?<!-- map-assets:end -->/;
  text = re.test(text) ? text.replace(re, block) : text.trimEnd() + '\n\n' + block + '\n';
  fs.writeFileSync(CREDITS, text);
}

// ------------------------------------------------------------------------------------------- main
async function main() {
  if (flag('list')) {
    for (const t of TEXTURES) log(`tex   ${t.id.padEnd(18)} ${t.ph ? 'ph:' + t.ph : 'acg:' + t.acg}${t.hero ? ' (2k)' : ''}  ${t.note}`);
    for (const h of HDRIS) log(`hdri  ${h.id.padEnd(28)} ${h.res.join(',')}  ${h.note}`);
    for (const p of PROPS) log(`prop  ${p.id.padEnd(26)} <= ${p.maxTris} tris  ${p.note}`);
    return;
  }
  const all = !flag('textures') && !flag('hdris') && !flag('props');
  fs.mkdirSync(SRC, { recursive: true });
  const manifest = readManifest();
  manifest.sets ||= {};
  if (all || flag('hdris')) { log('HDRIs'); await fetchHdris(manifest); }
  if (all || flag('textures')) { log('textures'); await fetchTextures(manifest); }
  if (all || flag('props')) { log('props'); await fetchProps(); }
  writeManifest(manifest);
  writeCredits(manifest);
  log('done');
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
