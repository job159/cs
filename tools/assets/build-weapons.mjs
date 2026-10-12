// Builds every weapon model in tools/assets/weapons/*.mjs -> game/assets/weapons/<id>.glb
//   node tools/assets/build-weapons.mjs [id ...] [--nobake]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(root, 'tools', 'assets', 'weapons');
const outDir = path.join(root, 'game', 'assets', 'weapons');
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
const bake = !args.includes('--nobake');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
  .filter((f) => !only.length || only.includes(path.basename(f, '.mjs')));
let failed = 0;
for (const f of files) {
  const t0 = Date.now();
  try {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    const gun = await mod.default();
    const res = await gun.export(path.join(outDir, gun.id + '.glb'), { bake });
    console.log(`${gun.id.padEnd(14)} ${(res.bytes / 1024).toFixed(0).padStart(6)} KB  ${String(res.tris).padStart(7)} tris  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    failed++;
    console.error(`FAILED ${f}:`, e.stack || e);
  }
}
process.exit(failed ? 1 : 0);
