// Material palette of the map kit. Every surface the kit emits names one of these; the compiler merges
// geometry per (material, chunk) and writes the resolved definitions into map.json `materials`, from which
// game/src/world/mapPackage.js builds the three.js materials (shared texture cache, per-quality sizes).
//
// Fields (all optional):
//   set        texture set id in game/assets/maps/common/textures.json (diff/nor/arm). null = untextured.
//   tile       metres covered by one texture repeat (defaults to the set's real-world size); [u, v] allowed
//   color      sRGB multiplier of the diffuse (the kit's per-vertex tint multiplies on top)
//   rough      roughness multiplier (on the ARM green channel; absolute when untextured), metal likewise
//   normal     normal map strength (default 1)
//   surf       impact surface for kit-generated colliders (SURF names of game/src/world/collision.js)
//   lm         lightmap texel-density scale (1 = map resolution, 0 = not lightmapped: lit by env + sun only)
//   alphaTest, opacity (+ transparent), side ('double'), emissive (sRGB) + emissiveIntensity (HDR),
//   env        environment (IBL) specular intensity multiplier
//   decal      true: drawn with polygon offset, never casts shadows (road paint, patches, stains)
//   cast       false: does not occlude in the lightmap bake / realtime shadows
//   metric     false: UVs are authored (props) instead of world-space metres
//   lmBump     how much the normal map modulates the baked irradiance (default 0.35)
export const MATERIALS = {
  // ---------------------------------------------------------------- ground
  asphalt: { set: 'asphalt', surf: 'concrete', lm: 0.55 },
  asphalt_cracked: { set: 'asphalt_cracked', surf: 'concrete', lm: 0.55 },
  asphalt_patch: { set: 'asphalt_dark', surf: 'concrete', lm: 0.55, decal: true, color: '#c8c8c8' },
  asphalt_dark: { set: 'asphalt_dark', surf: 'concrete', lm: 0.55 },
  sidewalk: { set: 'sidewalk', surf: 'concrete', lm: 0.7 },
  curb: { set: 'concrete_floor', surf: 'concrete', tile: 2.0, color: '#cfcac0', lm: 1 },
  concrete_floor: { set: 'concrete_floor', surf: 'concrete', lm: 0.7 },
  concrete_cracked: { set: 'concrete_cracked', surf: 'concrete', lm: 0.7 },
  gravel: { set: 'gravel', surf: 'dirt', lm: 0.5, rough: 1.0 },
  dirt: { set: 'dirt', surf: 'dirt', lm: 0.5 },
  grass: { set: 'grass', surf: 'dirt', lm: 0.5 },
  rubble: { set: 'rubble', surf: 'concrete', lm: 0.8 },
  // road paint (worn alpha), stains
  paint_white: { set: 'road_paint', surf: 'concrete', color: '#ece8dc', alphaTest: 0.32, decal: true, lm: 0.5, cast: false, tile: [2, 2] },
  paint_yellow: { set: 'road_paint', surf: 'concrete', color: '#e2b23a', alphaTest: 0.32, decal: true, lm: 0.5, cast: false, tile: [2, 2] },
  paint_red: { set: 'road_paint', surf: 'concrete', color: '#a8302a', alphaTest: 0.32, decal: true, lm: 0.5, cast: false, tile: [2, 2] },

  // ---------------------------------------------------------------- facades
  brick_red: { set: 'brick_red', surf: 'concrete', lm: 1 },
  brick_dark: { set: 'brick_dark', surf: 'concrete', lm: 1 },
  brick_painted: { set: 'brick_painted', surf: 'concrete', lm: 1 },
  plaster: { set: 'plaster', surf: 'concrete', lm: 1 },
  concrete_wall: { set: 'concrete_wall', surf: 'concrete', lm: 1 },
  wood_siding: { set: 'wood_siding', surf: 'wood', lm: 1 },
  corrugated: { set: 'corrugated', surf: 'metal', lm: 1, metal: 1 },
  corrugated_rusty: { set: 'corrugated_rusty', surf: 'metal', lm: 1 },
  metal_container: { set: 'metal_container', surf: 'metal', lm: 0.8 },
  metal_painted: { set: 'metal_painted', surf: 'metal', lm: 1 },
  metal_shutter: { set: 'metal_shutter', surf: 'metal', lm: 1 },
  metal_rusty: { set: 'metal_rusty', surf: 'metal', lm: 1 },
  metal_worn: { set: 'metal_worn', surf: 'metal', lm: 1 },
  wood_planks: { set: 'wood_planks', surf: 'wood', lm: 1 },
  roof_tar: { set: 'roof_tar', surf: 'concrete', lm: 0.5 },
  roof_shingles: { set: 'roof_shingles', surf: 'wood', lm: 0.6 },
  // trims (cornices, sills, lintels, copings, steps)
  trim_stone: { set: 'concrete_wall', surf: 'concrete', tile: 1.6, color: '#d6d0c4', lm: 1 },
  trim_concrete: { set: 'concrete_floor', surf: 'concrete', tile: 2.0, color: '#bdb8ae', lm: 1 },
  trim_metal: { set: 'metal_painted', surf: 'metal', tile: 1.2, color: '#3a3c3e', rough: 0.9, lm: 1 },
  trim_wood: { set: 'wood_planks', surf: 'wood', tile: 1.5, color: '#d8d4cc', lm: 1 },
  frame_dark: { set: 'metal_worn', surf: 'metal', tile: 1.0, color: '#2d2f31', rough: 0.85, lm: 1 },
  frame_white: { set: 'metal_worn', surf: 'metal', tile: 1.0, color: '#d9d6cf', rough: 0.9, lm: 1 },
  steel: { set: 'metal_worn', surf: 'metal', tile: 1.2, color: '#8d9094', rough: 0.8, metal: 1, lm: 1 },
  steel_dark: { set: 'metal_rusty', surf: 'metal', tile: 1.2, color: '#5d5a57', rough: 0.9, lm: 1 },
  awning_fabric: { set: 'canvas', surf: 'wood', tile: 1.5, color: '#7c2a24', lm: 1, side: 'double' },
  // ---------------------------------------------------------------- interiors
  interior_wall: { set: 'plaster_worn', surf: 'concrete', color: '#a59d90', lm: 0.45 },
  interior_floor: { set: 'tiles', surf: 'tile', lm: 0.45 },
  interior_ceiling: { set: 'plaster_worn', surf: 'concrete', color: '#c6c0b4', lm: 0.35 },
  interior_hidden: { set: 'plaster_worn', surf: 'concrete', color: '#7a746b', lm: 0.2 }, // unreachable rooms behind windows

  // ---------------------------------------------------------------- glass, lights
  glass: { set: null, surf: 'glass', color: '#1c262d', rough: 0.06, metal: 0, opacity: 0.38, lm: 0, env: 1.3, cast: false },
  glass_dirty: { set: null, surf: 'glass', color: '#3a3a33', rough: 0.25, metal: 0, opacity: 0.6, lm: 0, env: 0.9, cast: false },
  glass_shop: { set: null, surf: 'glass', color: '#0f1418', rough: 0.04, metal: 0, opacity: 0.3, lm: 0, env: 1.5, cast: false },
  lamp_warm: { set: null, surf: 'glass', color: '#fff3dc', emissive: '#ffc77a', emissiveIntensity: 14, lm: 0, cast: false },
  lamp_cold: { set: null, surf: 'glass', color: '#eef6ff', emissive: '#d8ecff', emissiveIntensity: 12, lm: 0, cast: false },
  lamp_red: { set: null, surf: 'glass', color: '#ff4030', emissive: '#ff2a18', emissiveIntensity: 8, lm: 0, cast: false },
  lamp_amber: { set: null, surf: 'glass', color: '#ffb040', emissive: '#ff9a1a', emissiveIntensity: 8, lm: 0, cast: false },
  lamp_green: { set: null, surf: 'glass', color: '#40ff70', emissive: '#30ff60', emissiveIntensity: 6, lm: 0, cast: false },
  lamp_off: { set: null, surf: 'glass', color: '#2a2a28', rough: 0.2, lm: 0, cast: false },

  // ---------------------------------------------------------------- street furniture
  chainlink: { set: 'chainlink', surf: 'metal', alphaTest: 0.45, side: 'double', lm: 0.5, metal: 1 },
  pole_wood: { set: 'wood_planks', surf: 'wood', tile: [0.6, 3], color: '#6e5a45', lm: 1 },
  wire: { set: null, surf: 'metal', color: '#141414', rough: 0.7, lm: 0, cast: false },
  rubber: { set: null, surf: 'dirt', color: '#1b1b1b', rough: 0.92, lm: 1 },
  sandbag: { set: 'canvas', surf: 'sand', tile: 0.8, color: '#a39272', lm: 1 },
  tape_police: { set: null, surf: 'wood', color: '#e8c21a', rough: 0.6, lm: 0, cast: false, side: 'double' },
  cone_orange: { set: null, surf: 'wood', color: '#d4501c', rough: 0.55, lm: 1 },
  reflective_white: { set: null, surf: 'wood', color: '#d8d8d2', rough: 0.4, lm: 1 },
  sign_white: { set: 'metal_worn', surf: 'metal', tile: 1.5, color: '#e6e3dc', lm: 1 },
  sign_red: { set: 'metal_worn', surf: 'metal', tile: 1.5, color: '#a32722', lm: 1 },
  sign_green: { set: 'metal_worn', surf: 'metal', tile: 1.5, color: '#2e6a3c', lm: 1 },
  sign_blue: { set: 'metal_worn', surf: 'metal', tile: 1.5, color: '#284f86', lm: 1 },
  sign_yellow: { set: 'metal_worn', surf: 'metal', tile: 1.5, color: '#d6a822', lm: 1 },
  billboard: { set: 'metal_worn', surf: 'metal', tile: 3, color: '#b9b2a2', lm: 1 },

  // ---------------------------------------------------------------- vehicles (tinted per vehicle with vertex colour)
  car_paint: { set: null, surf: 'metal', rough: 0.38, metal: 0.35, lm: 1, env: 1.0 },
  car_paint_worn: { set: 'metal_worn', surf: 'metal', tile: 2.4, rough: 0.8, lm: 1, env: 0.8 },
  car_burnt: { set: 'metal_rusty', surf: 'metal', tile: 1.4, color: '#6b625c', lm: 1 },
  car_chrome: { set: null, surf: 'metal', color: '#b8bcc0', rough: 0.25, metal: 1, lm: 1, env: 1.5 },
  car_plastic: { set: null, surf: 'metal', color: '#1e1f20', rough: 0.7, lm: 1 },
  car_glass: { set: null, surf: 'glass', color: '#121a20', rough: 0.05, opacity: 0.55, lm: 0, env: 1.6, cast: false },
  car_interior: { set: null, surf: 'wood', color: '#242322', rough: 0.85, lm: 0.6 },
  car_light: { set: null, surf: 'glass', color: '#d8d4c8', rough: 0.1, lm: 1 },
  car_taillight: { set: null, surf: 'glass', color: '#7a1410', rough: 0.15, lm: 1 },
};

/** Resolves a palette entry against the texture manifest: adds tileU/tileV (metres), avg albedo, file names. */
export function resolveMaterial(name, manifest) {
  const def = MATERIALS[name];
  if (!def) throw new Error(`unknown kit material '${name}'`);
  const set = def.set ? manifest?.sets?.[def.set] : null;
  if (def.set && !set) throw new Error(`material '${name}': texture set '${def.set}' missing from textures.json (run tools/map/fetch.mjs)`);
  let tileU = 2, tileV = 2;
  if (Array.isArray(def.tile)) [tileU, tileV] = def.tile;
  else if (def.tile) tileU = tileV = def.tile;
  else if (set) { tileU = set.tile || 2; tileV = set.tileV || set.tile || 2; }
  return {
    name, ...def, tileU, tileV, metric: def.metric !== false,
    maps: set ? set.maps : null, avg: set ? set.avg || null : null, alphaMap: !!set?.alpha,
    lm: def.lm ?? 1, cast: def.cast ?? !def.decal,
  };
}
