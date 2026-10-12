// Offline nav-grid baker for game/src/world/nav.js (NavGrid.fromPackage):
//   nav.json { origin: [x, z], cell, w, h, agent, layers }   nav.bin = Float32 heights (w*h) + Uint8 flags (w*h)
//   flags: 1 walkable, 2 water, 4 climb, 8 block.
// The grid is 2.5D (one height per cell). Each cell collects every walkable surface under it (multi-layer
// down-casts: roofs, upper floors, the street under an overhang ...), then a flood fill from the seed
// points (player spawns, zombie spawners) over neighbouring cells (|dh| <= step, no wall between them) picks,
// per cell, the LOWEST reachable layer. Unreachable cells keep their lowest walkable height with flag 0.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const _ray = new THREE.Ray(), _sphere = new THREE.Sphere(), _v = new THREE.Vector3();

export function bakeNav(geometry, o = {}) {
  const cell = o.cell ?? 0.5, step = o.step ?? 0.55, agentH = o.agentHeight ?? 1.7, agentR = o.agentRadius ?? 0.3;
  const maxSlope = o.maxSlope ?? 0.65, maxLayers = o.maxLayers ?? 4;
  const bvh = geometry.boundsTree || new MeshBVH(geometry, { setBoundingBox: true });
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const [bx0, by0, bz0, bx1, by1, bz1] = o.bounds || [bb.min.x - 2, bb.min.y - 1, bb.min.z - 2, bb.max.x + 2, bb.max.y + 2, bb.max.z + 2];
  const w = Math.ceil((bx1 - bx0) / cell), h = Math.ceil((bz1 - bz0) / cell);
  const top = by1 + 2;
  const nCell = w * h;
  const layH = new Float32Array(nCell * maxLayers).fill(NaN);
  const layN = new Uint8Array(nCell);
  const hitDown = (x, y, z, far) => {
    _ray.origin.set(x, y, z); _ray.direction.set(0, -1, 0);
    return bvh.raycastFirst(_ray, THREE.DoubleSide, 0, far);
  };
  const clearAbove = (x, y, z) => {
    _sphere.center.set(x, y + agentH * 0.55, z); _sphere.radius = agentR;
    if (bvh.intersectsSphere(_sphere)) return false;
    _sphere.center.set(x, y + agentH - agentR, z);
    if (bvh.intersectsSphere(_sphere)) return false;
    return true;
  };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = bx0 + (i + 0.5) * cell, z = bz0 + (j + 0.5) * cell;
    let y = top;
    const k = j * w + i;
    for (let guard = 0; guard < 12 && layN[k] < maxLayers; guard++) {
      const hit = hitDown(x, y, z, y - by0 + 1);
      if (!hit) break;
      const ny = hit.face.normal.y;
      const hy = hit.point.y;
      // face normals are in geometry space (world here); double-sided: upward if |ny| large and we came from above
      if (Math.abs(ny) >= maxSlope && clearAbove(x, hy, z)) {
        // skip duplicates within 5 cm
        const base = k * maxLayers;
        let dup = false;
        for (let l = 0; l < layN[k]; l++) if (Math.abs(layH[base + l] - hy) < 0.05) dup = true;
        if (!dup) { layH[base + layN[k]] = hy; layN[k]++; }
      }
      y = hy - 0.02;
    }
  }
  // sort layers ascending
  for (let k = 0; k < nCell; k++) {
    const n = layN[k];
    if (n < 2) continue;
    const arr = Array.from(layH.subarray(k * maxLayers, k * maxLayers + n)).sort((a, b) => a - b);
    layH.set(arr, k * maxLayers);
  }
  // flood fill over (cell, layer)
  const reach = new Uint8Array(nCell * maxLayers);
  const queue = new Int32Array(nCell * maxLayers);
  let qh = 0, qt = 0;
  const seeds = o.seeds || [];
  const cellOf = (x, z) => { const i = Math.floor((x - bx0) / cell), jj = Math.floor((z - bz0) / cell); return i < 0 || jj < 0 || i >= w || jj >= h ? -1 : jj * w + i; };
  const seedLayer = (x, y, z) => {
    // nearest cell with a layer close to y (spiral search 3 cells)
    const i0 = Math.floor((x - bx0) / cell), j0 = Math.floor((z - bz0) / cell);
    let best = -1, bd = Infinity;
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
      const i = i0 + di, jj = j0 + dj;
      if (i < 0 || jj < 0 || i >= w || jj >= h) continue;
      const k = jj * w + i;
      for (let l = 0; l < layN[k]; l++) {
        const d = Math.abs(layH[k * maxLayers + l] - y) + Math.hypot(di, dj) * cell * 0.5;
        if (d < bd && Math.abs(layH[k * maxLayers + l] - y) < 2.0) { bd = d; best = k * maxLayers + l; }
      }
    }
    return best;
  };
  let seeded = 0;
  for (const s of seeds) {
    const id = seedLayer(s[0], s[1], s[2]);
    if (id >= 0 && !reach[id]) { reach[id] = 1; queue[qt++] = id; seeded++; }
  }
  if (!seeded) { // no seeds: everything with a layer is "reachable" (lowest layer)
    for (let k = 0; k < nCell; k++) if (layN[k]) { reach[k * maxLayers] = 1; }
  } else {
    const blockedBetween = (x0, y0, z0, x1, y1, z1) => {
      const a = _v.set(x0, y0 + 0.45, z0);
      const dx = x1 - x0, dy = (y1 + 0.45) - (y0 + 0.45), dz = z1 - z0;
      const len = Math.hypot(dx, dy, dz);
      _ray.origin.copy(a); _ray.direction.set(dx / len, dy / len, dz / len);
      return !!bvh.raycastFirst(_ray, THREE.DoubleSide, 0, len);
    };
    const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (qh < qt) {
      const id = queue[qh++];
      const k = (id / maxLayers) | 0, l = id % maxLayers;
      const i = k % w, jj = (k / w) | 0;
      const hy = layH[id];
      const x = bx0 + (i + 0.5) * cell, z = bz0 + (jj + 0.5) * cell;
      for (const [di, dj] of N8) {
        const ni = i + di, nj = jj + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const nk = nj * w + ni;
        for (let nl = 0; nl < layN[nk]; nl++) {
          const nid = nk * maxLayers + nl;
          if (reach[nid]) continue;
          const nh = layH[nid];
          if (Math.abs(nh - hy) > step) continue;
          if (blockedBetween(x, hy, z, bx0 + (ni + 0.5) * cell, nh, bz0 + (nj + 0.5) * cell)) continue;
          reach[nid] = 1; queue[qt++] = nid;
        }
      }
      void l;
    }
  }
  const heights = new Float32Array(nCell), flags = new Uint8Array(nCell);
  let walk = 0;
  for (let k = 0; k < nCell; k++) {
    let chosen = -1;
    for (let l = 0; l < layN[k]; l++) if (reach[k * maxLayers + l]) { chosen = l; break; }
    if (chosen >= 0) { heights[k] = layH[k * maxLayers + chosen]; flags[k] = 1; walk++; }
    else heights[k] = layN[k] ? layH[k * maxLayers] : by0;
  }
  // annotations
  for (const a of o.areas || []) {
    const bit = { walk: 1, water: 2, climb: 4, block: 8 }[a.flag];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of a.poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    for (let jj = Math.max(0, Math.floor((z0 - bz0) / cell)); jj <= Math.min(h - 1, Math.floor((z1 - bz0) / cell)); jj++) {
      for (let i = Math.max(0, Math.floor((x0 - bx0) / cell)); i <= Math.min(w - 1, Math.floor((x1 - bx0) / cell)); i++) {
        const x = bx0 + (i + 0.5) * cell, z = bz0 + (jj + 0.5) * cell;
        if (!pointInPoly([x, z], a.poly)) continue;
        const k = jj * w + i;
        if (heights[k] < a.y0 || heights[k] > a.y1) continue;
        if (a.flag === 'block') flags[k] = (flags[k] & ~1) | 8;
        else flags[k] |= bit;
      }
    }
  }
  void cellOf;
  return {
    json: { origin: [+bx0.toFixed(3), +bz0.toFixed(3)], cell, w, h, agent: { height: agentH, radius: agentR, step, maxSlope }, walkable: walk },
    heights, flags,
    bin() {
      const buf = Buffer.alloc(nCell * 5);
      Buffer.from(heights.buffer).copy(buf, 0);
      Buffer.from(flags.buffer).copy(buf, nCell * 4);
      return buf;
    },
  };
}

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
