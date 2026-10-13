// Lightmap QA viewer (dev): index.html?view=lightmap[&src=maps/_test/lm][&cam=0][&lm=1][&show=lit|lm|mask|albedo]
//   [&pos=x,y,z&look=x,y,z][&fov=70][&shadows=1][&exp=1][&near=30 (realtime shadows replace the baked mask within 30 m)]
// Loads <src>/scene.glb + lightmap.json + atlases (written by tools/map/test-lightmap.mjs or any bakeLightmaps()
// result), lights it with the same sun / sky as the bake and renders through the game's post chain.
//   lm=0      realtime only (sun + shadow map + environment IBL) - the "without lightmap" reference
//   show=lm   white albedo: lighting only;  show=mask: sun mask only;  show=albedo: unlit textures
// window.__lmv = { scene, camera, render(camIndex | {pos, look}), cams } for --eval scripts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---- lightmap runtime for the viewer (the game itself uses game/src/world/mapPackage.js, same decode):
// RGBM-sqrt atlas E = range * (rgb * a)^2 on uv1 (flipY false); 'indirect+mask' multiplies the realtime sun by the
// sun-mask atlas; lightmapped materials take their diffuse ambient from the atlas only and keep the environment's
// specular reflections, faded by a lightmap-driven specular occlusion.
const LUM = new THREE.Vector3(0.2126, 0.7152, 0.0722);

/**
 * Loads the atlases listed in a lightmap meta ({ range, mode, atlases: [{ rgbm, sun }] }) from `baseUrl`.
 * @returns {Promise<{ rgbm: THREE.Texture, sun: THREE.Texture | null }[]>}
 */
async function loadLightmapAtlases(baseUrl, meta, { anisotropy = 4, mipmaps = true } = {}) {
  const loader = new THREE.TextureLoader();
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const prep = (t, single) => {
    t.flipY = false;
    t.colorSpace = THREE.NoColorSpace;
    t.generateMipmaps = mipmaps;
    t.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = anisotropy;
    if (single) { t.format = THREE.RedFormat; }
    t.needsUpdate = true;
    return t;
  };
  return Promise.all(meta.atlases.map(async (a) => {
    const [rgbm, sun] = await Promise.all([
      loader.loadAsync(base + a.rgbm),
      a.sun && meta.mode !== 'full' ? loader.loadAsync(base + a.sun) : Promise.resolve(null),
    ]);
    return { rgbm: prep(rgbm, false), sun: sun ? prep(sun, true) : null };
  }));
}

/**
 * Patches a MeshStandardMaterial / MeshPhysicalMaterial clone to use a baked atlas. Returns the new material.
 * @param {THREE.Material} source
 * @param {{ rgbm: THREE.Texture, sun?: THREE.Texture|null }} atlas
 * @param {{ range: number, mode?: string, intensity?: number, skyRef?: number, specOcclusion?: number }} o
 *   skyRef: luminance of the lightmap under open sky (e.g. lum(meta.sky.upIrradiance) * 0.6); specular reflections
 *   fade below it. specOcclusion: 0..1 strength of that fade.
 */
function lightmappedMaterial(source, atlas, o) {
  const m = source.clone();
  m.name = source.name;
  m.lightMap = atlas.rgbm;
  m.lightMap.channel = 1;
  m.lightMapIntensity = o.intensity ?? 1;
  const full = o.mode === 'full';
  const uniforms = {
    lmRange: { value: o.range },
    lmSun: { value: atlas.sun || null },
    lmSunMode: { value: full ? 0 : atlas.sun ? 1 : 2 }, // 0: sun baked, 1: mask, 2: no mask (sun unshadowed)
    lmSkyRef: { value: o.skyRef ?? 1 },
    lmSpecOcc: { value: o.specOcclusion ?? 1 },
    // near the camera the realtime shadow map (sharp, includes static casters) replaces the baked mask:
    // mask weight 0 below x metres, 1 beyond y (x = y = 0: mask everywhere)
    lmNearFade: { value: new THREE.Vector2(...(o.nearFade || [0, 0])) },
  };
  m.userData.lightmap = { uniforms, atlas };
  const prevCompile = source.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    if (prevCompile && prevCompile !== THREE.Material.prototype.onBeforeCompile) prevCompile.call(m, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = patchFragment(shader.fragmentShader);
  };
  const prevKey = source.customProgramCacheKey?.bind(source);
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|lm-rgbm';
  return m;
}

