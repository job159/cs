// Downloads the animation sources into tools/assets/zombies/src/ (git-ignored):
//   - MPFB2 game_engine rig + weights + base mesh (CC0)            -> src/mpfb2/...
//   - Quaternius Universal Animation Library 1 + 2 Standard (CC0) -> src/quaternius/*.glb
//   - CMU Graphics Lab mocap, cgspeed BVH conversion               -> src/cmu/<trial>.bvh
//   node tools/assets/zombies/anim/fetch.mjs
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { SRC } from './skeleton.mjs';

const UA = 'calamity-front-asset-fetcher/1.0 (+zombie animation pipeline)';
const MPFB2 = 'https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/src/mpfb/data/';
const CMU = 'https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/';
export const SOURCES = {
  mpfb2: ['rigs/standard/rig.game_engine.json', 'rigs/standard/weights.game_engine.json', '3dobjs/base.obj'],
  quaternius: {
    'ual1.zip': 'https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip',
    'ual2.zip': 'https://opengameart.org/sites/default/files/universal_animation_library_2standard.zip',
  },
  // trials used by the build (see docs/ZOMBIE_ANIMS.md)
  cmu: ['104_41', '120_22', '91_24', '90_18'],
};

async function get(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return true;
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
  }
}

export async function fetchAll() {
  for (const p of SOURCES.mpfb2) if (await get(MPFB2 + p, path.join(SRC, 'mpfb2', p))) console.log('got', p);
  for (const [name, url] of Object.entries(SOURCES.quaternius)) {
    const zip = path.join(SRC, 'quaternius', name);
    if (await get(url, zip)) console.log('got', name);
    const tag = name.replace('.zip', '');
    const files = unzipSync(fs.readFileSync(zip), { filter: (f) => /\.(glb|txt)$/.test(f.name) });
    for (const [n, data] of Object.entries(files)) {
      const out = path.join(SRC, 'quaternius', `${tag}_${path.basename(n).replace(/ /g, '_')}`);
      if (!fs.existsSync(out)) fs.writeFileSync(out, data);
    }
  }
  for (const t of SOURCES.cmu) {
    const subj = t.split('_')[0].padStart(3, '0');
    if (await get(`${CMU}${subj}/${t}.bvh`, path.join(SRC, 'cmu', `${t}.bvh`))) console.log('got', t);
  }
  console.log('animation sources ready in', path.relative(process.cwd(), SRC));
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) await fetchAll();
