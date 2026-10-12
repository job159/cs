// Static world collision: one merged triangle soup with a BVH (three-mesh-bvh).
// Every vertex carries a `surf` id (SURF.*) so impacts know what they hit (sparks vs dust vs wood chips).
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export const SURF = { concrete: 0, metal: 1, wood: 2, dirt: 3, glass: 4, flesh: 5, water: 6, tile: 7, sand: 8, grate: 9 };
export const SURF_NAMES = Object.keys(SURF);

const _ray = new THREE.Ray();
const _box = new THREE.Box3();
const _seg = new THREE.Line3();
const _triPoint = new THREE.Vector3();
const _capPoint = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _v = new THREE.Vector3();
const _sphere = new THREE.Sphere();

export class Collision {
  /** @param {THREE.BufferGeometry} geometry world-space, with position (+ optional surf attribute) */
  constructor(geometry) {
    this.geometry = geometry;
    this.bvh = new MeshBVH(geometry, { setBoundingBox: true });
    this.surf = geometry.getAttribute('surf');
    this.index = geometry.index;
  }

  /** First hit along a ray, or null. Result object is reused: copy what you keep. */
  raycast(origin, dir, maxDist = 1000, out = {}) {
    _ray.origin.copy(origin);
    _ray.direction.copy(dir);
    const hit = this.bvh.raycastFirst(_ray, THREE.DoubleSide, 0, maxDist);
    if (!hit) return null;
    out.dist = hit.distance;
    out.point = (out.point || new THREE.Vector3()).copy(hit.point);
    out.normal = (out.normal || new THREE.Vector3()).copy(hit.face.normal);
    if (out.normal.dot(dir) > 0) out.normal.negate();
    out.surf = this.surf ? this.surf.getX(hit.face.a) : 0;
    return out;
  }

  /** True if the segment a->b is blocked. */
  blocked(a, b) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-4) return false;
    _dir.multiplyScalar(1 / len);
    _ray.origin.copy(a); _ray.direction.copy(_dir);
    const hit = this.bvh.raycastFirst(_ray, THREE.DoubleSide, 0, len);
    return !!hit;
  }

  /**
   * Pushes a capsule (segment start..end, radius r) out of the geometry, in place.
   * Returns the summed push vector (useful for ground detection).
   */
  resolveCapsule(start, end, r, out = new THREE.Vector3()) {
    _seg.start.copy(start);
    _seg.end.copy(end);
    out.set(0, 0, 0);
    for (let iter = 0; iter < 3; iter++) {
      _box.makeEmpty();
      _box.expandByPoint(_seg.start); _box.expandByPoint(_seg.end);
      _box.min.addScalar(-r); _box.max.addScalar(r);
      let moved = false;
      this.bvh.shapecast({
        intersectsBounds: (box) => box.intersectsBox(_box),
        intersectsTriangle: (tri) => {
          const d = tri.closestPointToSegment(_seg, _triPoint, _capPoint);
          if (d < r) {
            const depth = r - d;
            _dir.subVectors(_capPoint, _triPoint);
            if (_dir.lengthSq() < 1e-10) tri.getNormal(_dir); else _dir.normalize();
            _seg.start.addScaledVector(_dir, depth);
            _seg.end.addScaledVector(_dir, depth);
            out.addScaledVector(_dir, depth);
            moved = true;
          }
        },
      });
      if (!moved) break;
    }
    start.copy(_seg.start);
    end.copy(_seg.end);
    return out;
  }

  /** True if a sphere overlaps any triangle. */
  sphereHits(center, r) {
    _sphere.center.copy(center); _sphere.radius = r;
    return this.bvh.intersectsSphere(_sphere);
  }

  /** Height of the floor below p (searching down from p.y + up), or -Infinity. */
  floorBelow(p, up = 0.5, maxDown = 50) {
    _v.set(p.x, p.y + up, p.z);
    _ray.origin.copy(_v); _ray.direction.set(0, -1, 0);
    const hit = this.bvh.raycastFirst(_ray, THREE.DoubleSide, 0, up + maxDown);
    return hit ? hit.point.y : -Infinity;
  }
}
