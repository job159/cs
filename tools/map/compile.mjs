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
    kits.push(kit);
    for (const k of Object.keys(extra)) {
      if (!res[k]) continue;
      if (Array.isArray(extra[k])) extra[k].push(...res[k]); else Object.assign(extra[k], res[k]);
    }
    const s = kit.stats();
    log(`  zone ${z.id.padEnd(12)} ${s.tris.toLocaleString()} tris in ${s.buckets} buckets, ${s.colTris.toLocaleString()} collision tris, ${s.lights} lights, ${s.spawners} spawners (${((performance.now() - t) / 1000).toFixed(1)} s)`);
  }
  // global data from the layout (zones may also add their own)
  const gather = (k, layoutKey) => [...(layout[layoutKey] || []), ...extra[k], ...kits.flatMap((kit) => kit[k === 'buy' ? 'buyZones' : k === 'supply' ? 'supplies' : k] || [])];
  const playerSpawns = gather('playerSpawns', 'PLAYER_SPAWNS');
  const spawners = gather('spawners', 'SPAWNERS');
  const lights = gather('lights', 'LIGHTS');
  const buy = gather('buy', 'BUY');
  const supply = gather('supply', 'SUPPLY');
  const zoneDefs = [...(layout.ZONES || []).map((z) => ({ id: z.id, name: z.name, nameEn: z.nameEn, polygon: z.polygon, ...(z.floorY !== undefined ? { floorY: z.floorY } : {}) })), ...extra.zones, ...kits.flatMap((k) => k.zones)];
  const bossArenas = { ...(layout.BOSS_ARENAS || {}), ...extra.bossArenas };
  for (const k of kits) Object.assign(bossArenas, k.bossArenas);
  const objectives = [...(layout.OBJECTIVES || []), ...extra.objectives, ...kits.flatMap((k) => k.objectives)];
  const navAreas = kits.flatMap((k) => k.navAreas);
  lap('zones built');

  // ---------------------------------------------------------------- merge buckets -> meshes
  const mats = new Map(); // name -> resolved def
  for (const k of kits) for (const [n, m] of k.mats) mats.set(n, m);
  const merged = new Map();
  for (const k of kits) for (const [key, b] of k.buckets) {
    if (!merged.has(key)) merged.set(key, []);
    merged.get(key).push(b);
  }
  const textures = readManifest();
  const meshes = [];
  const threeMats = new Map();
  const matFor = (name) => {
    if (threeMats.has(name)) return threeMats.get(name);
    const d = mats.get(name);
    const col = new THREE.Color(d.color || '#ffffff');
    const m = new THREE.MeshStandardMaterial({ name, color: col, roughness: d.rough ?? 0.85, metalness: d.metal ?? 0 });
    const avg = d.avg || [0.5, 0.5, 0.5];
    m.userData.lightmap = { albedo: [avg[0] * col.r, avg[1] * col.g, avg[2] * col.b] };
    if (d.opacity !== undefined && d.opacity < 1) { m.transparent = true; m.opacity = d.opacity; }
    if (d.alphaTest) { m.alphaTest = d.alphaTest; m.userData.lightmap.transmission = 0.5; }
    if (d.side === 'double') m.side = THREE.DoubleSide;
    if (d.emissive) { m.emissive = new THREE.Color(d.emissive); m.emissiveIntensity = d.emissiveIntensity ?? 1; }
    threeMats.set(name, m);
    return m;
  };
  for (const [key, list] of merged) {
    let nv = 0, ni = 0;
    for (const b of list) { nv += b.verts; ni += b.idx.n; }
    if (!ni) continue;
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Uint8Array(nv * 4);
    const idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const b of list) {
      pos.set(b.pos.view(), vo * 3); nrm.set(b.nrm.view(), vo * 3); uv.set(b.uv.view(), vo * 2); col.set(b.col.view(), vo * 4);
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
    const matName = list[0].mat;
    const d = mats.get(matName);
    const mesh = new THREE.Mesh(g, matFor(matName));
    mesh.name = key.replace(/[@,]/g, '_');
    mesh.userData.kitMat = matName;
    mesh.userData.chunk = list[0].chunk;
    if (!d.lm) mesh.userData.lightmap = { receive: false, castShadow: d.cast !== false };
    else mesh.userData.lightmap = { scale: d.lm, castShadow: d.cast !== false };
    meshes.push(mesh);
  }
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
  const bakedLights = lights.filter((l) => l.bake !== false && !l.realtime);
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
    if (d.alphaTest) { gm.alphaMode = 'MASK'; gm.alphaCutoff = d.alphaTest; } else if (d.opacity !== undefined && d.opacity < 1) gm.alphaMode = 'BLEND';
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
  const matJson = {};
  for (const n of matList) {
    const d = mats.get(n);
    const e = { color: d.color || '#ffffff' };
    if (d.maps) e.maps = Object.fromEntries(Object.entries(d.maps).map(([k, f]) => [k, commonPath(f)]));
    for (const k of ['rough', 'metal', 'normal', 'alphaTest', 'opacity', 'side', 'emissive', 'emissiveIntensity', 'env', 'decal', 'lmBump', 'surf']) if (d[k] !== undefined) e[k] = d[k];
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
    env: { hdri: ENV.sky.hdri, files: hdriFiles, rotation: ((ENV.sky.rotationDeg || 0) * Math.PI) / 180, intensity: ENV.sky.envIntensity ?? 1, backgroundIntensity: ENV.sky.backgroundIntensity ?? 1, backgroundBlur: ENV.sky.backgroundBlur ?? 0 },
    fog: ENV.fog, exposure: ENV.exposure ?? 1, grade: ENV.grade || null,
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
  void readPropsManifest;
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
/** Worst-case draw calls / triangles of the chunks around any chunk (no frustum culling: upper bound). */
function chunkStats(meshes, chunk) {
  const R = 100;
  const byChunk = new Map();
  for (const m of meshes) {
    const c = m.userData.chunk || [0, 0];
    const k = c.join(',');
    if (!byChunk.has(k)) byChunk.set(k, { c, calls: 0, tris: 0 });
    const e = byChunk.get(k);
    e.calls++; e.tris += m.geometry.index.count / 3;
  }
  let maxCalls = 0, maxTris = 0;
  const list = [...byChunk.values()];
  for (const a of list) {
    let calls = 0, tris = 0;
    for (const b of list) if (Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]) * chunk <= R) { calls += b.calls; tris += b.tris; }
    maxCalls = Math.max(maxCalls, calls); maxTris = Math.max(maxTris, tris);
  }
  return { chunks: list.length, maxDrawCalls: maxCalls, maxTriangles: maxTris, viewRadius: R };
}
function mergeDeep(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? mergeDeep(a[k], v) : v;
  return out;
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
