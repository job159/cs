// Map package loader (compiled by tools/map/compile.mjs into assets/maps/<id>/):
//   map.json        definition: materials, env (HDRI), sun, fog, exposure, spawns, spawners, zones, lights, ...
//   static.glb      merged visual meshes (per material x chunk) with world-metric UVs, lightmap UVs (uv1), tints
//   collision.glb   collision soup with per-vertex SURF ids
//   nav.json/.bin   NavGrid (world/nav.js)
//   lm_<i>.png, lm_<i>_sun.png   RGBM-sqrt irradiance atlases + baked sun visibility
//
// Lighting model of static surfaces (matches the baker, tools/map/lib/lightmap.mjs):
//   diffuse = albedo/PI * (lightmap sky + bounce + baked lights)   (IBL diffuse is replaced by the lightmap)
//           + realtime sun * baked sun mask * realtime shadow map (near the player)
//           + realtime point lights (<= 6: fires, flares, flickering lamps)
//   specular = IBL (PMREM of the HDRI) occluded by the lightmap, + sun + point lights.
// Dynamic objects (players, zombies, props spawned at runtime) use IBL + sun + shadows.
//
//   import { buildPackageMap } from './mapPackage.js';
//   export const build = (ctx) => buildPackageMap('losttown', ctx);
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { parseGLB, decodeMeshopt, readScene, normScale } from './glb.js';
import { NavGrid } from './nav.js';

const BASE = 'assets/maps/';

// Max texture edge per quality (diffuse, normal, arm). Files ship at 1k (2k hero sets) plus smaller size variants
// (x_diff@1k.jpg, x_diff@512.jpg; map.json materials[].variants): the loader fetches the smallest file that covers
// the limit, and the browser downsizes the rest while decoding, so download, decode time and GPU memory all
// follow the quality setting.
export const TEX_LIMITS = {
  low: { diff: 512, nor: 256, arm: 256, prop: 256, aniso: 2 },
  medium: { diff: 1024, nor: 512, arm: 512, prop: 512, aniso: 4 },
  high: { diff: 1024, nor: 1024, arm: 512, prop: 1024, aniso: 8 },
  ultra: { diff: 2048, nor: 2048, arm: 1024, prop: 1024, aniso: 16 },
};
const MAX_POINT_LIGHTS = { low: 2, medium: 4, high: 6, ultra: 6 };

// ------------------------------------------------------------------------------------------ fetch / images
const texCache = new Map();   // url|size|kind -> Promise<Texture>
const jsonCache = new Map();

async function fetchBuf(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.arrayBuffer();
}
async function fetchJSON(url) {
  if (!jsonCache.has(url)) jsonCache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); }));
  return jsonCache.get(url);
}

/** Decodes an image into an ImageBitmap no larger than maxSize (keeps aspect), optionally flipped. */
async function decodeImage(url, maxSize, flip) {
  const blob = await (await fetch(url)).blob();
  if (typeof createImageBitmap === 'function') {
    const opts = { premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: flip ? 'flipY' : 'from-image' };
    let bmp;
    try { bmp = await createImageBitmap(blob, opts); } catch { bmp = await createImageBitmap(blob, { ...opts, imageOrientation: flip ? 'flipY' : 'none' }); }
    if (maxSize && Math.max(bmp.width, bmp.height) > maxSize) {
      // downsize the decoded bitmap (no second JPEG decode); orientation is already applied
      const s = maxSize / Math.max(bmp.width, bmp.height);
      const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
      let small;
      try { small = await createImageBitmap(bmp, { premultiplyAlpha: 'none', resizeWidth: w, resizeHeight: h, resizeQuality: 'high' }); } catch { small = null; }
      if (small) { bmp.close?.(); bmp = small; }
    }
    return { image: bmp, preFlipped: true };
  }
  // fallback: HTMLImageElement (three flips on upload)
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  return { image: img, preFlipped: false };
}

