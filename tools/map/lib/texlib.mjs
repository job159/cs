// Shared texture library for all maps: game/assets/maps/common/ + textures.json manifest.
// Sets downloaded by tools/map/fetch.mjs (photoscans) win over procedural stand-ins with the same id.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETS, writeSet, GENERATOR_VERSION } from './proctex.mjs';
import { addVariants, variantsOk } from './imgio.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const COMMON_DIR = path.join(ROOT, 'game', 'assets', 'maps', 'common');
export const MANIFEST = path.join(COMMON_DIR, 'textures.json');

export function readManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return { sets: {}, hdri: {} }; }
}
export function writeManifest(m) {
  fs.mkdirSync(COMMON_DIR, { recursive: true });
  const text = JSON.stringify(m, null, 1);
  // Windows: the file can be briefly locked by a reader (dev server, git, indexer) -> retry
  for (let i = 0; ; i++) {
    try { fs.writeFileSync(MANIFEST, text); return; } catch (e) {
      if (i >= 20) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
    }
  }
}

/** Makes sure every texture set in `ids` exists on disk (generating procedural stand-ins as needed). */
export function ensureSets(ids, { force = false, log = console.log } = {}) {
  const m = readManifest();
  m.sets ||= {};
  let changed = false;
  for (const id of ids) {
    const cur = m.sets[id];
    const filesOk = cur && Object.values(cur.maps).every((f) => fs.existsSync(path.join(COMMON_DIR, f)));
    if (cur && filesOk && (cur.source !== 'procedural' || (cur.version === GENERATOR_VERSION && !force))) {
      // up to date (fetched photoscan or current procedural set); only the size variants may be missing
      if (!variantsOk(cur, COMMON_DIR)) { addVariants(cur, COMMON_DIR); changed = true; log(`  tex ${id.padEnd(16)} size variants ${JSON.stringify(cur.variants)}`); }
      continue;
    }
    if (!SETS[id]) { log(`  ! texture set '${id}' has no procedural generator and was not fetched`); continue; }
    const e = writeSet(id, COMMON_DIR);
    addVariants(e, COMMON_DIR);
    m.sets[id] = e;
    changed = true;
    log(`  tex ${id.padEnd(16)} ${e.res}px  ${(e.ms / 1000).toFixed(1)}s (procedural)`);
  }
  if (changed) writeManifest(m);
  return m;
}
