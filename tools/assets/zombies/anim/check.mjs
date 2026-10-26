// Verifies the zombie animation library.
//   node tools/assets/zombies/anim/check.mjs [game/assets/zombies/anims.glb] [--model game/assets/zombies/walker_a.glb]
// Lists clips (duration, loop, speed, keys) and checks: every contract clip present, every channel
// targets an existing game_engine bone, values finite and unit quaternions, loops closed, a skin
// marking the skeleton nodes as joints, and (with --model) that a character GLB has every bone.
import path from 'node:path';
import fs from 'node:fs';
import { readGLB } from './gltf-read.mjs';
import { BONES, REPO } from './skeleton.mjs';

const CONTRACT = ['idle', 'idle_b', 'walk_a', 'walk_b', 'walk_c', 'walk_limp', 'walk_stalk', 'walk_hurry', 'run', 'sprint',
  'attack_a', 'attack_b', 'attack_lunge', 'bite', 'hit_front', 'hit_back', 'hit_left', 'hit_right', 'stagger',
  'knockdown', 'get_up', 'death_front', 'death_back', 'crawl', 'crawl_attack', 'scream', 'spit', 'leap', 'climb', 'eat',
  'crawl_quad', 'crawl_quad_attack', 'pounce', 'death_quad', 'idle_quad'];

const args = process.argv.slice(2);
const file = path.resolve(REPO, args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) || 'game/assets/zombies/anims.glb');
const mi = args.indexOf('--model');
const model = mi >= 0 ? path.resolve(REPO, args[mi + 1]) : null;

const errors = [], warns = [];
const d = readGLB(file);
const j = d.json;
const nodeNames = d.nodes.map((n) => n.name);
const boneSet = new Set(BONES);
for (const b of BONES) if (!nodeNames.includes(b)) errors.push(`skeleton node missing: ${b}`);
for (const n of nodeNames) if (!boneSet.has(n)) warns.push(`extra node: ${n}`);
if (!j.skins?.length) warns.push('no skin: loaders will create Object3D instead of Bone for the skeleton');
const extras = j.scenes?.[j.scene || 0]?.extras;
if (!extras?.clips) errors.push('scene extras.clips missing');

const anims = j.animations || [];
const names = anims.map((a) => a.name);
for (const c of CONTRACT) if (!names.includes(c)) errors.push(`missing clip: ${c}`);
for (const n of names) if (!CONTRACT.includes(n)) warns.push(`non-contract clip: ${n}`);