/**
 * Cached texture. kind: 'color' (sRGB, mipmaps), 'data' (linear, mipmaps), 'lightmap' (linear, no flip).
 */
export function loadMapTexture(url, { kind = 'color', maxSize = 0, aniso = 4, repeat = true } = {}) {
  const key = `${url}|${maxSize}|${kind}`;
  if (!texCache.has(key)) {
    texCache.set(key, (async () => {
      const lm = kind === 'lightmap';
      const { image, preFlipped } = await decodeImage(url, maxSize, !lm);
      const t = new THREE.Texture(image);
      t.flipY = lm ? false : !preFlipped;
      t.colorSpace = kind === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = repeat && !lm ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      t.anisotropy = lm ? 1 : aniso;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.premultiplyAlpha = false;
      t.needsUpdate = true;
      t.name = url.split('/').pop();
      return t;
    })().catch((e) => { texCache.delete(key); throw e; }));
  }
  return texCache.get(key);
}

// ------------------------------------------------------------------------------------------ shader patch
// Shared by every lightmapped static material (one program per feature combination).
const LM_PARS = /* glsl */`
uniform sampler2D lmSunMask;
uniform float lmRange;
uniform float lmBump;
uniform float lmSpecRef;
`;
const LM_MAPS = /* glsl */`
#if defined( RE_IndirectDiffuse )
	vec4 lmT = texture2D( lightMap, vLightMapUv );
	vec3 lmQ = lmT.rgb * lmT.a;
	vec3 lmE = lmRange * lmQ * lmQ * lightMapIntensity;
	// normal-map relief in baked light: compare the bumped and the geometric normal against the sky (up)
	vec3 lmUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
	lmE *= clamp( 1.0 + lmBump * ( dot( geometryNormal, lmUp ) - dot( nonPerturbedNormal, lmUp ) ), 0.5, 1.5 );
	irradiance += lmE;
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	// specular occlusion from the baked sky light (interiors, alleys, under cars do not mirror the open sky)
	float lmLum = dot( lmE, vec3( 0.2126, 0.7152, 0.0722 ) ) + lmSunVis * 0.25 * lmSpecRef;
	radiance += iblRadiance * clamp( lmLum / max( 1e-4, lmSpecRef ), 0.0, 1.0 );
#endif
`;

function patchLightmapped(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.lmSunMask = material.userData.lmUniforms.lmSunMask;
    shader.uniforms.lmRange = material.userData.lmUniforms.lmRange;
    shader.uniforms.lmBump = material.userData.lmUniforms.lmBump;
    shader.uniforms.lmSpecRef = material.userData.lmUniforms.lmSpecRef;
    let fs = shader.fragmentShader;
    fs = fs.replace('#include <lightmap_pars_fragment>', '#include <lightmap_pars_fragment>\n' + LM_PARS);
    const begin = THREE.ShaderChunk.lights_fragment_begin.replace(
      'getDirectionalLightInfo( directionalLight, directLight );',
      'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= lmSunVis;');
    fs = fs.replace('#include <lights_fragment_begin>', 'float lmSunVis = texture2D( lmSunMask, vLightMapUv ).r;\n' + begin);
    fs = fs.replace('#include <lights_fragment_maps>', LM_MAPS);
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => 'cf-lightmap-v1';
}

// ------------------------------------------------------------------------------------------ materials
function srgb(hex) { return new THREE.Color(hex || '#ffffff'); }

/**
 * File of a material map for a texture limit: the smallest shipped size variant that is still >= maxSize
 * ("a/x_diff.jpg" + 1024 -> "a/x_diff@1k.jpg"), else the full-size file. Same naming as tools/map/lib/imgio.mjs.
 */
export function variantFile(file, sizes, maxSize) {
  if (!maxSize || !sizes?.length) return file;
  const fit = sizes.filter((v) => v >= maxSize).sort((a, b) => a - b)[0];
  return fit ? file.replace(/(\.\w+)$/, `@${fit >= 1024 ? fit / 1024 + 'k' : fit}$1`) : file;
}

