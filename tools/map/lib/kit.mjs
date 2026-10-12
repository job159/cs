// Map kit entry point: createKit() returns a Kit with every feature module installed and the Poly Haven
// prop library wired in. Zone builders receive one kit per zone: tools/map/<map>/zones/<zone>.mjs
//   export function build(kit, layout) { kit.building({...}); kit.vehicle({...}); ... return { ... } }
// API reference: docs/MAP_KIT.md.
import fs from 'node:fs';
import path from 'node:path';
import { Kit } from './kit/core.mjs';
import './kit/ground.mjs';
import './kit/arch.mjs';
import './kit/street.mjs';
import './kit/vehicles.mjs';
import { COMMON_DIR, readManifest } from './texlib.mjs';
import { parseGLB, readScene } from '../../../game/src/world/glb.js';

export { Kit };
export { SURF, NAVF, V, mulberry32 } from './kit/core.mjs';
export { MATERIALS } from './materials.mjs';

let propsManifest = null;
const propCache = new Map();

export function readPropsManifest() {
  if (propsManifest) return propsManifest;
  const f = path.join(COMMON_DIR, 'props.json');
  propsManifest = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  return propsManifest;
}

/** Material definition of part i of a prop (resolved form, like resolveMaterial()). */
export function propMaterial(id, i) {
  const def = readPropsManifest()[id];
  const m = def.materials[i];
  return {
    name: `prop_${id}_${i}`, set: null, maps: m.maps, avg: m.avg, metric: false, tileU: 1, tileV: 1,
    surf: def.surf || 'metal', lm: def.lm ?? 1, cast: true, color: rgbToHex(m.color), rough: m.rough, metal: m.metal,
    alphaTest: m.alpha ? 0.5 : undefined, side: m.doubleSided ? 'double' : undefined, prop: id,
  };
}
const rgbToHex = (c) => '#' + c.map((v) => Math.round(Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2) * 255).toString(16).padStart(2, '0')).join('');

function loadProp(id) {
  if (propCache.has(id)) return propCache.get(id);
  const def = readPropsManifest()[id];
  const buf = fs.readFileSync(path.join(COMMON_DIR, def.file));
  const doc = parseGLB(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  const parts = [];
  for (const inst of readScene(doc)) {
    for (const pr of inst.primitives) {
      parts.push({
        position: pr.attributes.position.array, normal: pr.attributes.normal.array, uv: pr.attributes.uv.array,
        index: Array.from(pr.index.array), kitMaterial: `prop_${id}_${pr.material ?? 0}`,
      });
    }
  }
  const data = { def, parts };
  propCache.set(id, data);
  return data;
}

/** Creates a kit for one zone. o: { zone, layout, chunk, seed, log }. */
export function createKit(o = {}) {
  const manifest = readManifest();
  const props = readPropsManifest();
  const kit = new Kit({ ...o, manifest, props, loadProp });
  const base = kit.material.bind(kit);
  kit.material = (name) => {
    if (name.startsWith('prop_')) {
      let m = kit.mats.get(name);
      if (!m) {
        const mm = /^prop_(.+)_(\d+)$/.exec(name);
        m = propMaterial(mm[1], +mm[2]);
        kit.mats.set(name, m);
      }
      return m;
    }
    return base(name);
  };
  return kit;
}
