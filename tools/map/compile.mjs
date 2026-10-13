// MAP COMPILER: tools/map/<map>/zones/*.mjs (+ layout.mjs) -> game/assets/maps/<map>/
//
//   node tools/map/compile.mjs <map> [--only zoneA,zoneB] [--nobake] [--fast] [--res 8] [--samples 64]
//                                    [--threads 6] [--atlas 2048] [--meshopt] [--chunk 40] [--out dir]
//
//   --only     compile just these zones (fast iteration; the package then only contains them)
//   --nobake   skip the lightmap bake (runtime falls back to IBL + sun for every surface)
//   --fast     quick bake preview (resolution 4, 16 samples)
//
// Pipeline: every zone module exports build(kit, layout) (kit = tools/map/lib/kit.mjs, one per zone); the kit
// accumulates geometry per (material, chunk). The compiler merges the zones, builds one mesh per bucket,
// bakes lightmaps (tools/map/lib/lightmap.mjs: uv1 + RGBM atlases + sun-mask atlases), writes
//   static.glb      visual meshes (POSITION, NORMAL, TEXCOORD_0 world-metric UVs, TEXCOORD_1 lightmap UVs,
//                   COLOR_0 tint) - mesh extras { mat, lm (atlas), chunk }
//   collision.glb   simplified collision soup (POSITION + _SURF per vertex, SURF ids of collision.js)
//   nav.json/.bin   NavGrid package (game/src/world/nav.js)
//   lm_<i>.png, lm_<i>_sun.png   lightmap atlases (RGBM-sqrt) + sun visibility masks
//   map.json        everything else (materials, env, sun, fog, spawns, spawners, zones, lights, stats)
// Memory: bucket data lives in typed arrays; the bake runs <= `--threads` workers (default 6).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { createKit, readPropsManifest } from './lib/kit.mjs';
import { readManifest, ensureSets, ROOT } from './lib/texlib.mjs';
import { MATERIALS } from './lib/materials.mjs';
import { writeGLB } from './lib/glb.mjs';
import { bakeNav } from './lib/navbake.mjs';
import { MeshBVH } from 'three-mesh-bvh';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = (n) => args.includes('--' + n);
const mapId = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--') || ['nobake', 'fast', 'meshopt'].includes(args[i - 1].slice(2))));
if (!mapId) { console.error('usage: node tools/map/compile.mjs <map> [--only zones] [--nobake] [--fast]'); process.exit(1); }
const SRC = path.join(ROOT, 'tools', 'map', mapId);
const OUT = path.resolve(opt('out', path.join(ROOT, 'game', 'assets', 'maps', mapId)));
const only = opt('only') ? new Set(opt('only').split(',')) : null;
const log = (...a) => console.log(...a);
const T0 = performance.now();
const lap = (label) => log(`  [${((performance.now() - T0) / 1000).toFixed(1)} s] ${label}`);

const DEFAULT_ENV = {
  sun: { dir: [-0.62, 0.42, -0.66], color: '#ffc08a', intensity: 1.8, angle: 1.2, shadow: { mapSize: 2048, extent: 45 } },
  sky: { hdri: 'kloppenheim_01_puresky', rotationDeg: 0, envIntensity: 0.6, backgroundIntensity: 0.8 },
  fog: { color: '#8f8b86', density: 0.0075 },
  exposure: 1.0,
};