/** Builds the base (atlas-independent) material of a map.json material entry. */
async function makeMaterial(name, d, mapDir, q) {
  const lim = TEX_LIMITS[q] || TEX_LIMITS.high;
  const isProp = !!d.prop;
  const p = {
    name, color: srgb(d.color), vertexColors: true,
    roughness: d.rough ?? 1, metalness: d.metal ?? (d.maps?.arm ? 1 : 0),
  };
  const jobs = [];
  const tex = (k, kind, maxSize, apply) => {
    if (!d.maps?.[k]) return;
    // a file at or below the limit is used as is (maxSize 0 = no resize step)
    const file = variantFile(d.maps[k], d.variants?.[k], maxSize);
    jobs.push(loadMapTexture(mapDir + file, { kind, maxSize, aniso: lim.aniso }).then(apply));
  };
  tex('diff', 'color', isProp ? lim.prop : lim.diff, (t) => { p.map = t; });
  tex('nor', 'data', isProp ? lim.prop : lim.nor, (t) => { p.normalMap = t; });
  tex('arm', 'data', isProp ? Math.min(lim.prop, lim.arm * 2) : lim.arm, (t) => { p.aoMap = t; p.roughnessMap = t; p.metalnessMap = t; });
  await Promise.all(jobs);
  if (!d.maps?.arm && d.metal === undefined) p.metalness = 0;
  const m = new THREE.MeshStandardMaterial(p);
  if (m.normalMap && d.normal !== undefined) m.normalScale.set(d.normal, d.normal);
  if (d.alphaTest) { m.alphaTest = d.alphaTest; m.alphaToCoverage = false; }
  if (d.opacity !== undefined && d.opacity < 1) { m.transparent = true; m.opacity = d.opacity; m.depthWrite = false; }
  if (d.blend) { m.transparent = true; m.depthWrite = false; }
  if (d.side === 'double') m.side = THREE.DoubleSide;
  if (d.emissive) { m.emissive = srgb(d.emissive); m.emissiveIntensity = d.emissiveIntensity ?? 1; }
  if (d.env !== undefined) m.envMapIntensity = d.env;
  if (d.decal) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; }
  m.userData.def = d;
  return m;
}

// ------------------------------------------------------------------------------------------ geometry
function toGeometry(prim) {
  const g = new THREE.BufferGeometry();
  for (const [name, acc] of Object.entries(prim.attributes)) {
    if (name === 'tangent') continue;
    let arr = acc.array, normalized = acc.normalized;
    if (name === 'surf') { arr = Float32Array.from(arr); normalized = false; }
    g.setAttribute(name, new THREE.BufferAttribute(arr, acc.itemSize, normalized));
  }
  if (prim.index) g.setIndex(new THREE.BufferAttribute(prim.index.array, 1));
  return g;
}
async function loadGLBDoc(url) {
  const doc = parseGLB(await fetchBuf(url));
  if (doc.json.extensionsUsed?.includes('EXT_meshopt_compression')) await decodeMeshopt(doc, MeshoptDecoder);
  return doc;
}
void normScale;

// ------------------------------------------------------------------------------------------ main
/**
 * Loads assets/maps/<id>/ and returns what World.load expects:
 *   { root, collisionGeometry, playerSpawns: Vector3[], zombieSpawns: Vector3[], bounds: Box3, killY, update,
 *     nav: NavGrid, def: map.json, ...map.json fields (spawners, buy, supply, bossArenas, zones, lights...) }
 * ctx: { game, world, scene, root, onProgress?(0..1) }
 */
