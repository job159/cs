// 2.5D navigation grid + multi-source flow field (every zombie descends one shared distance field
// toward the nearest player). The grid is either loaded from a map package (nav.bin/nav.json) or built
// at runtime by ray casting the collision mesh (test maps).
import * as THREE from 'three';

export const NAV = { WALK: 1, WATER: 2, CLIMB: 4, BLOCK: 8 };
const STEP = 0.55;          // max height difference between neighbouring walkable cells
const INF = 0x7fffffff;

const _o = new THREE.Vector3();
const _d = new THREE.Vector3(0, -1, 0);

export class NavGrid {
  constructor({ origin, cell, w, h, heights, flags }) {
    this.ox = origin[0]; this.oz = origin[1];
    this.cell = cell; this.w = w; this.h = h;
    this.heights = heights; this.flags = flags;
    this.dist = new Int32Array(w * h).fill(INF);
    this.queue = new Int32Array(w * h);
    this.fieldTime = -1;
  }

  /** Builds the grid by ray casting the collision mesh downward over the bounds. */
  static build(collision, bounds, cell = 0.5, { agentHeight = 1.7, agentRadius = 0.3, maxSlope = 0.65 } = {}) {
    const minX = bounds.min.x, minZ = bounds.min.z;
    const w = Math.ceil((bounds.max.x - minX) / cell), h = Math.ceil((bounds.max.z - minZ) / cell);
    const heights = new Float32Array(w * h), flags = new Uint8Array(w * h);
    const top = bounds.max.y + 1;
    const hit = {};
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = minX + (i + 0.5) * cell, z = minZ + (j + 0.5) * cell;
      _o.set(x, top, z);
      const r = collision.raycast(_o, _d, top - bounds.min.y + 2, hit);
      const k = j * w + i;
      if (!r || r.normal.y < maxSlope) { heights[k] = r ? r.point.y : -100; flags[k] = 0; continue; }
      heights[k] = r.point.y;
      // headroom + clearance: a sphere at chest height must be free
      _o.set(x, r.point.y + agentHeight * 0.55, z);
      flags[k] = collision.sphereHits(_o, agentRadius) ? 0 : NAV.WALK;
    }
    return new NavGrid({ origin: [minX, minZ], cell, w, h, heights, flags });
  }

  static fromPackage(json, buffer) {
    const n = json.w * json.h;
    const heights = new Float32Array(buffer, 0, n);
    const flags = new Uint8Array(buffer, n * 4, n);
    return new NavGrid({ origin: json.origin, cell: json.cell, w: json.w, h: json.h, heights, flags });
  }

  index(x, z) {
    const i = Math.floor((x - this.ox) / this.cell), j = Math.floor((z - this.oz) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }
  cellCenter(k, out = new THREE.Vector3()) {
    const i = k % this.w, j = (k / this.w) | 0;
    return out.set(this.ox + (i + 0.5) * this.cell, this.heights[k], this.oz + (j + 0.5) * this.cell);
  }
  walkable(k) { return k >= 0 && (this.flags[k] & NAV.WALK) !== 0; }
  heightAt(x, z, fallback = 0) { const k = this.index(x, z); return k >= 0 && this.flags[k] ? this.heights[k] : fallback; }

  /** Nearest walkable cell to a point (spiral search up to r cells). */
  nearestWalkable(x, z, r = 6) {
    const k0 = this.index(x, z);
    if (this.walkable(k0)) return k0;
    const i0 = Math.floor((x - this.ox) / this.cell), j0 = Math.floor((z - this.oz) / this.cell);
    for (let rad = 1; rad <= r; rad++) {
      for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
        if (Math.abs(di) !== rad && Math.abs(dj) !== rad) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        const k = j * this.w + i;
        if (this.walkable(k)) return k;
      }
    }
    return -1;
  }

  /**
   * Multi-source Dijkstra-ish BFS (8-neighbour, integer costs 10/14) from the given world positions.
   * Fills this.dist; zombies then step to the neighbour with the lowest distance.
   */
  computeField(sources) {
    const { w, h, dist, queue, heights, flags } = this;
    dist.fill(INF);
    // bucketed queue (Dial's algorithm) — costs are small integers
    const buckets = this._buckets || (this._buckets = Array.from({ length: 15 }, () => []));
    for (const b of buckets) b.length = 0;
    let pending = 0;
    for (const p of sources) {
      const k = this.nearestWalkable(p.x, p.z, 8);
      if (k < 0) continue;
      dist[k] = 0; buckets[0].push(k); pending++;
    }
    let cur = 0, bi = 0;
    const N8 = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];
    while (pending > 0) {
      const bucket = buckets[bi];
      if (!bucket.length) { cur++; bi = cur % 15; continue; }
      const k = bucket.pop(); pending--;
      if (dist[k] !== cur) continue;
      const i = k % w, j = (k / w) | 0, hk = heights[k];
      for (const [di, dj, c] of N8) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const nk = nj * w + ni;
        if (!(flags[nk] & NAV.WALK)) continue;
        if (Math.abs(heights[nk] - hk) > STEP) continue;
        if (c === 14 && (!(flags[j * w + ni] & NAV.WALK) || !(flags[nj * w + i] & NAV.WALK))) continue; // no corner cutting
        const nd = cur + c;
        if (nd < dist[nk]) { dist[nk] = nd; buckets[nd % 15].push(nk); pending++; }
      }
    }
    void queue;
  }

  /** Steering direction (unit, xz) down the field from a position; null if unreachable. */
  flowDir(x, z, out = new THREE.Vector3()) {
    const k = this.index(x, z);
    if (k < 0) return null;
    const { w, h, dist } = this;
    let best = this.walkable(k) ? dist[k] : INF, bk = -1;
    const i = k % w, j = (k / w) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const nk = nj * w + ni;
      if (dist[nk] < best) { best = dist[nk]; bk = nk; }
    }
    if (bk < 0) return null;
    this.cellCenter(bk, out);
    out.x -= x; out.z -= z; out.y = 0;
    const l = Math.hypot(out.x, out.z);
    if (l < 1e-4) return null;
    return out.multiplyScalar(1 / l);
  }

  distanceAt(x, z) { const k = this.index(x, z); return k >= 0 ? this.dist[k] : INF; }
}