async function main() {
  if (!fs.existsSync(SRC)) throw new Error(`no map sources at ${SRC}`);
  // procedural stand-ins for any texture set the palette needs that was not fetched (tools/map/fetch.mjs)
  ensureSets([...new Set(Object.values(MATERIALS).map((m) => m.set).filter(Boolean))], { log });
  const layoutFile = path.join(SRC, 'layout.mjs');
  const layout = fs.existsSync(layoutFile) ? await import(pathToFileURL(layoutFile).href) : {};
  const META = layout.META || {};
  const ENV = mergeDeep(DEFAULT_ENV, layout.ENV || {});
  const chunk = +opt('chunk', META.chunk || 40);
  const zoneDir = path.join(SRC, 'zones');
  const zoneFiles = fs.existsSync(zoneDir) ? fs.readdirSync(zoneDir).filter((f) => f.endsWith('.mjs')).sort() : [];
  const zones = zoneFiles.map((f) => ({ id: f.replace(/\.mjs$/, ''), file: path.join(zoneDir, f) })).filter((z) => !only || only.has(z.id));
  if (!zones.length) throw new Error(`no zones to compile in ${zoneDir}${only ? ' matching --only' : ''}`);
  log(`compiling ${mapId}: ${zones.map((z) => z.id).join(', ')} -> ${path.relative(ROOT, OUT)}`);

  // ---------------------------------------------------------------- build zones
  const kits = [];
  const extra = { playerSpawns: [], spawners: [], buy: [], supply: [], zones: [], bossArenas: {}, lights: [], objectives: [] };
  for (const z of zones) {
    const mod = await import(pathToFileURL(z.file).href);
    const kit = createKit({ zone: z.id, layout, chunk, log });
    const t = performance.now();
    const res = (await mod.build(kit, layout)) || {};
    kit.finalize?.();
    kits.push(kit);
    for (const k of Object.keys(extra)) {
      if (!res[k]) continue;
      if (Array.isArray(extra[k])) extra[k].push(...res[k]); else Object.assign(extra[k], res[k]);
    }
    const s = kit.stats();
    log(`  zone ${z.id.padEnd(12)} ${s.tris.toLocaleString()} tris in ${s.buckets} buckets, ${s.colTris.toLocaleString()} collision tris, ${s.lights} lights, ${s.spawners} spawners (${((performance.now() - t) / 1000).toFixed(1)} s)`);
  }
  // global data from the layout (zones may also add their own)
  // gameplay data: layout.toMapJson() (contract fields) or the raw layout exports, plus what zones added via the kit
  const base = typeof layout.toMapJson === 'function' ? layout.toMapJson() : {};
  const fromKits = (k) => [...extra[k], ...kits.flatMap((kit) => kit[k === 'buy' ? 'buyZones' : k === 'supply' ? 'supplies' : k] || [])];
  const pos3 = (p) => (Array.isArray(p) ? p : p?.pos);
  const playerSpawns = [...(base.playerSpawns || layout.PLAYER_SPAWNS || []), ...fromKits('playerSpawns')];
  const spawners = [...(base.spawners || layout.SPAWNERS || []).map((sp) => ({ ...sp })), ...fromKits('spawners')];
  const buy = [...(base.buy || layout.BUY || []), ...fromKits('buy')];
  const supply = [...(base.supply || layout.SUPPLY || []).map(pos3).filter(Boolean), ...fromKits('supply')];
  // lights: every layout light that has a position (realtime ones run in the pool, the rest are baked), + kit lights
  const lights = [...(layout.LIGHTS || []).filter((l) => Array.isArray(l.pos)).map((l) => {
    const o = { ...l, type: l.type === 'spot' ? 'spot' : 'point' };
    if (l.type === 'area') { o.radius = Math.max(...(l.size || [1])) / 2; o.range = l.range ?? 14; }
    if (!o.realtime && o.bake === undefined) o.bake = true;
    delete o.note;
    return o;
  }), ...fromKits('lights')];
  const zoneDefs = [...(base.zones || layout.ZONES || []).map((z) => ({ id: z.id, name: z.name, nameEn: z.nameEn, polygon: z.polygon, ...(z.floorY !== undefined ? { floorY: z.floorY } : {}) })), ...extra.zones, ...kits.flatMap((k) => k.zones)];
  const bossArenas = { ...(base.bossArenas || layout.BOSS_ARENAS || {}), ...extra.bossArenas };
  for (const k of kits) Object.assign(bossArenas, k.bossArenas);
  const objectives = [...(base.objectives || layout.OBJECTIVES || []), ...extra.objectives, ...kits.flatMap((k) => k.objectives)];
  const navAreas = kits.flatMap((k) => k.navAreas);
  lap('zones built');

  // ---------------------------------------------------------------- merge buckets -> meshes
  // 1. material folding: materials that differ only in colour / tile / surf share one GPU material; their
  //    colour moves into the vertex tint (UV tiling is already baked into the UVs).
  // 2. adaptive chunks: sparse materials are merged over coarser cells (2x, 4x ... the chunk size) until each
  //    mesh carries enough triangles, which keeps the draw calls of props / signs / lamps low.
  const srcMats = new Map(); // name -> resolved def
  for (const k of kits) for (const [n, m] of k.mats) srcMats.set(n, m);
  const VIS_KEYS = ['set', 'rough', 'metal', 'normal', 'alphaTest', 'opacity', 'blend', 'side', 'emissive', 'emissiveIntensity', 'env', 'decal', 'cast', 'lm', 'lmBump', 'metric', 'prop'];
  const fold = new Map(); // visual key -> canonical name
  const canonOf = new Map(); // material name -> canonical name
  const mats = new Map(); // canonical name -> def
  for (const [n, d] of srcMats) {
    const key = JSON.stringify(VIS_KEYS.map((k) => d[k] ?? null).concat([d.maps ? JSON.stringify(d.maps) : null]));
    let c = fold.get(key);
    if (!c) { c = n; fold.set(key, c); mats.set(c, { ...d, color: '#ffffff', members: [n] }); } else mats.get(c).members.push(n);
    canonOf.set(n, c);
  }
  const colorOf = (n) => { const c = new THREE.Color(srcMats.get(n).color || '#ffffff'); return [c.r, c.g, c.b]; };
  const perMat = new Map();
  for (const k of kits) for (const b of k.buckets.values()) {
    const c = canonOf.get(b.mat);
    if (!perMat.has(c)) perMat.set(c, []);
    perMat.get(c).push(b);
  }
  const MIN_TRIS = +opt('minTris', META.minTrisPerMesh || 2500);
  const merged = new Map(); // key -> { mat, cell, f, list }
  for (const [c, list] of perMat) {
    let f = 1;
    const total = list.reduce((s, b) => s + b.tris, 0);
    const ci0 = Math.min(...list.map((b) => b.chunk[0])), cj0 = Math.min(...list.map((b) => b.chunk[1]));
    const cellOf = (b) => [Math.floor((b.chunk[0] - ci0) / f), Math.floor((b.chunk[1] - cj0) / f)];
    for (;;) {
      const cells = new Set(list.map((b) => cellOf(b).join(',')));
      if (total / cells.size >= MIN_TRIS || cells.size <= 1 || f >= 16) break;
      f *= 2;
    }
    for (const b of list) {
      const cell = cellOf(b);
      const key = c + '@' + f + ':' + cell.join(',');
      if (!merged.has(key)) merged.set(key, { mat: c, cell, f, list: [] });
      merged.get(key).list.push(b);
    }
  }
  const textures = readManifest();
  const meshes = [];
  const threeMats = new Map();
  const matFor = (name) => {
    if (threeMats.has(name)) return threeMats.get(name);
    const d = mats.get(name);
    const m = new THREE.MeshStandardMaterial({ name, color: 0xffffff, roughness: d.rough ?? 0.85, metalness: d.metal ?? 0 });
    // bounce albedo: texture average x the mean member colour
    const avg = d.avg || [0.5, 0.5, 0.5];
    const mc = d.members.map(colorOf).reduce((s, c) => [s[0] + c[0], s[1] + c[1], s[2] + c[2]], [0, 0, 0]).map((v) => v / d.members.length);
    m.userData.lightmap = { albedo: [avg[0] * mc[0], avg[1] * mc[1], avg[2] * mc[2]] };
    if (d.opacity !== undefined && d.opacity < 1) { m.transparent = true; m.opacity = d.opacity; }
    if (d.alphaTest) { m.alphaTest = d.alphaTest; m.userData.lightmap.transmission = 0.5; }
    if (d.blend) m.transparent = true;
    if (d.side === 'double') m.side = THREE.DoubleSide;
    if (d.emissive) { m.emissive = new THREE.Color(d.emissive); m.emissiveIntensity = d.emissiveIntensity ?? 1; }
    threeMats.set(name, m);
    return m;
  };
  for (const [key, { mat: matName, cell, f, list }] of merged) {
    let nv = 0, ni = 0;
    for (const b of list) { nv += b.verts; ni += b.idx.n; }
    if (!ni) continue;
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Uint8Array(nv * 4);
    const idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const b of list) {
      pos.set(b.pos.view(), vo * 3); nrm.set(b.nrm.view(), vo * 3); uv.set(b.uv.view(), vo * 2);
      const C = b.col.view(), mc = colorOf(b.mat);
      for (let i = 0; i < b.verts; i++) {
        col[(vo + i) * 4] = Math.round(C[i * 4] * mc[0]); col[(vo + i) * 4 + 1] = Math.round(C[i * 4 + 1] * mc[1]);
        col[(vo + i) * 4 + 2] = Math.round(C[i * 4 + 2] * mc[2]); col[(vo + i) * 4 + 3] = 255;
      }
      const I = b.idx.view();
      for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo;
      vo += b.verts; io += I.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const d = mats.get(matName);
    const mesh = new THREE.Mesh(g, matFor(matName));
    mesh.name = key.replace(/[@,:]/g, '_');
    mesh.userData.kitMat = matName;
    mesh.userData.chunk = [cell[0], cell[1], f];
    if (!d.lm) mesh.userData.lightmap = { receive: false, castShadow: d.cast !== false };
    else mesh.userData.lightmap = { scale: d.lm, castShadow: d.cast !== false };
    meshes.push(mesh);
  }
  dropHiddenBottoms(meshes);
  const scene = new THREE.Group();
  for (const m of meshes) scene.add(m);
  scene.updateMatrixWorld(true);
  const totalTris = meshes.reduce((s, m) => s + m.geometry.index.count / 3, 0);
  log(`  ${meshes.length} meshes, ${totalTris.toLocaleString()} triangles, ${mats.size} materials`);
  lap('merged');

  // ---------------------------------------------------------------- lightmaps
  fs.mkdirSync(OUT, { recursive: true });
  const hdriEntry = textures.hdri?.[ENV.sky.hdri];
  const hdrFile = hdriEntry ? path.join(ROOT, 'game', 'assets', 'maps', 'common', hdriEntry.files['1k'] || Object.values(hdriEntry.files)[0]) : null;
  let lightmap = null;
  const receivers = meshes.filter((m) => m.userData.lightmap.receive !== false);
  const occluders = meshes.filter((m) => m.userData.lightmap.receive === false && m.userData.lightmap.castShadow !== false);
  const bakedLights = lights.filter((l) => l.bake !== false && !l.realtime && Array.isArray(l.pos));
  // remove stale atlases
  for (const f of fs.readdirSync(OUT)) if (/^lm_\d+(_sun)?\.png$/.test(f)) fs.unlinkSync(path.join(OUT, f));
  if (!flag('nobake') && receivers.length) {
    const { bakeLightmaps } = await import('./lib/lightmap.mjs');
    const fast = flag('fast');
    const res = await bakeLightmaps(receivers, {
      sun: { dir: ENV.sun.dir, color: ENV.sun.color, intensity: ENV.sun.intensity, angle: ENV.sun.angle ?? 1.0 },
      skyHdr: hdrFile, skyIntensity: ENV.sky.envIntensity ?? 1, skyRotation: ((ENV.sky.rotationDeg || 0) * Math.PI) / 180,
      resolution: +opt('res', fast ? 4 : META.lightmapResolution || 8), samples: +opt('samples', fast ? 16 : 64),
      maxAtlas: +opt('atlas', 2048), maxAtlases: +opt('maxAtlases', META.maxAtlases || 0),
      threads: +opt('threads', 6), lights: bakedLights.map((l) => ({ ...l, pos: l.pos })), occluders,
      log: (...a) => log('   [lm]', ...a),
    });
    const meta = res.write(OUT, 'lm');
    lightmap = { ...meta, mode: res.mode, range: res.range, stats: res.stats };
    // the baker may split meshes; collect the final list from the scene
    meshes.length = 0;
    scene.traverse((m) => { if (m.isMesh) meshes.push(m); });
    lap('lightmaps baked');
  }

  // ---------------------------------------------------------------- static.glb
  const matList = [...new Set(meshes.map((m) => m.userData.kitMat))];
  const matIndex = new Map(matList.map((n, i) => [n, i]));
  const images = [], imageIndex = new Map();
  const imageRef = (file) => { if (!imageIndex.has(file)) { imageIndex.set(file, images.length); images.push({ uri: file }); } return imageIndex.get(file); };
  const gltfMaterials = matList.map((n) => {
    const d = mats.get(n);
    const c = new THREE.Color(d.color || '#ffffff');
    const gm = { name: n, pbrMetallicRoughness: { baseColorFactor: [c.r, c.g, c.b, d.opacity ?? 1], roughnessFactor: d.rough ?? 1, metallicFactor: d.metal ?? (d.maps ? 1 : 0) } };
    if (d.maps?.diff) gm.pbrMetallicRoughness.baseColorTexture = { index: imageRef(commonPath(d.maps.diff)) };
    if (d.maps?.arm) { gm.pbrMetallicRoughness.metallicRoughnessTexture = { index: imageRef(commonPath(d.maps.arm)) }; gm.occlusionTexture = { index: imageRef(commonPath(d.maps.arm)) }; }
    if (d.maps?.nor) gm.normalTexture = { index: imageRef(commonPath(d.maps.nor)) };
    if (d.alphaTest) { gm.alphaMode = 'MASK'; gm.alphaCutoff = d.alphaTest; } else if ((d.opacity !== undefined && d.opacity < 1) || d.blend) gm.alphaMode = 'BLEND';
    if (d.side === 'double') gm.doubleSided = true;
    if (d.emissive) { const e = new THREE.Color(d.emissive); gm.emissiveFactor = [e.r, e.g, e.b]; }
    gm.extras = { kit: n };
    return gm;
  });
  const glbMeshes = meshes.map((m) => {
    const g = m.geometry;
    const attrs = {
      POSITION: { array: toF32(g.attributes.position), itemSize: 3 },
      NORMAL: { array: toF32(g.attributes.normal), itemSize: 3 },
      TEXCOORD_0: { array: toF32(g.attributes.uv), itemSize: 2 },
      COLOR_0: { array: toU8Color(g.attributes.color), itemSize: 4, normalized: true },
    };
    if (g.attributes.uv1) attrs.TEXCOORD_1 = { array: toU16Norm(g.attributes.uv1), itemSize: 2, normalized: true };
    return {
      name: m.name, attributes: attrs, indices: g.index.array instanceof Uint32Array ? g.index.array : Uint32Array.from(g.index.array),
      material: matIndex.get(m.userData.kitMat),
      extras: { mat: m.userData.kitMat, lm: m.userData.lightmapAtlas ?? -1, chunk: m.userData.chunk },
    };
  });
  const glb = await writeGLB({
    meshes: glbMeshes, materials: gltfMaterials, images, textures: images.map((_, i) => ({ source: i, sampler: 0 })),
    samplers: images.length ? [{ wrapS: 10497, wrapT: 10497, magFilter: 9729, minFilter: 9987 }] : [], meshopt: flag('meshopt'),
    extras: { map: mapId },
  });
  fs.writeFileSync(path.join(OUT, 'static.glb'), glb);
  lap(`static.glb ${(glb.length / 1e6).toFixed(2)} MB`);

  // ---------------------------------------------------------------- collision
  let cn = 0;
  for (const k of kits) cn += k.col.pos.n;
  const cpos = new Float32Array(cn), csurf = new Uint8Array(cn / 3); // surf is stored per vertex (kit.colTris)
  let co = 0, so = 0;
  for (const k of kits) { cpos.set(k.col.pos.view(), co); co += k.col.pos.n; csurf.set(k.col.surf.view(), so); so += k.col.surf.n; }
  const welded = weld(cpos, csurf);
  const colGlb = await writeGLB({
    meshes: [{ name: 'collision', attributes: { POSITION: { array: welded.pos, itemSize: 3 }, _SURF: { array: welded.surf, itemSize: 1 } }, indices: welded.idx }],
    extras: { map: mapId, surf: 'SURF ids of game/src/world/collision.js' },
  });
  fs.writeFileSync(path.join(OUT, 'collision.glb'), colGlb);
  lap(`collision.glb ${(welded.idx.length / 3).toLocaleString()} tris, ${(colGlb.length / 1e6).toFixed(2)} MB`);

  // ---------------------------------------------------------------- nav
  const cgeo = new THREE.BufferGeometry();
  cgeo.setAttribute('position', new THREE.BufferAttribute(welded.pos, 3));
  cgeo.setIndex(new THREE.BufferAttribute(welded.idx, 1));
  cgeo.computeBoundingBox();
  const bb = cgeo.boundingBox;
  const bounds = META.bounds || [Math.floor(bb.min.x) - 2, Math.floor(bb.min.y) - 2, Math.floor(bb.min.z) - 2, Math.ceil(bb.max.x) + 2, Math.ceil(bb.max.y) + 4, Math.ceil(bb.max.z) + 2];
  const seeds = [...playerSpawns.map((p) => [p[0], p[1], p[2]]), ...spawners.map((s) => s.pos)];
  const nav = bakeNav(cgeo, { bounds, cell: META.navCell || 0.5, seeds, areas: navAreas });
  fs.writeFileSync(path.join(OUT, 'nav.json'), JSON.stringify(nav.json));
  fs.writeFileSync(path.join(OUT, 'nav.bin'), nav.bin());
  lap(`nav ${nav.json.w} x ${nav.json.h} cells, ${nav.json.walkable.toLocaleString()} walkable`);

  // ---------------------------------------------------------------- map.json
  // smaller size variants of each image (tools/map/lib/imgio.mjs): the runtime fetches the smallest file that
  // still covers its quality's texture limit
  const fileInfo = new Map(); // common-relative file -> { size, variants }
  const addInfo = (e) => { for (const [k, file] of Object.entries(e?.maps || {})) if (e.sizes?.[k]) fileInfo.set(file, { size: e.sizes[k], variants: e.variants?.[k] || [] }); };
  for (const e of Object.values(textures.sets || {})) addInfo(e);
  for (const p of Object.values(readPropsManifest())) for (const m of p.materials || []) addInfo(m);
  const matJson = {};
  for (const n of matList) {
    const d = mats.get(n);
    const e = { color: d.color || '#ffffff' };
    if (d.maps) {
      e.maps = Object.fromEntries(Object.entries(d.maps).map(([k, f]) => [k, commonPath(f)]));
      const sizes = {}, variants = {};
      for (const [k, file] of Object.entries(d.maps)) { const i = fileInfo.get(file); if (i) { sizes[k] = i.size; if (i.variants.length) variants[k] = i.variants; } }
      if (Object.keys(sizes).length) e.sizes = sizes;
      if (Object.keys(variants).length) e.variants = variants;
    }
    for (const k of ['rough', 'metal', 'normal', 'alphaTest', 'opacity', 'blend', 'side', 'emissive', 'emissiveIntensity', 'env', 'decal', 'lmBump', 'surf']) if (d[k] !== undefined) e[k] = d[k];
    if (d.members.length > 1) e.members = d.members;
    e.lm = d.lm || 0;
    if (d.cast === false) e.cast = false;
    if (d.prop) e.prop = d.prop;
    if (d.maps?.diff && textures.sets?.[d.set]?.resName) e.res = textures.sets[d.set].resName;
    matJson[n] = e;
  }
  const hdriFiles = hdriEntry ? Object.fromEntries(Object.entries(hdriEntry.files).map(([r, f]) => [r, commonPath(f)])) : {};
  const stats = chunkStats(meshes, chunk);
  const def = {
    id: mapId, name: META.name || mapId, nameEn: META.nameEn, version: 1, built: new Date().toISOString(),
    bounds, killY: META.killY ?? bounds[1] - 5, chunk,
    sun: { dir: ENV.sun.dir, color: ENV.sun.color, intensity: ENV.sun.intensity, shadow: ENV.sun.shadow || { mapSize: 2048, extent: 45 } },
    env: { hdri: ENV.sky.hdri, files: hdriFiles, rotation: ((ENV.sky.rotationDeg || 0) * Math.PI) / 180, intensity: ENV.sky.envIntensity ?? 1, backgroundIntensity: ENV.sky.backgroundIntensity ?? 1, backgroundBlur: ENV.sky.backgroundBlur ?? 0, ...(ENV.sky.tint ? { tint: ENV.sky.tint } : {}) },
    fog: { color: ENV.fog.color, density: ENV.fog.density }, exposure: ENV.exposure ?? 1, grade: ENV.grade || null, preview: META.preview || null,
    playerSpawns, zones: zoneDefs, spawners, buy, supply, bossArenas, lights, objectives,
    static: { file: 'static.glb', meshopt: flag('meshopt') },
    collision: { file: 'collision.glb' },
    nav: { json: 'nav.json', bin: 'nav.bin' },
    lightmap: lightmap ? { encoding: lightmap.encoding, range: lightmap.range, mode: lightmap.mode, uv: 'uv1', atlases: lightmap.atlases } : null,
    materials: matJson,
    stats: { meshes: meshes.length, triangles: totalTris, collisionTriangles: welded.idx.length / 3, ...stats, zones: zones.map((z) => z.id), lightmap: lightmap?.stats ? { texels: lightmap.stats.texels, atlases: lightmap.stats.atlases, seconds: Math.round(lightmap.stats.seconds) } : null },
  };
  fs.writeFileSync(path.join(OUT, 'map.json'), JSON.stringify(def, null, 1));
  log(`  worst view estimate: ${stats.maxDrawCalls} draw calls, ${stats.maxTriangles.toLocaleString()} triangles (chunks within ${stats.viewRadius} m)`);
  lap(`done -> ${path.relative(ROOT, OUT)}`);
  log(`  peak memory ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB (main process; bake workers share its buffers)`);
}