export async function buildPackageMap(id, ctx) {
  const mapDir = BASE + id + '/';
  const game = ctx.game;
  const renderer = game?.renderer;
  const q = renderer?.qualityName || 'high';
  const scene = ctx.scene || game?.scene;
  const progress = ctx.onProgress || (() => {});
  const T0 = performance.now();
  const marks = [];
  const mark = (k) => marks.push(k + ' ' + ((performance.now() - T0) / 1000).toFixed(2));
  const def = await fetchJSON(mapDir + 'map.json');
  const root = new THREE.Group();
  root.name = 'map:' + id;
  progress(0.05);

  // ---- parallel downloads
  const staticP = loadGLBDoc(mapDir + (def.static?.file || 'static.glb'));
  const colP = loadGLBDoc(mapDir + (def.collision?.file || 'collision.glb'));
  const navP = def.nav ? Promise.all([fetchJSON(mapDir + def.nav.json), fetchBuf(mapDir + def.nav.bin)]) : Promise.resolve(null);
  const lmP = def.lightmap ? Promise.all(def.lightmap.atlases.map((a) => Promise.all([
    loadMapTexture(mapDir + a.rgbm, { kind: 'lightmap' }), loadMapTexture(mapDir + a.sun, { kind: 'lightmap' }),
  ]))) : Promise.resolve([]);
  const hdrUrl = def.env?.files ? mapDir + (def.env.files['1k'] || Object.values(def.env.files)[0]) : null;
  const bgUrl = def.env?.files ? mapDir + ((q === 'high' || q === 'ultra') && def.env.files['2k'] ? def.env.files['2k'] : (def.env.files['1k'] || Object.values(def.env.files)[0])) : null;
  const envP = hdrUrl ? new HDRLoader().loadAsync(hdrUrl) : Promise.resolve(null);
  const bgP = bgUrl && bgUrl !== hdrUrl ? new HDRLoader().loadAsync(bgUrl) : envP;
  const matEntries = Object.entries(def.materials || {});
  const baseMats = new Map();
  const matsP = Promise.all(matEntries.map(async ([name, d]) => baseMats.set(name, await makeMaterial(name, d, mapDir, q))));

  // ---- environment
  let [envTex, bgTex] = await Promise.all([envP, bgP]);
  mark('hdr');
  let skyRef = 1;
  if (envTex && renderer && scene) {
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer.gl);
    const envRT = pmrem.fromEquirectangular(envTex);
    pmrem.dispose();
    scene.environment = envRT.texture;
    scene.environmentIntensity = def.env.intensity ?? 1;
    const rot = def.env.rotation || 0;
    scene.environmentRotation.set(0, rot, 0);
    if (bgTex && def.env.tint) tintHDR(bgTex === envTex ? (bgTex = cloneHDR(bgTex)) : bgTex, srgb(def.env.tint));
    if (bgTex) {
      bgTex.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = bgTex;
      scene.backgroundIntensity = def.env.backgroundIntensity ?? 1;
      scene.backgroundBlurriness = def.env.backgroundBlur ?? 0;
      scene.backgroundRotation.set(0, rot, 0);
    }
    skyRef = skyIrradiance(envTex) * (def.env.intensity ?? 1);
  }
  if (scene && def.fog) {
    // fog colour 'auto' = the sky's horizon colour (x background intensity) so distant geometry melts into the sky
    const fc = def.fog.color === 'auto' && envTex ? horizonColor(envTex).multiplyScalar(def.env.backgroundIntensity ?? 1) : srgb(def.fog.color === 'auto' ? '#8f8b86' : def.fog.color);
    scene.fog = new THREE.FogExp2(fc, def.fog.density);
  }
  if (renderer && def.exposure !== undefined) renderer.post.exposure = def.exposure;
  progress(0.25);
  mark('env');

  // ---- sun
  const sunDir = new THREE.Vector3(...(def.sun?.dir || [0.4, 0.8, 0.3])).normalize();
  const sun = new THREE.DirectionalLight(srgb(def.sun?.color || '#ffffff'), def.sun?.intensity ?? 2);
  sun.name = 'sun';
  const shadowSize = renderer?.q?.shadows || 0;
  const extent = def.sun?.shadow?.extent ?? 45;
  if (shadowSize > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -extent; sc.right = sc.top = extent; sc.near = 1; sc.far = 260;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    sc.updateProjectionMatrix();
  }
  root.add(sun, sun.target);

  // ---- static meshes
  const [doc, lmTex] = await Promise.all([staticP, lmP, matsP]);
  mark('glb+textures');
  progress(0.7);
  const range = def.lightmap?.range ?? 8;
  const lmMats = new Map(); // name|atlas -> material
  const lmUniforms = { lmRange: { value: range }, lmSpecRef: { value: Math.max(0.05, skyRef) } };
  const matForMesh = (name, atlas) => {
    const base = baseMats.get(name);
    if (!base) return new THREE.MeshStandardMaterial({ color: 0xff00ff });
    if (atlas < 0 || !lmTex[atlas]) return base;
    const key = name + '|' + atlas;
    if (!lmMats.has(key)) {
      const m = base.clone();
      m.userData = { ...base.userData };
      m.lightMap = lmTex[atlas][0];
      m.lightMap.channel = 1;
      m.lightMapIntensity = 1;
      m.userData.lmUniforms = {
        lmSunMask: { value: lmTex[atlas][1] }, lmRange: lmUniforms.lmRange, lmSpecRef: lmUniforms.lmSpecRef,
        lmBump: { value: base.userData.def?.lmBump ?? 0.35 },
      };
      patchLightmapped(m);
      lmMats.set(key, m);
    }
    return lmMats.get(key);
  };
  const staticMeshes = [];
  for (const inst of readScene(doc)) {
    const ex = inst.extras || {};
    for (const prim of inst.primitives) {
      const g = toGeometry(prim);
      g.computeBoundingBox(); g.computeBoundingSphere();
      if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(g.attributes.position.count * 4).fill(255), 4, true));
      const md = def.materials?.[ex.mat] || {};
      const mesh = new THREE.Mesh(g, matForMesh(ex.mat, ex.lm ?? -1));
      mesh.name = inst.name;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = md.cast !== false && !md.decal && !md.blend && !(md.opacity < 1);
      mesh.receiveShadow = true;
      mesh.userData.static = true;
      mesh.userData.surf = md.surf;
      if (md.opacity !== undefined && md.opacity < 1) mesh.renderOrder = 1;
      if (md.decal) mesh.renderOrder = 0;
      root.add(mesh);
      staticMeshes.push(mesh);
    }
  }
  root.updateMatrixWorld(true);

  // ---- collision
  const cdoc = await colP;
  // indexed soup; vertices are only shared between triangles of the same SURF (welded per surf at compile
  // time), so Collision's per-vertex lookup surf[face.a] is exact
  const collisionGeometry = toGeometry(readScene(cdoc)[0].primitives[0]);

  // ---- nav
  let nav = null;
  const navData = await navP;
  if (navData) {
    nav = NavGrid.fromPackage(navData[0], navData[1]);
    if (ctx.world) ctx.world.nav = nav;
  }
  progress(0.9);
  mark('collision+nav');

  // ---- realtime point lights (pool of <= 6, nearest realtime lights to the camera)
  // without a bake (--nobake previews) the baked lamps join the pool too, except soft interior fills (IBL is unoccluded there)
  const rtLights = (def.lights || []).filter((l) => l.realtime || (!def.lightmap && l.bake !== false && l.name !== 'fill'));
  const poolN = Math.min(MAX_POINT_LIGHTS[q] ?? 4, rtLights.length);
  const pool = [];
  for (let i = 0; i < poolN; i++) {
    const pl = new THREE.PointLight(0xffffff, 0, 10, 2);
    pl.castShadow = false;
    root.add(pl);
    pool.push(pl);
  }
  const lightState = rtLights.map((l, i) => ({ l, pos: new THREE.Vector3(...l.pos), color: srgb(l.color), seed: i * 17.31, k: 1 }));

  // ---- update: shadow follow + light pool + flicker
  const tmp = new THREE.Vector3(), lsx = new THREE.Vector3(), lsy = new THREE.Vector3();
  let poolTimer = 0;
  const update = (dt, t) => {
    const cam = game?.camera;
    const center = game?.player?.pos || cam?.position || tmp.set(0, 0, 0);
    if (sun.castShadow) {
      // texel-snapped follow: snap the centre in light space so shadow edges do not swim
      const texel = (2 * extent) / sun.shadow.mapSize.x;
      lsx.set(0, 1, 0).cross(sunDir).normalize();
      if (lsx.lengthSq() < 1e-6) lsx.set(1, 0, 0);
      lsy.copy(sunDir).cross(lsx).normalize();
      const cx = Math.round(center.dot(lsx) / texel) * texel, cy = Math.round(center.dot(lsy) / texel) * texel, cz = center.dot(sunDir);
      tmp.copy(lsx).multiplyScalar(cx).addScaledVector(lsy, cy).addScaledVector(sunDir, cz);
      sun.target.position.copy(tmp);
      sun.position.copy(tmp).addScaledVector(sunDir, 120);
      sun.target.updateMatrixWorld();
      sun.updateMatrixWorld();
    } else {
      sun.position.copy(sunDir).multiplyScalar(100);
    }
    // pick the nearest realtime lights every 0.25 s
    poolTimer -= dt;
    if (pool.length && poolTimer <= 0) {
      poolTimer = 0.25;
      const p = cam?.position || center;
      const order = lightState.map((s, i) => [s.pos.distanceToSquared(p) / Math.max(1, (s.l.range || 10) ** 2), i]).sort((a, b) => a[0] - b[0]);
      pool.forEach((pl, k) => { pl.userData.src = order[k] ? lightState[order[k][1]] : null; });
    }
    for (const pl of pool) {
      const s = pl.userData.src;
      if (!s) { pl.intensity = 0; continue; }
      pl.position.copy(s.pos);
      pl.color.copy(s.color);
      pl.distance = s.l.range || 10;
      pl.decay = s.l.decay ?? 2;
      pl.intensity = (s.l.intensity ?? 10) * flicker(s.l.flicker, t, s.seed);
    }
  };

  const bounds = new THREE.Box3(new THREE.Vector3(def.bounds[0], def.bounds[1], def.bounds[2]), new THREE.Vector3(def.bounds[3], def.bounds[4], def.bounds[5]));
  const playerSpawns = (def.playerSpawns?.length ? def.playerSpawns : [[0, 0.05, 0, 0]]).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const zombieSpawns = (def.spawners || []).map((s) => new THREE.Vector3(...s.pos));
  progress(1);
  console.info(`[map] ${id} loaded: ${marks.join(', ')} s; ${staticMeshes.length} meshes, ${baseMats.size} materials, quality ${q}`);
  return {
    ...def, def,
    root, collisionGeometry, playerSpawns, playerSpawnYaws: (def.playerSpawns || []).map((p) => p[3] || 0), zombieSpawns,
    bounds, killY: def.killY ?? -20, update, nav, sun,
    stats: { ...def.stats, drawables: staticMeshes.length, lightmapMaterials: lmMats.size },
  };
}

