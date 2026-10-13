// Asset loading with caching and progress: GLB models, textures, audio buffers, JSON.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const cache = new Map();

export const BASE = 'assets/';

function once(key, fn) {
  if (!cache.has(key)) cache.set(key, fn().catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
}

/** Loads a GLB and returns the parsed gltf (scene shared: clone before mutating). */
export function loadGLB(path) {
  return once('glb:' + path, () => gltfLoader.loadAsync(BASE + path));
}

/** Loads a GLB and returns a fresh clone of its scene (geometries/materials shared). */
export async function instanceGLB(path) {
  const g = await loadGLB(path);
  return g.scene.clone(true);
}

/**
 * One skeleton per skin inside an instance. SkeletonUtils.clone (and a per-mesh `new Skeleton` for LOD meshes) gives
 * every skinned mesh its own skeleton, so a zombie of 8-19 meshes computed and uploaded 8-19 identical bone textures
 * every frame, and each left a GPU texture behind when the zombie was dropped. Meshes whose skeletons have the same
 * bones (same instances, same order) and the same bind inverses (one glTF skin) now share the first one.
 */
export function shareSkeletons(root) {
  const bySkin = new Map(); // boneInverses array (shared by reference by every clone of one skin) -> skeletons
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    const sk = o.skeleton;
    let list = bySkin.get(sk.boneInverses);
    if (!list) bySkin.set(sk.boneInverses, (list = []));
    const same = list.find((s) => s === sk || (s.bones.length === sk.bones.length && s.bones.every((b, i) => b === sk.bones[i])));
    if (!same) { list.push(sk); return; }
    if (same !== sk) { o.skeleton = same; sk.dispose(); }
  });
}

/** Frees what an instance owns on the GPU (its skeletons' bone textures); geometries / materials are shared. */
export function disposeSkeletons(root) {
  const seen = new Set();
  root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton && !seen.has(o.skeleton)) { seen.add(o.skeleton); o.skeleton.dispose(); } });
}

export function loadTexture(path, { srgb = true, repeat = true, aniso = 8 } = {}) {
  return once('tex:' + path + srgb, async () => {
    const t = await texLoader.loadAsync(BASE + path);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    return t;
  });
}

export function loadJSON(path) {
  return once('json:' + path, async () => (await fetch(BASE + path)).json());
}

export function loadArrayBuffer(path) {
  return once('ab:' + path, async () => {
    const r = await fetch(BASE + path);
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return r.arrayBuffer();
  });
}

/** Runs loaders in parallel and reports 0..1 progress. */
export async function loadAll(tasks, onProgress) {
  let done = 0;
  onProgress?.(0);
  return Promise.all(tasks.map((t) => Promise.resolve().then(t).then((v) => { done++; onProgress?.(done / tasks.length); return v; })));
}