function patchFragment(fs) {
  const decl = /* glsl */`
uniform float lmRange;
uniform sampler2D lmSun;
uniform int lmSunMode;
uniform float lmSkyRef;
uniform float lmSpecOcc;
uniform vec2 lmNearFade;
`;
  fs = fs.replace('#include <lightmap_pars_fragment>', '#include <lightmap_pars_fragment>\n' + decl);
  const begin = THREE.ShaderChunk.lights_fragment_begin.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= lmSunVis;',
  );
  const pre = /* glsl */`
#ifdef USE_LIGHTMAP
	vec4 lmTexel = texture2D( lightMap, vLightMapUv );
	vec3 lmRgb = lmTexel.rgb * lmTexel.a;
	vec3 lmE = lmRange * lmRgb * lmRgb * lightMapIntensity;
	float lmSunVis = lmSunMode == 0 ? 0.0 : lmSunMode == 1 ? texture2D( lmSun, vLightMapUv ).r : 1.0;
	if ( lmSunMode == 1 && lmNearFade.y > 0.0 ) lmSunVis = mix( 1.0, lmSunVis, smoothstep( lmNearFade.x, lmNearFade.y, length( vViewPosition ) ) );
	float lmSpec = mix( 1.0, clamp( dot( lmE, vec3( ${LUM.x}, ${LUM.y}, ${LUM.z} ) ) / max( lmSkyRef, 1e-4 ), 0.0, 1.0 ), lmSpecOcc );
#else
	vec3 lmE = vec3( 0.0 );
	float lmSunVis = 1.0;
	float lmSpec = 1.0;
#endif
`;
  fs = fs.replace('#include <lights_fragment_begin>', pre + begin);
  const maps = /* glsl */`
#if defined( RE_IndirectDiffuse )
	irradiance += lmE; // baked sky + bounce + static lights replace the environment's diffuse IBL
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness ) * lmSpec;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness ) * lmSpec;
	#endif
#endif
`;
  fs = fs.replace('#include <lights_fragment_maps>', maps);
  return fs;
}

/**
 * Applies atlases to every mesh under `root` that carries userData.lightmapAtlas (set by the baker and kept in the
 * GLB extras). Materials are cloned once per (material, atlas). Returns the number of lightmapped meshes.
 */