/**
 * Flicker multiplier (1 = steady). spec: 'fire' | { kind, speed (x), amount (0..1 depth) }.
 * kinds: fire, buzz / fluorescent (dropouts), sodium (slow failing), strobe, pulse, rotate (beacon sweep), scroll (LED)
 */
function flicker(spec, t, seed) {
  if (!spec) return 1;
  const kind = typeof spec === 'string' ? spec : spec.kind;
  const sp = (typeof spec === 'object' && spec.speed) || 1, amt = typeof spec === 'object' && spec.amount !== undefined ? spec.amount : 1;
  const n = (x) => { const s = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453; return s - Math.floor(s); };
  const T = t * sp;
  let v = 1;
  if (kind === 'fire') v = 0.75 + 0.18 * Math.sin(T * 9.1 + seed) + 0.12 * Math.sin(T * 23.7 + seed * 2.1) + 0.1 * (n(Math.floor(T * 15)) - 0.5);
  else if (kind === 'buzz' || kind === 'fluorescent') { const k = Math.floor(T * 12); v = n(k) > 0.9 ? 0.06 : n(k * 0.37) > 0.96 ? 0.45 : 1; }
  else if (kind === 'sodium') { const k = Math.floor(T * 2); v = n(k) > 0.8 ? 0.15 + 0.3 * n(k * 1.7) : 1; }
  else if (kind === 'strobe') v = Math.sin(T * 14 + seed) > 0.6 ? 1 : 0.05;
  else if (kind === 'pulse') v = 0.55 + 0.45 * Math.sin(T * 3 + seed);
  else if (kind === 'rotate') v = Math.pow(Math.max(0, Math.sin(T * Math.PI * 2 + seed)), 6) * 1.6 + 0.08;
  else if (kind === 'scroll') v = 0.85 + 0.15 * Math.sin(T * 6.3 + seed) * Math.sin(T * 2.1);
  return 1 + (v - 1) * Math.min(1, Math.max(0, amt));
}

