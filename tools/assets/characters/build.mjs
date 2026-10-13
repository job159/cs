// Builds third-person characters (teammates): node --max-old-space-size=2048 tools/assets/characters/build.mjs [soldier]
//   [--nolod] [--preview] [--noanim] [--animonly] [--fast]
// Uses the CC0 MakeHuman zombie pipeline (tools/assets/zombies/lib, read-only) for the body / clothes / skeleton and
// the zombie animation tools (tools/assets/zombies/anim, read-only) for retargeting; writes
//   game/assets/characters/<type>.glb (+ <type>_lod1.glb: meshes only, bound to the LOD0 skeleton at runtime)
// with the type's own AnimationClips embedded (see <type>_anims.mjs) and root extras
//   { type, height, hitboxes, capsules, handSocket, clips: {name: {duration, loop, speed, events}} }.
// --preview   paints textures at half resolution (look-dev only).
// --animonly  re-authors only the clips: the character is rebuilt without textures (geometry is needed for the
//             rifle / body collision checks) and the clips + clip extras of the existing GLB are replaced. Only valid
//             while the geometry code is unchanged since the last full build (build/<type>/animbase.json records it).
// --fast      no textures (8x8 placeholders), output to build/<type>/fast/ (geometry / clip QA only).
// Files are written to build/<type>/out/ first and copied into the game folder at the end (a GLB that the dev
// server or a browser holds open would otherwise fail the in-place rewrite half-way).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const gameDir = path.join(repo, 'game', 'assets', 'characters');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
if (flags.has('--preview')) process.env.ZOMBIE_TEX_SCALE = '0.5';
if (flags.has('--animonly') || flags.has('--fast')) process.env.SOLDIER_FAST = '1';
const types = args.filter((a) => !a.startsWith('--'));
if (!types.length) types.push('soldier');