/**
 * Removes downward-facing triangles that rest on an upward-facing surface (bottoms of boxes, props, sandbags,
 * containers standing on the ground): invisible, but they would cost lightmap texels and shadow-map fill.
 */
function dropHiddenBottoms(meshes) {
  const up = [];
  for (const m of meshes) {
    const g = m.geometry, P = g.attributes.position.array, I = g.index.array;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const ny = uz * vx - ux * vz, l = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
      if (l > 1e-9 && ny / l > 0.95) up.push(P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2]);
    }
  }
  if (!up.length) return;
  const ug = new THREE.BufferGeometry();
  ug.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(up), 3));
  const bvh = new MeshBVH(ug);
  const ray = new THREE.Ray(), dir = new THREE.Vector3(0, -1, 0);
  let dropped = 0;
  for (const m of meshes) {
    const g = m.geometry, P = g.attributes.position.array, I = g.index.array;
    const keep = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const ny = uz * vx - ux * vz, l = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
      let hidden = false;
      if (l > 1e-9 && ny / l < -0.95) {
        hidden = true;
        // centroid and the three corners pulled 10 % towards it must all sit on an up-facing surface within 3 cm
        const cx = (P[a] + P[b] + P[c]) / 3, cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
        for (const k of [-1, a, b, c]) {
          const x = k < 0 ? cx : P[k] * 0.9 + cx * 0.1, y = k < 0 ? cy : P[k + 1] * 0.9 + cy * 0.1, z = k < 0 ? cz : P[k + 2] * 0.9 + cz * 0.1;
          ray.origin.set(x, y + 0.005, z); ray.direction.copy(dir);
          const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, 0.04);
          if (!hit) { hidden = false; break; }
        }
      }
      if (hidden) dropped++; else keep.push(I[t], I[t + 1], I[t + 2]);
    }
    if (keep.length !== I.length) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(keep), 1));
  }
  if (dropped) console.log(`  dropped ${dropped.toLocaleString()} hidden bottom triangles`);
}

