// Assembles parts into the runtime contract GLB: one skeleton, skinned meshes with _SEG, role-named materials,
// root extras {type, height, hitboxes}. Enforces a triangle budget with meshoptimizer (largest parts first).
import { MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from 'three';
import { compactRender } from './mesh.mjs';
import { writeGLB } from './glb.mjs';

export const HITBOX_BONES = {
  head: 'head', neck: 'neck_01', chest: 'spine_03', spine: 'spine_01', pelvis: 'pelvis',
  upperarm_l: 'upperarm_l', lowerarm_l: 'lowerarm_l', hand_l: 'hand_l',
  upperarm_r: 'upperarm_r', lowerarm_r: 'lowerarm_r', hand_r: 'hand_r',
  thigh_l: 'thigh_l', calf_l: 'calf_l', foot_l: 'foot_l',
  thigh_r: 'thigh_r', calf_r: 'calf_r', foot_r: 'foot_r',
};

/** Simplifies render buffers to roughly `targetTris` triangles (keeps UV seams / borders sensible). */
export async function simplifyRender(r, targetTris, { error = 0.02, lockBorder = false } = {}) {
  await MeshoptSimplifier.ready;
  const tris = r.index.length / 3;
  if (tris <= targetTris) return r;
  const nv = r.position.length / 3;
  const attrs = new Float32Array(nv * 5);
  for (let i = 0; i < nv; i++) {
    attrs[i * 5] = r.normal[i * 3]; attrs[i * 5 + 1] = r.normal[i * 3 + 1]; attrs[i * 5 + 2] = r.normal[i * 3 + 2];
    attrs[i * 5 + 3] = r.uv[i * 2]; attrs[i * 5 + 4] = r.uv[i * 2 + 1];
  }
  const flags = lockBorder ? ['LockBorder'] : [];
  let [idx] = MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(r.index), r.position, 3, attrs, 5, [0.5, 0.5, 0.5, 1, 1], null, targetTris * 3, error, flags);
  if (idx.length / 3 > targetTris * 1.15) {
    [idx] = MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(r.index), r.position, 3, attrs, 5, [0.2, 0.2, 0.2, 0.5, 0.5], null, targetTris * 3, 1, flags);
  }
  return compactRender({ ...r, index: idx });
}

export function triCount(r) { return r.index.length / 3; }

/**
 * Hitbox capsules per contract entry: [bone, radius]. Radius = 80th percentile distance of the bone's
 * dominant vertices (all parts) to the bone segment head->tail.
 */
export function computeHitboxes(human, renders) {
  const { bones, byName } = human.skeleton;
  const dists = new Map();
  for (const r of renders) {
    const nv = r.position.length / 3;
    for (let i = 0; i < nv; i++) {
      const b = r.joints[i * 4];
      if (r.weights[i * 4] < 0.5) continue;
      const bone = bones[b];
      const p = new THREE.Vector3(r.position[i * 3], r.position[i * 3 + 1], r.position[i * 3 + 2]);
      const seg = new THREE.Line3(bone.head, bone.tail);
      const c = seg.closestPointToPoint(p, true, new THREE.Vector3());
      if (!dists.has(bone.name)) dists.set(bone.name, []);
      dists.get(bone.name).push(p.distanceTo(c));
    }
  }
  const pct = (a, q) => { if (!a?.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
  const hit = {};
  for (const [key, bone] of Object.entries(HITBOX_BONES)) {
    if (!byName[bone]) continue;
    let r = pct(dists.get(bone), 0.8);
    if (key === 'head') r = Math.max(r, 0.1);
    if (key === 'hand_l' || key === 'hand_r') r = Math.max(0.05, Math.min(r, 0.07));
    if (key === 'foot_l' || key === 'foot_r') r = Math.max(0.05, Math.min(r, 0.08));
    hit[key] = [bone, +Math.max(0.04, r).toFixed(3)];
  }
  const caps = {};
  for (const [key, [bone, radius]] of Object.entries(hit)) {
    const b = byName[bone];
    caps[key] = { bone, radius, length: +b.head.distanceTo(b.tail).toFixed(3) };
  }
  return { hitboxes: hit, capsules: caps };
}

/**
 * @param file   output .glb
 * @param o.type, o.human, o.parts (Part[]), o.extras (merged into root extras)
 * @param o.budget total LOD triangle budget; o.partBudget {name: tris} explicit caps
 */
export async function exportCharacter(file, o) {
  const { human } = o;
  const items = o.parts.map((p) => ({ part: p, render: p.toRender() }));
  for (const it of items) {
    const cap = o.partBudget?.[it.part.name];
    if (cap) it.render = await simplifyRender(it.render, cap, { error: o.error ?? 0.05 });
  }
  let total = items.reduce((a, it) => a + triCount(it.render), 0);
  if (o.budget && total > o.budget) {
    // scale every reducible part proportionally (eyes and tiny parts are left alone)
    const reducible = items.filter((it) => triCount(it.render) > 300 && !it.part.extras.noSimplify);
    const fixed = total - reducible.reduce((a, it) => a + triCount(it.render), 0);
    const f = Math.max(0.05, (o.budget - fixed) / (total - fixed));
    for (const it of reducible) it.render = await simplifyRender(it.render, Math.floor(triCount(it.render) * f * 0.98), { error: 1 });
    total = items.reduce((a, it) => a + triCount(it.render), 0);
  }
  const { hitboxes, capsules } = computeHitboxes(human, items.map((it) => it.render));
  const extras = {
    type: o.type,
    height: +human.height.toFixed(3),
    hitboxes,
    capsules,
    segments: ['torso', 'head', 'upperarm_l', 'lowerarm_l', 'upperarm_r', 'lowerarm_r', 'thigh_l', 'calf_l', 'thigh_r', 'calf_r'],
    tris: total,
    ...(o.extras || {}),
  };
  const res = writeGLB(file, {
    name: o.type,
    extras,
    bones: human.skeleton.bones,
    meshes: items.map((it) => ({ name: it.part.name, render: it.render, material: it.part.material, extras: { role: it.part.role } })),
  });
  return { ...res, tris: total, parts: items.map((it) => [it.part.name, triCount(it.render)]) };
}
