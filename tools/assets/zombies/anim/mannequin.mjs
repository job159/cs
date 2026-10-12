// Preview mannequin: the MakeHuman base mesh body (CC0) skinned to the game_engine skeleton with
// the MPFB2 game_engine weights (CC0). Left limbs are tinted blue, right limbs orange so film
// strips show sidedness at a glance. Output: game/dev/mannequin.glb (dev only, not shipped).
//   node tools/assets/zombies/anim/mannequin.mjs
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { Skeleton, SRC, REPO } from './skeleton.mjs';
import { GLBBuilder, addSkeleton } from './glb-write.mjs';

export function buildMannequin(skel, out = path.join(REPO, 'game', 'dev', 'mannequin.glb')) {
  const obj = fs.readFileSync(path.join(SRC, 'mpfb2', '3dobjs', 'base.obj'), 'utf8').split('\n');
  const V = [];
  const tris = [];
  let group = '';
  for (const l of obj) {
    if (l.startsWith('v ')) { const p = l.split(/\s+/); V.push([+p[1], +p[2], +p[3]]); }
    else if (l.startsWith('g ')) group = l.slice(2).trim();
    else if (l.startsWith('f ') && group === 'body') {
      const idx = l.trim().split(/\s+/).slice(1).map((t) => parseInt(t, 10) - 1);
      for (let k = 1; k + 1 < idx.length; k++) tris.push(idx[0], idx[k], idx[k + 1]);
    }
  }
  const rig = JSON.parse(fs.readFileSync(path.join(SRC, 'mpfb2', 'rigs', 'standard', 'rig.game_engine.json'), 'utf8'));
  const groundY = -rig.Root.tail.default_position[2]; // metres
  const W = JSON.parse(fs.readFileSync(path.join(SRC, 'mpfb2', 'rigs', 'standard', 'weights.game_engine.json'), 'utf8')).weights;
  const used = new Map();
  const remap = [];
  for (const v of tris) if (!used.has(v)) { used.set(v, remap.length); remap.push(v); }
  const n = remap.length;
  const pos = new Float32Array(n * 3);
  remap.forEach((v, k) => { pos[k * 3] = V[v][0] * 0.1; pos[k * 3 + 1] = V[v][1] * 0.1 + groundY; pos[k * 3 + 2] = V[v][2] * 0.1; });
  const infl = Array.from({ length: n }, () => []);
  for (const [bone, list] of Object.entries(W)) {
    const bi = skel.index.get(bone);
    if (bi === undefined) continue;
    for (const [v, w] of list) { const k = used.get(v); if (k !== undefined && w > 0) infl[k].push([bi, w]); }
  }
  const joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4), color = new Float32Array(n * 3);
  let unweighted = 0;
  for (let k = 0; k < n; k++) {
    const l = infl[k].sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (!l.length) { l.push([skel.i('pelvis'), 1]); unweighted++; }
    const s = l.reduce((a, b) => a + b[1], 0);
    l.forEach(([b, w], j) => { joints[k * 4 + j] = b; weights[k * 4 + j] = w / s; });
    const name = skel.names[l[0][0]];
    let c = [0.62, 0.6, 0.57];
    if (/_l$/.test(name) && !/clavicle/.test(name)) c = [0.42, 0.52, 0.68];
    if (/_r$/.test(name) && !/clavicle/.test(name)) c = [0.72, 0.5, 0.36];
    if (name === 'head' || name === 'neck_01') c = [0.68, 0.64, 0.6];
    color.set(c, k * 3);
  }
  const index = new Uint32Array(tris.map((v) => used.get(v)));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  const g = new GLBBuilder();
  const ids = addSkeleton(g, skel);
  const ibm = new Float32Array(skel.names.length * 16);
  skel.names.forEach((_, i) => {
    const m = new THREE.Matrix4().compose(skel.restWorldP[i], skel.restWorldQ[i], new THREE.Vector3(1, 1, 1)).invert();
    ibm.set(m.elements, i * 16);
  });
  g.json.skins = [{ joints: ids, skeleton: ids[0], inverseBindMatrices: g.accessor(ibm, 'MAT4') }];
  g.json.materials = [{ name: 'mannequin', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.7 } }];
  g.json.meshes = [{
    name: 'mannequin',
    primitives: [{
      attributes: {
        POSITION: g.accessor(pos, 'VEC3', { target: 34962, minmax: true }),
        NORMAL: g.accessor(geo.attributes.normal.array, 'VEC3', { target: 34962 }),
        COLOR_0: g.accessor(color, 'VEC3', { target: 34962 }),
        JOINTS_0: g.accessor(joints, 'VEC4', { target: 34962 }),
        WEIGHTS_0: g.accessor(weights, 'VEC4', { target: 34962 }),
      },
      indices: g.accessor(index, 'SCALAR', { target: 34963 }),
      material: 0,
    }],
  }];
  const mn = g.node({ name: 'Mannequin', mesh: 0, skin: 0 });
  g.json.scenes[0].nodes.push(mn);
  const bytes = g.write(out);
  console.log(`mannequin: ${n} verts, ${index.length / 3} tris, ${unweighted} unweighted -> ${path.relative(REPO, out)} (${(bytes / 1024).toFixed(0)} KB)`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) buildMannequin(new Skeleton());