console.log(`${path.relative(REPO, file)}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB  ${anims.length} clips  skeleton ${BONES.length} bones`);
console.log('clip            dur(s)  loop  speed  chans  keys  notes');
for (const a of anims) {
  let dur = 0, keys = 0;
  const targets = new Set();
  for (const ch of a.channels) {
    const s = a.samplers[ch.sampler];
    const times = d.accessor(s.input), vals = d.accessor(s.output);
    dur = Math.max(dur, times[times.length - 1]);
    keys += times.length;
    const node = d.nodes[ch.target.node];
    if (!node) { errors.push(`${a.name}: channel targets missing node ${ch.target.node}`); continue; }
    if (!boneSet.has(node.name)) errors.push(`${a.name}: channel targets non-bone node ${node.name}`);
    if (ch.target.path === 'translation' && node.name !== 'pelvis') errors.push(`${a.name}: translation on ${node.name} (only pelvis may move)`);
    if (ch.target.path === 'scale') errors.push(`${a.name}: scale track on ${node.name}`);
    targets.add(`${node.name}.${ch.target.path}`);
    for (let k = 0; k < vals.length; k++) if (!Number.isFinite(vals[k])) { errors.push(`${a.name}: non-finite value on ${node.name}`); break; }
    if (ch.target.path === 'rotation') {
      for (let k = 0; k < vals.length; k += 4) {
        const l = Math.hypot(vals[k], vals[k + 1], vals[k + 2], vals[k + 3]);
        if (Math.abs(l - 1) > 1e-3) { errors.push(`${a.name}: non-unit quaternion on ${node.name}`); break; }
      }
    }
    for (let k = 1; k < times.length; k++) if (!(times[k] > times[k - 1])) { errors.push(`${a.name}: non-increasing times on ${node.name}`); break; }
  }
  for (const b of BONES.slice(1)) if (!targets.has(`${b}.rotation`)) errors.push(`${a.name}: no rotation track for ${b}`);
  if (!targets.has('pelvis.translation')) errors.push(`${a.name}: no pelvis translation track`);
  const m = extras?.clips?.[a.name] || {};
  if (m.loop) {
    // first and last sampled pose must match
    const smp = d.sampleAnimation(a.name, 30);
    let worst = 0;
    for (const [, tr] of smp.tracks) {
      if (tr.r) { const q0 = tr.r[0], q1 = tr.r[tr.r.length - 1]; worst = Math.max(worst, 1 - Math.abs(q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3])); }
      if (tr.t) { const p0 = tr.t[0], p1 = tr.t[tr.t.length - 1]; worst = Math.max(worst, Math.hypot(p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2])); }
    }
    if (worst > 1e-4) errors.push(`${a.name}: loop not closed (${worst.toExponential(2)})`);
  }
  if (Math.abs((m.duration ?? dur) - dur) > 0.02) warns.push(`${a.name}: extras duration ${m.duration} != ${dur.toFixed(3)}`);
  const ev = m.events ? ' events ' + Object.entries(m.events).map(([k, v]) => `${k}@${v}`).join(',') : '';
  console.log(`${a.name.padEnd(14)} ${dur.toFixed(2).padStart(6)}  ${m.loop ? 'yes ' : '    '}  ${(m.speed || 0).toFixed(2).padStart(5)}  ${String(a.channels.length).padStart(5)}  ${String(keys).padStart(5)} ${ev}${m.rootMotion ? ' rootMotion ' + JSON.stringify(m.rootMotion) : ''}`);
}

if (model) {
  const md = readGLB(model);
  const joints = new Set((md.json.skins || []).flatMap((s) => s.joints.map((k) => md.nodes[k].name)));
  const missing = BONES.filter((b) => !joints.has(b));
  if (missing.length) errors.push(`${path.basename(model)}: skeleton lacks ${missing.join(', ')}`);
  else console.log(`${path.basename(model)}: all ${BONES.length} bones present in its skin`);
}

// Load with three.js GLTFLoader exactly like the game: skeleton must come back as THREE.Bone, every
// clip must bind and evaluate to finite transforms.
{
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const buf = fs.readFileSync(file);
  const g = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
  let bones = 0;
  g.scene.traverse((o) => { if (o.isBone) bones++; });
  if (bones !== BONES.length) errors.push(`GLTFLoader: ${bones} THREE.Bone objects (want ${BONES.length})`);
  if (!g.scene.userData?.clips) errors.push('GLTFLoader: scene.userData.clips missing');
  const mixer = new THREE.AnimationMixer(g.scene);
  for (const clip of g.animations) {
    const a = mixer.clipAction(clip);
    a.play();
    for (const u of [0, 0.37, 0.71, 0.999]) {
      mixer.setTime(clip.duration * u);
      g.scene.updateMatrixWorld(true);
      let bad = false;
      g.scene.traverse((o) => { if (o.isBone && o.matrixWorld.elements.some((v) => !Number.isFinite(v))) bad = true; });
      if (bad) { errors.push(`GLTFLoader: ${clip.name} produces non-finite bone matrices`); break; }
    }
    a.stop();
  }
  console.log(`three.js GLTFLoader: ${bones} bones, ${g.animations.length} clips evaluated`);
}

for (const w of warns) console.log('WARN', w);
for (const e of errors) console.log('ERROR', e);
console.log(errors.length ? `FAILED (${errors.length} errors)` : 'OK');
process.exit(errors.length ? 1 : 0);