/** Multiplies an HDR DataTexture by a colour in place (background tint, e.g. green-grey storm clouds). */
function tintHDR(tex, c) {
  const d = tex.image?.data;
  if (!d) return;
  const ch = d.length / (tex.image.width * tex.image.height);
  const half = tex.type === THREE.HalfFloatType;
  const k = [c.r, c.g, c.b];
  for (let i = 0; i < d.length; i += ch) for (let j = 0; j < 3; j++) {
    d[i + j] = half ? THREE.DataUtils.toHalfFloat(THREE.DataUtils.fromHalfFloat(d[i + j]) * k[j]) : d[i + j] * k[j];
  }
  tex.needsUpdate = true;
}
function cloneHDR(tex) {
  const t = tex.clone();
  t.image = { ...tex.image, data: tex.image.data.slice() };
  t.needsUpdate = true;
  return t;
}

/** Average linear colour of the HDRI band 0..6 degrees above the horizon. */
function horizonColor(tex) {
  const img = tex.image;
  const c = new THREE.Color(0.55, 0.55, 0.55);
  if (!img?.data) return c;
  const { width: w, height: h, data } = img;
  const ch = data.length / (w * h);
  const f = tex.type === THREE.HalfFloatType ? (v) => THREE.DataUtils.fromHalfFloat(v) : (v) => v;
  let r = 0, g = 0, b = 0, n = 0;
  const y0 = Math.floor(h / 2 - (6 / 180) * h), y1 = Math.floor(h / 2);
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x += 2) {
    const i = (y * w + x) * ch;
    r += f(data[i]); g += f(data[i + 1]); b += f(data[i + 2]); n++;
  }
  return n ? c.setRGB(r / n, g / n, b / n) : c;
}

/** Cosine-weighted irradiance of the upper hemisphere of an equirect HDR texture (for spec occlusion). */
function skyIrradiance(tex) {
  const img = tex.image;
  if (!img?.data) return 1;
  const { width: w, height: h, data } = img;
  const ch = data.length / (w * h);
  const half = tex.type === THREE.HalfFloatType;
  const f = half ? (v) => THREE.DataUtils.fromHalfFloat(v) : (v) => v;
  let sum = 0, wsum = 0;
  const step = Math.max(1, Math.floor(w / 64));
  for (let y = 0; y < h / 2; y += step) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI; // row 0 = top (+90 deg)
    const cosT = Math.sin(lat), dA = Math.cos(lat);
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * ch;
      const l = 0.2126 * f(data[i]) + 0.7152 * f(data[i + 1]) + 0.0722 * f(data[i + 2]);
      sum += l * cosT * dA; wsum += dA;
    }
  }
  // E = integral L cos dw ; average over hemisphere area (2 pi) -> E = 2 pi * <L cos>
  return (2 * Math.PI * sum) / Math.max(1e-6, wsum);
}
