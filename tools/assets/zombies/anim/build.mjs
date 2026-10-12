// Builds the zombie animation library: game/assets/zombies/anims.glb
//   node tools/assets/zombies/anim/build.mjs [--only walk_a,run] [--out path] [--plot]
// Sources (see docs/ZOMBIE_ANIMS.md / docs/CREDITS.md): Quaternius UAL 1/2 (CC0), CMU mocap BVH
// (cgspeed conversion), procedural keyframes. Run fetch.mjs first.
import path from 'node:path';
import * as THREE from 'three';
import fs from 'node:fs';
import { Skeleton, REPO } from './skeleton.mjs';
import { GLBBuilder, addSkeleton, addClips } from './glb-write.mjs';
import { fixSigns, duration } from './clip.mjs';
import { buildLoco } from './clips-loco.mjs';
import { buildActions } from './clips-action.mjs';
import { footMetrics, popMetrics } from './metrics.mjs';
import { plotFeet } from './plot.mjs';

export const CLIP_NAMES = ['idle', 'idle_b', 'walk_a', 'walk_b', 'walk_c', 'walk_limp', 'run', 'sprint',
  'attack_a', 'attack_b', 'attack_lunge', 'bite', 'hit_front', 'hit_back', 'hit_left', 'hit_right', 'stagger',
  'knockdown', 'get_up', 'death_front', 'death_back', 'crawl', 'crawl_attack', 'scream', 'spit', 'leap', 'climb', 'eat'];

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const only = opt('only', null)?.split(',');
const out = path.resolve(REPO, opt('out', 'game/assets/zombies/anims.glb'));

const skel = new Skeleton();
const t0 = Date.now();
const loco = buildLoco(skel, only);
const all = { ...loco, ...buildActions(skel, only, loco) };
const clips = [];
for (const name of CLIP_NAMES) {
  if (only && !only.includes(name)) continue;
  const c = all[name];
  if (!c) { console.warn('MISSING clip', name); continue; }
  c.name = name;
  fixSigns(c);
  clips.push(c);
}
const g = new GLBBuilder();
const ids = addSkeleton(g, skel);
// A skin (no mesh) marks the nodes as joints so loaders create real Bones (THREE.Bone / isBone),
// which runtime retargeters look for. Inverse bind matrices = inverse rest world matrices.
{
  const ibm = new Float32Array(skel.names.length * 16);
  skel.names.forEach((_, i) => ibm.set(new THREE.Matrix4().compose(skel.restWorldP[i], skel.restWorldQ[i], new THREE.Vector3(1, 1, 1)).invert().elements, i * 16));
  g.json.skins = [{ name: 'game_engine', joints: ids, skeleton: ids[0], inverseBindMatrices: g.accessor(ibm, 'MAT4') }];
}
const keys = addClips(g, skel, ids, clips);
const meta = {};
for (const c of clips) {
  const m = {
    duration: +duration(c).toFixed(4),
    loop: !!c.loop,
    speed: +(c.meta.speed || 0).toFixed(3),
    source: c.meta.source || 'procedural',
  };
  if (c.meta.events) m.events = c.meta.events;
  if (c.meta.rootMotion) m.rootMotion = c.meta.rootMotion;
  if (c.meta.notes) m.notes = c.meta.notes;
  meta[c.name] = m;
}
g.json.scenes[0].extras = {
  kind: 'zombie-animation-library',
  skeleton: 'mpfb2-game_engine',
  fps: 30,
  up: '+Y', forward: '+Z', units: 'm',
  note: 'Clips are in place (pelvis translation keeps bob/sway only) unless rootMotion is set. speed = treadmill speed in m/s for locomotion loops: playbackRate = moveSpeed / speed.',
  clips: meta,
};
const bytes = g.write(out);
console.log(`anims: ${clips.length} clips, ${keys} rotation keys, ${(bytes / 1024).toFixed(0)} KB -> ${path.relative(REPO, out)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
for (const c of clips) {
  const fm = footMetrics(skel, c), pm = popMetrics(skel, c);
  console.log(`  ${c.name.padEnd(13)} ${duration(c).toFixed(2).padStart(5)}s ${c.loop ? 'loop' : '    '} v=${(c.meta.speed || 0).toFixed(2)}  slide ${fm.slideMean.toFixed(3)}  minFootY ${fm.minFootY.toFixed(3)}  maxStep ${pm.maxStepDeg.toFixed(1)}deg (${pm.maxStepAt})${c.loop ? `  seam ${pm.seamVelDiffDeg.toFixed(1)}` : ''}`);
}
if (args.includes('--plot')) {
  const loco = clips.filter((c) => c.loop && c.meta.speed > 0.05);
  plotFeet(skel, loco, path.join(REPO, 'captures', 'anim', 'feet.png'), { W: 1600, scaleX: 300, scaleY: 400, rowH: 150 });
}
fs.writeFileSync(path.join(REPO, 'captures', 'anim', 'build-report.json'), JSON.stringify(meta, null, 1));
