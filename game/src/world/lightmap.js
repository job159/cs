// Runtime side of the baked lightmaps written by tools/map/lib/lightmap.mjs (see docs/MAP_KIT.md "Lightmaps").
//
// Atlas encoding 'rgbm-sqrt': E = range * (rgb * a)^2, irradiance in three.js units (sun intensity x cos + sky
// radiance integrated over the hemisphere), sampled with uv1 (glTF TEXCOORD_1), flipY = false.
// Mode 'indirect+mask' (default): the atlas holds sky + one bounce + baked static lights; a second 8-bit atlas
// holds the sun visibility, which multiplies the realtime DirectionalLight on lightmapped surfaces (and the realtime
// shadow map still adds zombie / player shadows near the camera). Mode 'full': the sun is baked too and the
// realtime sun is skipped on lightmapped surfaces.
// Lightmapped materials take their diffuse ambient from the atlas only (the environment map's diffuse IBL would
// count the sky twice) and keep the environment's specular reflections, faded by a lightmap-driven specular
// occlusion so interiors do not reflect the bright sky.
import * as THREE from 'three';

const LUM = new THREE.Vector3(0.2126, 0.7152, 0.0722);

/**
 * Loads the atlases listed in a lightmap meta ({ range, mode, atlases: [{ rgbm, sun }] }) from `baseUrl`.
 * @returns {Promise<{ rgbm: THREE.Texture, sun: THREE.Texture | null }[]>}
 */
export async function loadLightmapAtlases(baseUrl, meta, { anisotropy = 4, mipmaps = true } = {}) {
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
export function lightmappedMaterial(source, atlas, o) {
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
export function applyLightmaps(root, atlases, meta, { skyRef, specOcclusion, intensity } = {}) {
  const cache = new Map();
  let n = 0;
  if (skyRef === undefined) {
    const up = meta.sky?.upIrradiance;
    skyRef = up ? (LUM.x * up[0] + LUM.y * up[1] + LUM.z * up[2]) * 0.6 : 1;
  }
  root.traverse((o) => {
    if (!o.isMesh || o.userData.lightmapAtlas === undefined) return;
    const atlas = atlases[o.userData.lightmapAtlas];
    if (!atlas || !o.geometry.attributes.uv1) return;
    const swap = (mat) => {
      const key = mat.uuid + ':' + o.userData.lightmapAtlas;
      if (!cache.has(key)) cache.set(key, lightmappedMaterial(mat, atlas, { range: meta.range, mode: meta.mode, skyRef, specOcclusion, intensity }));
      return cache.get(key);
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    n++;
  });
  return n;
}