function commonPath(f) { return '../common/' + f.replace(/\\/g, '/'); }
function toF32(attr) { return attr.array instanceof Float32Array && !attr.normalized ? attr.array : Float32Array.from({ length: attr.count * attr.itemSize }, (_, i) => attr.getComponent((i / attr.itemSize) | 0, i % attr.itemSize)); }
function toU8Color(attr) {
  if (attr.array instanceof Uint8Array && attr.normalized && attr.itemSize === 4) return attr.array;
  const out = new Uint8Array(attr.count * 4);
  for (let i = 0; i < attr.count; i++) for (let c = 0; c < 4; c++) out[i * 4 + c] = c < attr.itemSize ? Math.round(Math.min(1, Math.max(0, attr.getComponent(i, c))) * 255) : 255;
  return out;
}
function toU16Norm(attr) {
  const out = new Uint16Array(attr.count * 2);
  for (let i = 0; i < attr.count; i++) for (let c = 0; c < 2; c++) out[i * 2 + c] = Math.round(Math.min(1, Math.max(0, attr.getComponent(i, c))) * 65535);
  return out;
}
/** Welds a triangle soup (positions per corner, surf per corner) into indexed geometry. */
function weld(pos, surf) {
  const map = new Map();
  const P = [], S = [], I = new Uint32Array(pos.length / 3);
  for (let v = 0; v < pos.length / 3; v++) {
    const key = Math.round(pos[v * 3] * 1000) + ',' + Math.round(pos[v * 3 + 1] * 1000) + ',' + Math.round(pos[v * 3 + 2] * 1000) + ',' + surf[v];
    let id = map.get(key);
    if (id === undefined) { id = P.length / 3; map.set(key, id); P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); S.push(surf[v]); }
    I[v] = id;
  }
  // drop degenerate triangles
  const out = [];
  for (let t = 0; t < I.length; t += 3) if (I[t] !== I[t + 1] && I[t + 1] !== I[t + 2] && I[t] !== I[t + 2]) out.push(I[t], I[t + 1], I[t + 2]);
  return { pos: Float32Array.from(P), surf: Uint8Array.from(S), idx: Uint32Array.from(out) };
}
/** Worst-case draw calls / triangles: meshes whose bounds reach within R of any chunk centre (no frustum culling). */
function chunkStats(meshes, chunk) {
  const R = 100;
  const boxes = meshes.map((m) => { m.geometry.computeBoundingBox(); return { b: m.geometry.boundingBox, tris: m.geometry.index.count / 3 }; });
  const centres = new Set();
  for (const { b } of boxes) for (let x = Math.floor(b.min.x / chunk); x <= Math.floor(b.max.x / chunk); x++) for (let z = Math.floor(b.min.z / chunk); z <= Math.floor(b.max.z / chunk); z++) centres.add(x + ',' + z);
  let maxCalls = 0, maxTris = 0;
  for (const c of centres) {
    const [cx, cz] = c.split(',').map((v) => (+v + 0.5) * chunk);
    let calls = 0, tris = 0;
    for (const { b, tris: t } of boxes) {
      const dx = Math.max(b.min.x - cx, 0, cx - b.max.x), dz = Math.max(b.min.z - cz, 0, cz - b.max.z);
      if (dx * dx + dz * dz <= R * R) { calls++; tris += t; }
    }
    maxCalls = Math.max(maxCalls, calls); maxTris = Math.max(maxTris, tris);
  }
  return { chunks: centres.size, maxDrawCalls: maxCalls, maxTriangles: maxTris, viewRadius: R };
}
function mergeDeep(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? mergeDeep(a[k], v) : v;
  return out;
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
