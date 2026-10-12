// Builds zombie characters: node tools/assets/zombies/build.mjs <type> [<type> ...] [--nolod] [--all]
// Each tools/assets/zombies/types/<type>.mjs exports `build(lib)` returning
//   { human, parts, extras?, budget?, partBudget?, lod1?: { budget, drop: [partName], partBudget, texScale } }
// and gets written to game/assets/zombies/<type>.glb (+ <type>_lod1.glb). See docs/ZOMBIE_PIPELINE.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import lib from './lib/index.mjs';
import { exportCharacter } from './lib/export.mjs';
import { resize } from './lib/image.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', '..', '..', 'game', 'assets', 'zombies');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
let types = args.filter((a) => !a.startsWith('--'));
if (flags.has('--all') || !types.length) types = fs.readdirSync(path.join(here, 'types')).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).map((f) => f.slice(0, -4));

function lodMaterials(parts, scale) {
  const cache = new Map();
  const small = (img) => {
    if (!img || scale >= 1) return img;
    if (!cache.has(img)) cache.set(img, resize(img, Math.max(64, Math.round(img.width * scale)), Math.max(64, Math.round(img.height * scale))));
    return cache.get(img);
  };
  const mats = new Map();
  for (const p of parts) {
    const m = p.material;
    if (!mats.has(m)) mats.set(m, { ...m, baseColor: small(m.baseColor), normal: small(m.normal), orm: small(m.orm), emissiveMap: small(m.emissiveMap) });
  }
  return mats;
}

let failed = 0;
for (const type of types) {
  const t0 = Date.now();
  try {
    const mod = await import(pathToFileURL(path.join(here, 'types', type + '.mjs')).href);
    const res = await mod.build(lib);
    const extras = { ...(res.extras || {}) };
    const r0 = await exportCharacter(path.join(outDir, `${type}.glb`), {
      type, human: res.human, parts: res.parts, extras, budget: res.budget ?? 9000, partBudget: res.partBudget,
    });
    console.log(`${type.padEnd(12)} LOD0 ${(r0.bytes / 1048576).toFixed(2)} MB  ${r0.tris} tris  ${r0.parts.map(([n, t]) => `${n}:${t}`).join(' ')}`);
    if (!flags.has('--nolod')) {
      const l = res.lod1 || {};
      const parts = res.parts.filter((p) => !(l.drop || ['teeth', 'eyebrows']).includes(p.name));
      const mats = lodMaterials(parts, l.texScale ?? 0.5);
      const saved = parts.map((p) => p.material);
      parts.forEach((p) => { p.material = mats.get(p.material); });
      const r1 = await exportCharacter(path.join(outDir, `${type}_lod1.glb`), {
        type, human: res.human, parts, extras: { ...extras, lod: 1 }, budget: l.budget ?? 2500, partBudget: l.partBudget, error: 1,
      });
      parts.forEach((p, i) => { p.material = saved[i]; });
      console.log(`${type.padEnd(12)} LOD1 ${(r1.bytes / 1048576).toFixed(2)} MB  ${r1.tris} tris  ${r1.parts.map(([n, t]) => `${n}:${t}`).join(' ')}`);
    }
    console.log(`${type.padEnd(12)} done in ${((Date.now() - t0) / 1000).toFixed(1)}s, rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`);
  } catch (e) {
    failed++;
    console.error(`FAILED ${type}:`, e.stack || e);
  }
}
process.exit(failed ? 1 : 0);
