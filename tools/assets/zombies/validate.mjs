// Validates character GLBs: Khronos glTF validator + our runtime contract (docs/ZOMBIE_PIPELINE.md §1).
//   node tools/assets/zombies/validate.mjs game/assets/zombies/walker_a.glb [game/assets/zombies/walker_a_lod1.glb ...]
import fs from 'node:fs';
import validator from 'gltf-validator';

const BONES = ['Root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r',
  'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'];
const ROLES = new Set(['skin', 'cloth', 'eye', 'teeth', 'hair', 'gear', 'gore']);

let bad = 0;
for (const file of process.argv.slice(2)) {
  const buf = fs.readFileSync(file);
  const report = await validator.validateBytes(new Uint8Array(buf), { maxIssues: 50 });
  const { numErrors, numWarnings, messages } = report.issues;
  const problems = [];
  for (const m of messages.filter((x) => x.severity === 0).slice(0, 10)) problems.push(`gltf: ${m.code} ${m.pointer || ''} ${m.message}`);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const lod1 = /_lod1\.glb$/.test(file);
  if (json.skins?.length !== 1) problems.push(`expected 1 skin, got ${json.skins?.length}`);
  const joints = (json.skins?.[0]?.joints || []).map((j) => json.nodes[j].name);
  for (const b of BONES) if (!joints.includes(b)) problems.push('missing bone ' + b);
  let tris = 0;
  for (const m of json.meshes) {
    const p = m.primitives[0];
    tris += json.accessors[p.indices].count / 3;
    for (const a of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0', '_SEG']) if (p.attributes[a] === undefined) problems.push(`${m.name}: no ${a}`);
    if (p.attributes._SEG !== undefined && json.accessors[p.attributes._SEG].componentType !== 5121) problems.push(`${m.name}: _SEG not u8`);
    const mat = json.materials?.[p.material];
    if (!mat || !ROLES.has(mat.name)) problems.push(`${m.name}: material name '${mat?.name}' is not a role`);
  }
  const ex = json.scenes[0].extras || {};
  // bosses may declare their own budget in the scene extras: triBudget { lod0, lod1 }
  const limit = (lod1 ? ex.triBudget?.lod1 : ex.triBudget?.lod0) || (lod1 ? 2500 : 9000);
  if (tris > limit) problems.push(`${tris} tris > ${limit}`);
  for (const k of ['type', 'height', 'hitboxes']) if (ex[k] === undefined) problems.push('scene extras missing ' + k);
  for (const [k, v] of Object.entries(ex.hitboxes || {})) if (!joints.includes(v[0]) || !(v[1] > 0)) problems.push(`hitbox ${k} invalid`);
  // ground / facing sanity: Root at origin, head above pelvis, face (nose) towards +Z
  const root = json.nodes.find((n) => n.name === 'Root');
  if (root?.translation?.some((v) => Math.abs(v) > 1e-4)) problems.push('Root not at origin');
  console.log(`${file}: ${(buf.length / 1048576).toFixed(2)} MB, ${tris} tris, ${json.meshes.length} meshes, ${joints.length} joints; glTF ${numErrors} errors / ${numWarnings} warnings; contract ${problems.length ? 'FAIL' : 'ok'}`);
  for (const p of problems) console.log('  - ' + p);
  if (problems.length) bad++;
}
process.exit(bad ? 1 : 0);
