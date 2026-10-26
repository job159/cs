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

/**
 * Largest zombie model texture side at the current quality tier (0 = as authored), set by the renderer's tier:
 * the low tier (weak, low-memory machines) keeps the zombies' 2k maps at 1k. Each 2k map is 16 MB decoded plus
 * ~22 MB on the GPU with mips, and the zombie set has 26 above 1k (~0.7 GB per game): with two games on one
 * 16 GB laptop (the multiplayer test) the machine ran out of memory. Applied when a model loads (decoded once, the
 * smaller copy replaces the full one for the session); weapons and the map stay as authored.
 */
let zombieTexCap = 0;
export function setZombieTextureCap(px) { zombieTexCap = px | 0; }

async function capTextures(gltf, cap) {
  const seen = new Set();
  const list = [];
  gltf.scene.traverse((o) => {
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      for (const t of Object.values(m)) if (t?.isTexture && !seen.has(t)) { seen.add(t); list.push(t); }
    }
  });
  await Promise.all(list.map(async (t) => {
    const im = t.image;
    if (typeof ImageBitmap === 'undefined' || !(im instanceof ImageBitmap) || Math.max(im.width, im.height) <= cap) return;
    const k = cap / Math.max(im.width, im.height);
    try {
      t.image = await createImageBitmap(im, { resizeWidth: Math.max(1, Math.round(im.width * k)), resizeHeight: Math.max(1, Math.round(im.height * k)), resizeQuality: 'high', premultiplyAlpha: 'none' });
      im.close();
      t.needsUpdate = true;
    } catch { /* keep the full size */ }
  }));
}

/** Loads a GLB and returns the parsed gltf (scene shared: clone before mutating). */
export function loadGLB(path) {
  return once('glb:' + path, async () => {
    const g = await gltfLoader.loadAsync(BASE + path);
    if (zombieTexCap && path.startsWith('zombies/')) await capTextures(g, zombieTexCap);
    return g;
  });
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