const { default: lib } = await import('../zombies/lib/index.mjs');
const { exportCharacter, computeHitboxes } = await import('../zombies/lib/export.mjs');
const { resize } = await import('../zombies/lib/image.mjs');
const { updateCredits } = await import('../zombies/lib/credits.mjs');
const { appendClips, patchExtras, glbCounts, stripClips, copyRetry } = await import('./kit.mjs');

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
    const work = path.join(repo, 'build', type);
    const outDir = path.join(work, flags.has('--fast') ? 'fast' : 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const mod = await import(pathToFileURL(path.join(here, type + '.mjs')).href);
    const res = await mod.build(lib);
    console.log(`${type.padEnd(10)} model built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    const extras = { ...(res.extras || {}) };
    const file0 = path.join(outDir, `${type}.glb`), file1 = path.join(outDir, `${type}_lod1.glb`);
    const baseFile = path.join(work, 'animbase.json');
    const am = flags.has('--noanim') ? null : await import(pathToFileURL(path.join(here, type + '_anims.mjs')).href);

    if (flags.has('--animonly')) {
      // clips only: strip the old clips from the shipped GLB and append the new ones
      const base = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
      fs.copyFileSync(path.join(gameDir, `${type}.glb`), file0);
      stripClips(file0, base);
      const anim = am.buildClips(res);
      const a = appendClips(file0, anim.skel, anim.clips, { aliases: anim.aliases });
      patchExtras(file0, anim.extras);
      fs.copyFileSync(path.join(gameDir, `${type}_lod1.glb`), file1);
      patchExtras(file1, { handSocket: anim.extras.handSocket });
      console.log(`${type.padEnd(10)} clips ${anim.clips.map((c) => c.name).join(', ')} (+${Object.keys(anim.aliases).join(',')}) ${a.keys} keys -> ${(a.bytes / 1048576).toFixed(2)} MB`);
      copyRetry(file0, path.join(gameDir, `${type}.glb`));
      copyRetry(file1, path.join(gameDir, `${type}_lod1.glb`));
      console.log(`${type.padEnd(10)} anim-only done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      continue;
    }

    // hitboxes from the body / clothes only (thin straps, pouches or an antenna would inflate the 80th-percentile
    // radii), plus per-region margins for the hard kit (helmet, plates)
    if (res.hitboxMargins) {
      const renders = res.parts.filter((p) => !(res.hitboxExclude || []).includes(p.name)).map((p) => p.toRender());
      const { hitboxes, capsules } = computeHitboxes(res.human, renders);
      for (const [k, m] of Object.entries(res.hitboxMargins)) if (hitboxes[k]) { hitboxes[k][1] = +(hitboxes[k][1] + m).toFixed(3); capsules[k].radius = hitboxes[k][1]; }
      Object.assign(extras, { hitboxes, capsules });
    }
    const r0 = await exportCharacter(file0, { type, human: res.human, parts: res.parts, extras, budget: res.budget ?? 9000, partBudget: res.partBudget });
    console.log(`${type.padEnd(10)} LOD0 ${(r0.bytes / 1048576).toFixed(2)} MB  ${r0.tris} tris  ${r0.parts.map(([n, t]) => `${n}:${t}`).join(' ')}`);
    const base = glbCounts(file0);
    // animation clips authored on this character's own skeleton
    let anim = null;
    if (am) {
      anim = am.buildClips(res);
      const a = appendClips(file0, anim.skel, anim.clips, { aliases: anim.aliases });
      patchExtras(file0, anim.extras);
      console.log(`${type.padEnd(10)} clips ${anim.clips.map((c) => c.name).join(', ')} (+${Object.keys(anim.aliases).join(',')}) ${a.keys} keys -> ${(a.bytes / 1048576).toFixed(2)} MB`);
    }
    if (!flags.has('--nolod')) {
      const l = res.lod1 || {};
      const parts = res.parts.filter((p) => !(l.drop || []).includes(p.name)).map((p) => l.replace?.[p.name] || p);
      const mats = lodMaterials(parts, l.texScale ?? 0.5);
      for (const [m, s] of l.keepMaterials || []) mats.set(m, s); // materials that keep their LOD0 textures
      const saved = parts.map((p) => p.material);
      parts.forEach((p) => { p.material = mats.get(p.material) || p.material; });
      const r1 = await exportCharacter(file1, { type, human: res.human, parts, extras: { ...extras, lod: 1 }, budget: l.budget ?? 2500, partBudget: l.partBudget, error: 1 });
      parts.forEach((p, i) => { p.material = saved[i]; });
      // LOD1 is only a mesh source: the game binds its meshes to the LOD0 instance's skeleton (no duplicate clips)
      if (anim) patchExtras(file1, { handSocket: anim.extras.handSocket, meshOnly: true });
      console.log(`${type.padEnd(10)} LOD1 ${(fs.statSync(file1).size / 1048576).toFixed(2)} MB  ${r1.tris} tris  ${r1.parts.map(([n, t]) => `${n}:${t}`).join(' ')}`);
    }
    if (!flags.has('--fast')) {
      fs.writeFileSync(baseFile, JSON.stringify(base));
      copyRetry(file0, path.join(gameDir, `${type}.glb`));
      if (!flags.has('--nolod')) copyRetry(file1, path.join(gameDir, `${type}_lod1.glb`));
      console.log(`${type.padEnd(10)} shipped: ${type}.glb ${(fs.statSync(path.join(gameDir, `${type}.glb`)).size / 1048576).toFixed(2)} MB`);
    }
    console.log(`${type.padEnd(10)} done in ${((Date.now() - t0) / 1000).toFixed(1)}s, rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`);
  } catch (e) {
    failed++;
    console.error(`FAILED ${type}:`, e.stack || e);
  }
}
if (!failed && !flags.has('--preview') && !flags.has('--fast') && !flags.has('--animonly')) console.log(`credits: ${await updateCredits()} source entries -> docs/CREDITS.md`);
process.exit(failed ? 1 : 0);
