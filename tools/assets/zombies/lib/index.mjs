// The `lib` object handed to zombie type builders (tools/assets/zombies/types/<type>.mjs -> build(lib)).
import { zipEntry, zipFind, mpfb2 } from './fetch.mjs';
import { Human, fetchAsset } from './human.mjs';
import { Part } from './mesh.mjs';
import { PRESETS, merge } from './presets.mjs';
import { loadImageSized, decodeImage, resize, createImage, savePNG, cloneImage } from './image.mjs';
import { paintSkin, paintCloth, paintEyes, grungeTexture, thinHair, surfacePoint, anchors, COLORS } from './zombify.mjs';
import { makeNoise, rng, smoothstep } from './noise.mjs';

/** Loads a texture from an asset pack (or a local path) downscaled to `size` (cached). */
export async function texture(packOrFile, file, size) {
  if (size === undefined) return loadImageSized(packOrFile, file);
  return loadImageSized(await zipEntry(packOrFile, file), size);
}

/** Material description for the GLB writer. role: skin|cloth|eye|teeth|hair|gear|gore */
export function material(role, o = {}) {
  return {
    name: role, role,
    baseColor: o.albedo || o.baseColor || null,
    normal: o.normal || null,
    orm: o.orm || null,
    color: o.color,
    roughness: o.roughness ?? (o.orm ? 1 : 0.7),
    metalness: o.metalness ?? (o.orm ? 1 : 0),
    emissive: o.emissive, emissiveMap: o.emissiveMap || null,
    alphaMode: o.alpha ? 'MASK' : (o.alphaMode || 'OPAQUE'), alphaCutoff: o.alphaCutoff ?? 0.5,
    doubleSided: !!o.doubleSided,
    normalScale: o.normalScale,
    quality: o.quality,
    extras: o.extras,
  };
}

export const lib = {
  Human, Part, fetchAsset, zipEntry, zipFind, mpfb2,
  PRESETS, merge,
  texture, material, loadImageSized, decodeImage, resize, createImage, cloneImage, savePNG,
  paintSkin, paintCloth, paintEyes, grungeTexture, thinHair, surfacePoint, anchors, COLORS,
  makeNoise, rng, smoothstep,
};
export default lib;
