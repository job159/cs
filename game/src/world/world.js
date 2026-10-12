// The level: visual scene graph, collision BVH, lighting rig, player/zombie spawn data and navigation.
// A map module exports build(ctx) -> { root, colliders: [Mesh|BufferGeometry...], playerSpawns, zombieSpawns,
// bossSpawn, bounds, lights, ... } and the World wires everything up.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Collision, SURF } from './collision.js';

const _m = new THREE.Matrix4();

/** Bakes a list of meshes/geometries (with their world transforms) into one non-indexed collision soup. */
export function buildCollisionGeometry(items) {
  const geos = [];
  for (const it of items) {
    let geo, matrix, surf;
    if (it.isMesh) {
      it.updateWorldMatrix(true, false);
      geo = it.geometry; matrix = it.matrixWorld; surf = it.userData.surf ?? SURF.concrete;
    } else {
      geo = it.geometry; matrix = it.matrix || _m.identity(); surf = it.surf ?? SURF.concrete;
    }
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
    g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    const s = new Float32Array(n).fill(surf);
    g.setAttribute('surf', new THREE.BufferAttribute(s, 1));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    this.collision = null;
    this.nav = null;
    this.playerSpawns = [new THREE.Vector3()];
    this.zombieSpawns = [];
    this.killY = -40;
    this.bounds = new THREE.Box3(new THREE.Vector3(-100, -10, -100), new THREE.Vector3(100, 50, 100));
    this.updaters = [];
  }

  async load(map, ctx) {
    const res = await map.build({ ...ctx, world: this, scene: this.scene, root: this.root });
    this.def = res;
    if (res.root && res.root !== this.root) this.root.add(res.root);
    const colGeo = res.collisionGeometry || buildCollisionGeometry(res.colliders || []);
    this.collision = new Collision(colGeo);
    if (res.playerSpawns) this.playerSpawns = res.playerSpawns;
    if (res.zombieSpawns) this.zombieSpawns = res.zombieSpawns;
    if (res.bounds) this.bounds = res.bounds;
    if (res.killY !== undefined) this.killY = res.killY;
    if (res.update) this.updaters.push(res.update);
    this.root.updateMatrixWorld(true);
    return this;
  }

  safePoint() { return this.playerSpawns[0].clone(); }

  update(dt, t) { for (const u of this.updaters) u(dt, t); }
}