function applyLightmaps(root, atlases, meta, { skyRef, specOcclusion, intensity, nearFade } = {}) {
  const cache = new Map();
  let n = 0;
  if (skyRef === undefined) {
    const up = meta.sky?.upIrradiance;
    skyRef = up ? (LUM.x * up[0] + LUM.y * up[1] + LUM.z * up[2]) * 0.6 : 1;
  }
  root.traverse((o) => {
    const ai = o.userData.lightmapAtlas ?? o.userData.lm;
    if (!o.isMesh || ai === undefined || ai < 0) return;
    const atlas = atlases[ai];
    if (!atlas || !o.geometry.attributes.uv1) return;
    const swap = (mat) => {
      const key = mat.uuid + ':' + ai;
      if (!cache.has(key)) cache.set(key, lightmappedMaterial(mat, atlas, { range: meta.range, mode: meta.mode, skyRef, specOcclusion, intensity, nearFade }));
      return cache.get(key);
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    n++;
  });
  return n;
}

// same analytic sky as tools/map/lib/lightmap-hdr.mjs makeSky() without an HDRI
function analyticSky(zen = [0.55, 0.68, 0.95], hor = [0.95, 0.95, 0.92], ground = [0.2, 0.19, 0.17]) {
  const W = 128, H = 64;
  const data = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI, dy = Math.sin(lat);
    const k = (y * W + x) * 4;
    if (dy >= 0) {
      const t = Math.pow(dy, 0.6);
      for (let c = 0; c < 3; c++) data[k + c] = hor[c] + (zen[c] - hor[c]) * t;
    } else {
      const t = Math.min(1, -dy / 0.12);
      for (let c = 0; c < 3; c++) data[k + c] = hor[c] * (1 - t) + ground[c] * t;
    }
    data[k + 3] = 1;
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

const TEST_CAMS = [
  { pos: [15, 9, 15], look: [0, 0.5, 0] },          // 0 overview from the sun side
  { pos: [2.3, 1.6, -1.9], look: [-0.6, 0.6, 2.5] }, // 1 inside the room, window + sun patch
  { pos: [0.5, 1.6, 2.1], look: [-1.6, 0.8, -2.5] }, // 2 inside the room, lamp corner / north wall
  { pos: [9.5, 1.5, -9.5], look: [9.5, 0.6, -4.2] }, // 3 shed: thin walls on the ground plane, through the door
  { pos: [-1.5, 2.2, 7.5], look: [-5.2, 1.2, 3.5] }, // 4 pillar + container (curved seams)
  { pos: [-9, 6, -10], look: [0, 0.5, 0] },         // 5 overview from the shaded side
];

export async function runLightmapViewer(renderer, params) {
  const src = (params.get('src') || 'maps/_test/lm').replace(/\/$/, '');
  const base = 'assets/' + src + '/';
  // a bake test folder (scene.glb + lightmap.json) or a compiled map package (static.glb + map.json, see MAP_KIT.md)
  let meta, glbName = 'scene.glb';
  const r = await fetch(base + 'lightmap.json');
  if (r.ok) meta = await r.json();
  else {
    const def = await (await fetch(base + 'map.json')).json();
    if (!def.lightmap) throw new Error(src + ': package has no lightmap (compiled with --nobake?)');
    meta = { ...def.lightmap, sun: def.sun, lights: (def.lights || []).filter((l) => !l.realtime), sky: def.lightmap.sky,
      cameras: (def.playerSpawns || []).slice(0, 4).map((p) => ({ pos: [p[0], p[1] + 1.64, p[2]], look: [p[0] - Math.sin(p[3] || 0) * 10, p[1] + 1.2, p[2] - Math.cos(p[3] || 0) * 10] })) };
    glbName = def.static?.file || def.static || 'static.glb';
  }
  const gltf = await new GLTFLoader().loadAsync(base + glbName);
  const scene = new THREE.Scene();
  const model = gltf.scene;
  scene.add(model);
  const useLm = params.get('lm') !== '0';
  const show = params.get('show') || 'lit';

  // sky + environment
  const skyTex = analyticSky();
  scene.background = skyTex;
  const pmrem = new THREE.PMREMGenerator(renderer.gl);
  scene.environment = pmrem.fromEquirectangular(skyTex).texture;
  scene.environmentIntensity = 1;

  // sun as in the bake (dir = towards the sun)
  const s = meta.sun;
  const sun = new THREE.DirectionalLight(new THREE.Color(s.color), s.intensity);
  const d = new THREE.Vector3(...s.dir).normalize();
  sun.position.copy(d).multiplyScalar(60);
  sun.castShadow = params.get('shadows') !== '0';
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -25; sc.right = sc.top = 25; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  renderer.gl.shadowMap.enabled = true;
  // baked point lights: realtime stand-ins only when the lightmap is off
  if (!useLm) for (const l of meta.lights || []) {
    const pl = new THREE.PointLight(new THREE.Color(l.color), l.intensity, l.range || 0, 2);
    pl.position.set(...l.pos);
    scene.add(pl);
  }

  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    if (show === 'lm' || show === 'mask') {
      const m = o.material.clone();
      m.color.set(0xb4b4b4); m.map = null; m.vertexColors = false; m.metalness = 0; m.roughness = 1;
      if (show === 'mask') m.envMapIntensity = 0;
      o.material = m;
    } else if (show === 'albedo') {
      o.material = new THREE.MeshBasicMaterial({ color: o.material.color, map: o.material.map });
    }
  });
  let nLm = 0;
  if (useLm && show !== 'albedo') {
    const atlases = await loadLightmapAtlases(base, meta);
    const near = +(params.get('near') || 0); // e.g. &near=30: realtime shadows only within ~30 m (shadow map range)
    nLm = applyLightmaps(model, atlases, meta, { nearFade: near > 0 && sun.castShadow ? [near * 0.8, near] : null });
    if (show === 'mask') model.traverse((o) => { if (o.isMesh && o.material.userData.lightmap) o.material.userData.lightmap.uniforms.lmRange.value = 0; });
  }
  if (show === 'mask') { scene.environment = null; sun.castShadow = false; }

  const camera = new THREE.PerspectiveCamera(+(params.get('fov') || 70), 1, 0.05, 500);
  const cams = meta.cameras || TEST_CAMS;
  const W = window.innerWidth, H = window.innerHeight;
  renderer.resize(W, H);
  renderer.fixedScale = true;
  renderer.scale = 1;
  renderer.post.vignette = 0.1; renderer.post.grain = 0;
  renderer.post.exposure = +(params.get('exp') || 1);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:6px;top:6px;z-index:6;font:12px monospace;color:#fff;background:rgba(0,0,0,.5);padding:2px 6px';
  document.getElementById('boot')?.remove();
  for (const el of document.body.children) if (el !== renderer.canvas && el.tagName !== 'SCRIPT') el.style.display = 'none'; // game HUD
  document.body.appendChild(hud);

  const render = (c) => {
    const cam = typeof c === 'number' ? cams[c % cams.length] : c;
    camera.position.set(...cam.pos);
    camera.lookAt(new THREE.Vector3(...cam.look));
    renderer.render(scene, camera, 0);
    const info = renderer.gl.info.render;
    hud.textContent = `${src}  lightmap ${useLm ? 'ON' : 'OFF'} (${nLm} meshes, range ${meta.range}, ${meta.mode})  show=${show}  ${info.calls} calls ${info.triangles} tris`;
  };
  const pos = params.get('pos'), look = params.get('look');
  render(pos && look ? { pos: pos.split(',').map(Number), look: look.split(',').map(Number) } : +(params.get('cam') || 0));
  window.__lmv = { scene, camera, render, cams, sun, model, meta };
  window.__shotReady = true;
}
