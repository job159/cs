// Hard-surface / soft-gear mesh kit for character builds (tools/assets/characters/*). Everything here is local to the
// character pipeline; the shared zombie lib (tools/assets/zombies/lib) is only imported read-only.
//
//   MeshPart      a skinned mesh part with the same toRender() contract as the lib's Part (exportCharacter accepts it)
//   Builder       collects pieces (panels, straps, cylinders, free grids) into one MeshPart; each piece belongs to a
//                 texture "zone" (its own rectangle of the part's atlas) and carries a skin-weight function
//   packZones     shelf-packs the zones into an atlas at a common texel density
//   paintAtlas    rasterises the atlas, evaluates each zone's paint(P, N, lu, lv) on the rest-pose surface and
//                 returns albedo / normal / ORM images (+ optional ray-traced AO)
//   appendClips   appends glTF animations to a GLB written by the lib's writer (bone nodes = 1 + bone index)
import fs from 'node:fs';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { boneSegment } from '../zombies/lib/rig.mjs';
import { rasterUV, texelSurface } from '../zombies/lib/raster.mjs';
import { createImage, normalFromHeight, blurField } from '../zombies/lib/image.mjs';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const S2L = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
export const lin = (rgb) => rgb.map((v) => S2L[Math.max(0, Math.min(255, Math.round(v)))]);
export const toByte = (x) => { x = Math.max(0, x); const s = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); };
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
export const S2LUT = S2L;

/** A skinned mesh part (positions in glTF metres, rest pose) compatible with exportCharacter(). */
export class MeshPart {
  constructor(name, role = 'gear') {
    this.name = name; this.role = role;
    this.material = { name: role };
    this.extras = {};
    this.P = []; this.N = []; this.UV = []; this.J = []; this.W = []; this.I = []; this.Z = []; // Z = zone id per vertex
  }
  get vcount() { return this.P.length / 3; }
  triCount() { return this.I.length / 3; }
  /** Flat render buffers (vertices are already split wherever normals / uvs differ). */
  toRender() {
    const n = this.vcount;
    const joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4), seg = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) { joints[i * 4 + k] = this.J[i * 4 + k]; weights[i * 4 + k] = this.W[i * 4 + k]; }
      seg[i] = this.SEG ? this.SEG[i] : 0;
    }
    return {
      position: Float32Array.from(this.P), normal: Float32Array.from(this.N), uv: Float32Array.from(this.UV),
      joints, weights, seg, index: Uint32Array.from(this.I), src: Int32Array.from({ length: n }, (_, i) => i),
    };
  }
}

/** Normalised top-4 weight list from [[boneIndex, w], ...]. */
function normWeights(list) {
  const m = new Map();
  for (const [b, w] of list) if (w > 0) m.set(b, (m.get(b) || 0) + w);
  let l = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const s = l.reduce((a, [, w]) => a + w, 0) || 1;
  l = l.map(([b, w]) => [b, w / s]);
  while (l.length < 4) l.push([0, 0]);
  return l;
}

/**
 * Collects pieces into a MeshPart. Every piece: positions + optional normals (computed smooth per piece otherwise),
 * local uvs in [0,1]^2 of its zone, triangles, and a weight function wfn(p) -> [[boneIndex, w], ...].
 */
export class Builder {
  constructor(skeleton) {
    this.sk = skeleton; // human.skeleton ({bones, byName})
    this.zones = [];    // {id, name, w, h (metres), paint, rect}
    this.pieces = [];
  }
  bone(name) { const b = this.sk.byName[name]; if (!b) throw new Error('no bone ' + name); return b.index; }
  /** Rigid to one bone, or a fixed blend {bone: w}. */
  rigid(spec) {
    if (typeof spec === 'string') { const i = this.bone(spec); return () => [[i, 1]]; }
    const l = Object.entries(spec).map(([b, w]) => [this.bone(b), w]);
    return () => l;
  }
  zone(name, w, h, paint, o = {}) {
    const z = { id: this.zones.length, name, w: Math.max(0.005, w), h: Math.max(0.005, h), paint, ...o };
    this.zones.push(z);
    return z;
  }
  /** Adds a raw piece: verts [{p: Vector3, n?: Vector3, uv: [u,v]}], tris [[a,b,c]...], zone, wfn. */
  piece(verts, tris, zone, wfn, o = {}) {
    this.pieces.push({ verts, tris, zone, wfn, smooth: o.smooth !== false, tag: o.tag });
    return this.pieces[this.pieces.length - 1];
  }
  /**
   * Parametric grid surface: fn(u, v) -> Vector3 (u, v in [0,1]); nu x nv quads; uv = (u, v) of the zone (or uvfn).
   * closeU: the last column wraps to the first (positions shared visually, uv seam kept).
   */
  grid(nu, nv, fn, zone, wfn, o = {}) {
    const verts = [], tris = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      verts.push({ p: fn(u, v), uv: o.uvfn ? o.uvfn(u, v) : [u, v] });
    }
    const id = (i, j) => j * (nu + 1) + i;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
      if (o.flip) { tris.push([a, c, b], [a, d, c]); } else { tris.push([a, b, c], [a, c, d]); }
    }
    return this.piece(verts, tris, zone, wfn, o);
  }
  /** Assembles everything into a MeshPart (uv rects must be packed first). */
  build(name, role = 'gear') {
    const m = new MeshPart(name, role);
    for (const pc of this.pieces) {
      const base = m.vcount;
      const P = pc.verts.map((v) => v.p);
      let N = pc.verts.map((v) => v.n || null);
      if (N.some((n) => !n)) {
        const acc = P.map(() => V3());
        for (const [a, b, c] of pc.tris) {
          const e1 = P[b].clone().sub(P[a]), e2 = P[c].clone().sub(P[a]);
          const fn = e1.cross(e2);
          acc[a].add(fn); acc[b].add(fn); acc[c].add(fn);
        }
        if (pc.smooth) {
          // weld coincident positions for smoothing (uv seams of closed shapes)
          const key = (p) => `${Math.round(p.x * 2e4)},${Math.round(p.y * 2e4)},${Math.round(p.z * 2e4)}`;
          const sum = new Map();
          P.forEach((p, i) => { const k = key(p); sum.set(k, (sum.get(k) || V3()).add(acc[i])); });
          N = N.map((n, i) => n || sum.get(key(P[i])).clone().normalize());
        } else N = N.map((n, i) => n || acc[i].clone().normalize());
      }
      const r = pc.zone.rect;
      pc.verts.forEach((v, i) => {
        const p = P[i], n = N[i].lengthSq() > 0 ? N[i] : V3(0, 1, 0);
        m.P.push(p.x, p.y, p.z); m.N.push(n.x, n.y, n.z);
        const u = clamp01(v.uv[0]), w = clamp01(v.uv[1]);
        // zone rects are in atlas fractions, glTF uv convention (v down)
        m.UV.push(r.u0 + (r.u1 - r.u0) * u, r.v0 + (r.v1 - r.v0) * (1 - w));
        const wl = normWeights(v.w || pc.wfn(p));
        for (const [b, ww] of wl) { m.J.push(b); m.W.push(ww); }
        m.Z.push(pc.zone.id);
      });
      for (const [a, b, c] of pc.tris) m.I.push(base + a, base + b, base + c);
    }
    m.SEG = new Uint8Array(m.vcount);
    for (let i = 0; i < m.vcount; i++) m.SEG[i] = boneSegment(this.sk.bones[m.J[i * 4]].name);
    m.zones = this.zones;
    return m;
  }
}

/** Shelf-packs zones (sizes in metres) into an S x S atlas at the largest uniform density that fits. */
export function packZones(zones, S, { pad = 6, min = 8 } = {}) {
  const tryPack = (d) => {
    const items = zones.map((z) => ({ z, w: Math.max(min, Math.ceil(z.w * d * (z.scale || 1))) + pad * 2, h: Math.max(min, Math.ceil(z.h * d * (z.scale || 1))) + pad * 2 }));
    items.sort((a, b) => b.h - a.h);
    let x = 0, y = 0, rowH = 0;
    for (const it of items) {
      if (it.w > S) return null;
      if (x + it.w > S) { x = 0; y += rowH; rowH = 0; }
      it.x = x; it.y = y; x += it.w; rowH = Math.max(rowH, it.h);
    }
    if (y + rowH > S) return null;
    return items;
  };
  let lo = 10, hi = 5000, best = null;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    const r = tryPack(mid);
    if (r) { best = { d: mid, items: r }; lo = mid; } else hi = mid;
  }
  for (const it of best.items) {
    it.z.rect = { u0: (it.x + pad) / S, v0: (it.y + pad) / S, u1: (it.x + it.w - pad) / S, v1: (it.y + it.h - pad) / S, px: it };
  }
  return best.d;
}

/** Triangle list + per-vertex arrays of a MeshPart in the lib raster format (tris = [v,t,v,t,v,t]). */
export function rasterInput(m, onlyZones = null) {
  const tris = [];
  for (let i = 0; i < m.I.length; i += 3) {
    const a = m.I[i], b = m.I[i + 1], c = m.I[i + 2];
    if (onlyZones && !onlyZones.has(m.Z[a])) continue;
    tris.push(a, a, b, b, c, c);
  }
  // lib raster expects OBJ-convention uvs (v up)
  const uvs = new Float32Array(m.UV.length);
  for (let i = 0; i < m.UV.length; i += 2) { uvs[i] = m.UV[i]; uvs[i + 1] = 1 - m.UV[i + 1]; }
  return { tris: Int32Array.from(tris), uvs, pos: Float32Array.from(m.P), nrm: Float32Array.from(m.N) };
}

/** BVH over triangles of several meshes given as {pos, tris(lib format)} or MeshPart. */
export function bvhOf(list) {
  let n = 0;
  const srcs = list.map((s) => (s instanceof MeshPart ? rasterInput(s) : s));
  for (const s of srcs) n += s.tris.length / 6;
  const arr = new Float32Array(n * 9);
  let o = 0;
  for (const { pos, tris } of srcs) for (let i = 0; i < tris.length; i += 2) { const v = tris[i] * 3; arr[o++] = pos[v]; arr[o++] = pos[v + 1]; arr[o++] = pos[v + 2]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  return new MeshBVH(g);
}

/** Cosine-weighted AO tracer (returns fn(P, N, i) -> 0..1 visibility). */
export function aoTracer(bvh, { rays = 16, maxDist = 0.1, near = 0.002 } = {}) {
  const dirs = [];
  for (let k = 0; k < rays; k++) {
    const u = (k + 0.5) / rays;
    let v = 0, f = 0.5, m = k + 1;
    while (m) { v += f * (m & 1); m >>= 1; f *= 0.5; }
    const s = Math.sqrt(u);
    dirs.push([s * Math.cos(2 * Math.PI * v), s * Math.sin(2 * Math.PI * v), Math.sqrt(1 - u)]);
  }
  const ray = new THREE.Ray();
  const hash = (i) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
  return (P, Nn, i) => {
    const ax = Math.abs(Nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let t = [ax[1] * Nn[2] - ax[2] * Nn[1], ax[2] * Nn[0] - ax[0] * Nn[2], ax[0] * Nn[1] - ax[1] * Nn[0]];
    const tl = Math.hypot(...t) || 1; t = t.map((x) => x / tl);
    const b = [Nn[1] * t[2] - Nn[2] * t[1], Nn[2] * t[0] - Nn[0] * t[2], Nn[0] * t[1] - Nn[1] * t[0]];
    const a = hash(i) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    let occ = 0;
    ray.origin.set(P[0] + Nn[0] * near, P[1] + Nn[1] * near, P[2] + Nn[2] * near);
    for (const d of dirs) {
      const x = d[0] * ca - d[1] * sa, y = d[0] * sa + d[1] * ca, z = d[2];
      ray.direction.set(t[0] * x + b[0] * y + Nn[0] * z, t[1] * x + b[1] * y + Nn[1] * z, t[2] * x + b[2] * y + Nn[2] * z);
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, maxDist);
      if (hit) occ += 1 - (hit.distance / maxDist) ** 0.75;
    }
    return 1 - occ / rays;
  };
}

/**
 * Paints a MeshPart's zone atlas. zone.paint(P, N, lu, lv, out) fills out = {c:[r,g,b] linear, ro, me, h, ao}
 * (h = height in texel units for the normal map; ao multiplies the baked AO). Returns {albedo, normal, orm}.
 * o.ao: {bvh, rays, maxDist, size, strength}
 */
export function paintAtlas(m, S, o = {}) {
  const { tris, uvs, pos, nrm } = rasterInput(m);
  const r = rasterUV(tris, uvs, S, o.pad ?? 6);
  const albedo = createImage(S, S, o.fill || [90, 90, 90, 255]);
  const height = new Float32Array(S * S);
  const rough = new Float32Array(S * S).fill(0.8), metal = new Float32Array(S * S), aoF = new Float32Array(S * S).fill(1);
  const P = [0, 0, 0], Nn = [0, 0, 0];
  const out = { c: [0, 0, 0], ro: 0.8, me: 0, h: 0, ao: 1 };
  const zones = m.zones;
  for (let i = 0; i < S * S; i++) {
    if (!texelSurface(r, tris, pos, nrm, i, P, Nn)) continue;
    const t = r.tri[i];
    const z = zones[m.Z[tris[t * 6]]];
    const x = (i % S + 0.5) / S, y = (Math.floor(i / S) + 0.5) / S;
    const R = z.rect;
    const lu = (x - R.u0) / (R.u1 - R.u0), lv = 1 - (y - R.v0) / (R.v1 - R.v0); // local, v up
    out.c[0] = out.c[1] = out.c[2] = 0.2; out.ro = 0.8; out.me = 0; out.h = 0; out.ao = 1;
    z.paint(P, Nn, lu, lv, out, { S, R, x, y, zone: z });
    albedo.data[i * 4] = toByte(out.c[0]); albedo.data[i * 4 + 1] = toByte(out.c[1]); albedo.data[i * 4 + 2] = toByte(out.c[2]);
    height[i] = out.h; rough[i] = out.ro; metal[i] = out.me; aoF[i] = out.ao;
  }
  // baked AO (lower resolution, bilinear)
  let aoMap = null, AR = 0;
  if (o.ao) {
    AR = o.ao.size || 512;
    const ra = rasterUV(tris, uvs, AR, 3);
    const tr = aoTracer(o.ao.bvh, o.ao);
    aoMap = new Float32Array(AR * AR).fill(1);
    for (let i = 0; i < AR * AR; i++) if (texelSurface(ra, tris, pos, nrm, i, P, Nn)) aoMap[i] = tr(P, Nn, i);
    aoMap = blurField(aoMap, AR, AR, 1, 1);
  }
  const aoAt = (x, y) => {
    if (!aoMap) return 1;
    const fx = Math.max(0, Math.min(AR - 1.001, (x + 0.5) * AR / S - 0.5)), fy = Math.max(0, Math.min(AR - 1.001, (y + 0.5) * AR / S - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, k = y0 * AR + x0;
    return (aoMap[k] * (1 - tx) + aoMap[k + 1] * tx) * (1 - ty) + (aoMap[k + AR] * (1 - tx) + aoMap[k + AR + 1] * tx) * ty;
  };
  const strength = o.ao?.strength ?? 0.85;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const a = mix(1, aoAt(x, y), strength) * aoF[i];
    if (a < 1) for (let c = 0; c < 3; c++) albedo.data[i * 4 + c] = toByte(S2L[albedo.data[i * 4 + c]] * a);
    aoF[i] = a;
  }
  const NS = o.normalSize || S;
  const hS = NS === S ? height : down(height, S, NS);
  const normal = normalFromHeight(hS, NS, NS, (o.normalStrength ?? 1) * NS / 1024);
  const OS = o.ormSize || S;
  const orm = createImage(OS, OS, [255, 200, 0, 255]);
  const rS = OS === S ? rough : down(rough, S, OS), mS = OS === S ? metal : down(metal, S, OS), aS = OS === S ? aoF : down(aoF, S, OS);
  for (let i = 0; i < OS * OS; i++) {
    orm.data[i * 4] = Math.round(clamp01(mix(1, aS[i], 0.6)) * 255);
    orm.data[i * 4 + 1] = Math.round(clamp01(rS[i]) * 255);
    orm.data[i * 4 + 2] = Math.round(clamp01(mS[i]) * 255);
  }
  return { albedo, normal, orm, raster: r };
}

export function down(f, S, D) {
  if (S === D) return f;
  const k = S / D, out = new Float32Array(D * D);
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    let a = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) a += f[(y * k + j) * S + x * k + i];
    out[y * D + x] = a / (k * k);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ shapes

/** Squircle mapping of a square grid coordinate (s, t) in [-1,1]^2 onto a rounded rectangle (exponent n). */
export function squircle(s, t, n = 5) {
  const r = Math.max(Math.abs(s), Math.abs(t));
  if (r < 1e-9) return [0, 0];
  const a = Math.abs(s / r), b = Math.abs(t / r);
  const k = (a ** n + b ** n) ** (-1 / n);
  return [s * k, t * k];
}

/**
 * Thick rounded panel on a mid-surface. surf(x, y) -> {p, n} with (x, y) in metres of the panel plane (x right,
 * y up as seen from the front). half = [a, b] half sizes; th = thickness; n = squircle exponent; res = [nx, ny].
 * Zones: face (front), back (optional; null = no back face), edge (walls). Front faces +n.
 * bulge(x01, y01) -> extra outward offset of the front (pillowy pouches). Returns the rim ring points (front).
 */
export function panel(B, o) {
  const [a, b] = o.half, th = o.th, nexp = o.n ?? 6, [nx, ny] = o.res || [6, 6];
  const sq = (i, j) => squircle(i / nx * 2 - 1, j / ny * 2 - 1, nexp);
  const front = [], back = [];
  const fverts = [], bverts = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const [s, t] = sq(i, j);
    const x = s * a, y = t * b;
    const S = o.surf(x, y);
    const bul = o.bulge ? o.bulge(s, t) : 0;
    const pf = S.p.clone().addScaledVector(S.n, th / 2 + bul);
    const pb = S.p.clone().addScaledVector(S.n, -th / 2);
    fverts.push({ p: pf, uv: [s * 0.5 + 0.5, t * 0.5 + 0.5] });
    bverts.push({ p: pb, uv: [0.5 - s * 0.5, t * 0.5 + 0.5] });
    front.push(pf); back.push(pb);
  }
  const id = (i, j) => j * (nx + 1) + i;
  const ftris = [], btris = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const A = id(i, j), Bq = id(i + 1, j), C = id(i + 1, j + 1), D = id(i, j + 1);
    ftris.push([A, Bq, C], [A, C, D]);
    btris.push([A, C, Bq], [A, D, C]);
  }
  B.piece(fverts, ftris, o.face, o.wfn, { tag: o.tag });
  if (o.back) B.piece(bverts, btris, o.back, o.wfn, { tag: o.tag });
  // perimeter ring (counter-clockwise seen from the front: bottom row l->r, right col up, top row r->l, left col down)
  const ring = [];
  for (let i = 0; i < nx; i++) ring.push(id(i, 0));
  for (let j = 0; j < ny; j++) ring.push(id(nx, j));
  for (let i = nx; i > 0; i--) ring.push(id(i, ny));
  for (let j = ny; j > 0; j--) ring.push(id(0, j));
  if (o.edge) {
    const bev = o.bevel ?? th * 0.35;
    const verts = [], tris = [];
    let len = 0;
    const L = ring.length;
    const lens = [0];
    for (let k = 1; k <= L; k++) { len += front[ring[k % L]].distanceTo(front[ring[k - 1]]); lens.push(len); }
    // rounded edge: the front rim vertices and the edge wall share a normal that leans outwards, so the panel face
    // rolls over into the wall (soft chamfer highlight) instead of a hard faceted corner
    const round = o.round ?? 0.9;
    for (let k = 0; k <= L; k++) {
      const v = ring[k % L];
      const f = front[v], bk = back[v];
      // outward in-plane direction: from the panel centre line through this rim point, projected off the normal
      const mid = f.clone().add(bk).multiplyScalar(0.5);
      const nrm = f.clone().sub(bk).normalize();
      const prev = front[ring[(k - 1 + L) % L]], next = front[ring[(k + 1) % L]];
      const tan = next.clone().sub(prev).normalize();
      const out = tan.clone().cross(nrm).normalize(); // ccw ring -> outward
      const u = lens[k] / len;
      const nRim = round > 0 ? nrm.clone().addScaledVector(out, round).normalize() : null;
      if (nRim && k < L) fverts[v].n = nRim;
      verts.push({ p: f.clone().addScaledVector(out, -bev * 0.15), n: nRim || undefined, uv: [u, 1] });
      verts.push({ p: mid.clone().addScaledVector(out, bev), n: round > 0 ? out.clone().addScaledVector(nrm, 0.15).normalize() : undefined, uv: [u, 0.5] });
      verts.push({ p: bk.clone(), n: round > 0 ? out.clone().addScaledVector(nrm, -0.5).normalize() : undefined, uv: [u, 0] });
    }
    for (let k = 0; k < L; k++) {
      const a0 = k * 3, b0 = (k + 1) * 3;
      tris.push([a0, a0 + 1, b0 + 1], [a0, b0 + 1, b0], [a0 + 1, a0 + 2, b0 + 2], [a0 + 1, b0 + 2, b0 + 1]);
    }
    B.piece(verts, tris, o.edge, o.wfn, { tag: o.tag });
  }
  return { front, back, ring, id };
}

/**
 * Strap / band swept along a path: pts [Vector3], ups [Vector3] (outward normal at each point), width, thick.
 * Sides: top (outer face), edges; inner face only if o.inner. uv: u across the width, v along the length.
 */
export function strap(B, pts, ups, o) {
  const w = o.width / 2, t = o.thick;
  const n = pts.length;
  const lens = [0];
  for (let i = 1; i < n; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const L = lens[n - 1] || 1;
  const side = [];
  for (let i = 0; i < n; i++) {
    const tan = pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const up = ups[i].clone().addScaledVector(tan, -ups[i].dot(tan)).normalize();
    side.push({ tan, up, s: tan.clone().cross(up).normalize() });
  }
  const top = [], tt = [];
  const e1 = [], e2 = [], et = [];
  for (let i = 0; i < n; i++) {
    const { up, s } = side[i];
    const base = pts[i].clone().addScaledVector(up, o.lift ?? 0);
    const tl = base.clone().addScaledVector(up, t).addScaledVector(s, -w), tr = base.clone().addScaledVector(up, t).addScaledVector(s, w);
    const bl = base.clone().addScaledVector(s, -w), br = base.clone().addScaledVector(s, w);
    const v = lens[i] / L;
    top.push({ p: tl, uv: [0, v] }, { p: tr, uv: [1, v] });
    e1.push({ p: bl, uv: [0, v] }, { p: tl, uv: [0.08, v] });
    e2.push({ p: tr, uv: [0.92, v] }, { p: br, uv: [1, v] });
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = a + 2;
    tt.push([a, a + 1, b + 1], [a, b + 1, b]);
    et.push([a, a + 1, b + 1], [a, b + 1, b]);
  }
  B.piece(top, tt, o.zone, o.wfn, { tag: o.tag, smooth: true });
  B.piece(e1, et, o.edgeZone || o.zone, o.wfn, { tag: o.tag, smooth: false });
  B.piece(e2, et, o.edgeZone || o.zone, o.wfn, { tag: o.tag, smooth: false });
  if (o.inner) {
    const inn = [];
    for (let i = 0; i < n; i++) { const { s } = side[i]; inn.push({ p: pts[i].clone().addScaledVector(s, w), uv: [1, lens[i] / L] }, { p: pts[i].clone().addScaledVector(s, -w), uv: [0, lens[i] / L] }); }
    B.piece(inn, tt, o.zone, o.wfn, { tag: o.tag });
  }
  return L;
}

/** Cylinder from c along axis (unit) of length len, radius r (or [r0, r1]), sides; caps 'both'|'end'|'start'|null. */
export function cylinder(B, c, axis, r, len, o) {
  const sides = o.sides || 12;
  const r0 = Array.isArray(r) ? r[0] : r, r1 = Array.isArray(r) ? r[1] : r;
  const ax = axis.clone().normalize();
  const ref = Math.abs(ax.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0);
  const u = ref.clone().cross(ax).normalize(), v = ax.clone().cross(u).normalize();
  const verts = [], tris = [];
  for (let k = 0; k <= sides; k++) {
    const a = (k / sides) * Math.PI * 2;
    const d = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
    verts.push({ p: c.clone().addScaledVector(d, r0), n: d.clone(), uv: [k / sides, 0] });
    verts.push({ p: c.clone().addScaledVector(ax, len).addScaledVector(d, r1), n: d.clone(), uv: [k / sides, 1] });
  }
  for (let k = 0; k < sides; k++) { const a = k * 2, b = a + 2; tris.push([a, b, b + 1], [a, b + 1, a + 1]); }
  B.piece(verts, tris, o.zone, o.wfn, { tag: o.tag });
  for (const [end, rr, sign] of [['start', r0, -1], ['end', r1, 1]]) {
    if (!(o.caps === 'both' || o.caps === end)) continue;
    const cv = [], ct = [];
    const cc = end === 'start' ? c.clone() : c.clone().addScaledVector(ax, len);
    const nn = ax.clone().multiplyScalar(sign);
    cv.push({ p: cc.clone().addScaledVector(nn, o.capBulge || 0), n: nn.clone(), uv: [0.5, 0.5] });
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const d = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
      cv.push({ p: cc.clone().addScaledVector(d, rr), n: nn.clone(), uv: [0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5] });
    }
    for (let k = 1; k <= sides; k++) ct.push(sign > 0 ? [0, k, k + 1] : [0, k + 1, k]);
    B.piece(cv, ct, o.capZone || o.zone, o.wfn, { tag: o.tag, smooth: false });
  }
}

/** Rounded box (panel on a flat surface) centred at c with axes (ex right, ey up, ez out), size [w, h, d]. */
export function box(B, c, ex, ey, ez, size, o) {
  const [w, h, d] = size;
  return panel(B, {
    half: [w / 2, h / 2], th: d, n: o.n ?? 8, res: o.res || [2, 2],
    surf: (x, y) => ({ p: c.clone().addScaledVector(ex, x).addScaledVector(ey, y), n: ez.clone() }),
    face: o.face, back: o.back === undefined ? o.face : o.back, edge: o.edge || o.face, wfn: o.wfn, bevel: o.bevel ?? Math.min(w, h, d) * 0.12, bulge: o.bulge, tag: o.tag,
  });
}

// ------------------------------------------------------------------------------------------------ glTF animations

/**
 * Appends animation clips to a GLB written by the lib's writeGLB (node 0 = root, node 1 + i = bone i).
 * clips: [{name, fps, poses:[{q: Quaternion[] (per skel.names), root: Vector3}]}]; skel: anim-skeleton adapter with
 * names / boneIndex (index into the GLB's bone list). aliases: {alias: clipName} (shares the samplers' accessors).
 */
export function appendClips(file, skel, clips, { aliases = {}, rotTol = 0.0015, posTol = 0.0003 } = {}) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const binLen = buf.readUInt32LE(20 + jsonLen);
  const chunks = [buf.subarray(binStart, binStart + binLen)];
  let byteLength = binLen;
  const view = (arr) => {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); byteLength += pad; }
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: b.length });
    chunks.push(b); byteLength += b.length;
    return json.bufferViews.length - 1;
  };
  const accessor = (arr, type, minmax = false) => {
    const nc = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
    const acc = { bufferView: view(arr), componentType: 5126, count: arr.length / nc, type };
    if (minmax) {
      const mn = new Array(nc).fill(Infinity), mx = new Array(nc).fill(-Infinity);
      for (let i = 0; i < arr.length; i++) { const c = i % nc; mn[c] = Math.min(mn[c], arr[i]); mx[c] = Math.max(mx[c], arr[i]); }
      acc.min = mn; acc.max = mx;
    }
    json.accessors.push(acc);
    return json.accessors.length - 1;
  };
  json.animations ||= [];
  let keys = 0;
  const pel = skel.i('pelvis');
  const byName = new Map();
  for (const c of clips) {
    const anim = { name: c.name, channels: [], samplers: [] };
    const n = c.poses.length;
    const times = Float32Array.from({ length: n }, (_, f) => f / c.fps);
    const timeCache = new Map();
    const timeAcc = (idx) => { const k = idx.join(','); if (!timeCache.has(k)) timeCache.set(k, accessor(Float32Array.from(idx.map((f) => times[f])), 'SCALAR', true)); return timeCache.get(k); };
    skel.names.forEach((name, i) => {
      if (name === 'Root') return;
      const vals = c.poses.map((p) => p.q[i].toArray());
      // sign continuity
      for (let f = 1; f < n; f++) { const a = vals[f - 1], b = vals[f]; if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0) vals[f] = b.map((x) => -x); }
      const kept = reduceKeys(vals, true, rotTol);
      const out = new Float32Array(kept.length * 4);
      kept.forEach((f, k) => out.set(vals[f], k * 4));
      anim.samplers.push({ input: timeAcc(kept.length === 1 ? [0] : kept), output: accessor(out, 'VEC4'), interpolation: 'LINEAR' });
      anim.channels.push({ sampler: anim.samplers.length - 1, target: { node: 1 + skel.boneIndex[i], path: 'rotation' } });
      keys += kept.length;
    });
    const pv = c.poses.map((p) => p.root.toArray());
    let kept = reduceKeys(pv, false, posTol);
    if (kept.length === 1) kept = [0, n - 1];
    const out = new Float32Array(kept.length * 3);
    kept.forEach((f, k) => out.set(pv[f], k * 3));
    anim.samplers.push({ input: timeAcc(kept), output: accessor(out, 'VEC3'), interpolation: 'LINEAR' });
    anim.channels.push({ sampler: anim.samplers.length - 1, target: { node: 1 + skel.boneIndex[pel], path: 'translation' } });
    json.animations.push(anim);
    byName.set(c.name, anim);
  }
  for (const [alias, src] of Object.entries(aliases)) {
    const a = byName.get(src);
    if (a) json.animations.push({ name: alias, channels: a.channels.map((c) => ({ ...c, target: { ...c.target } })), samplers: a.samplers.map((s) => ({ ...s })) });
  }
  const bin = Buffer.concat(chunks);
  const binPad = Buffer.alloc((4 - (bin.length % 4)) % 4);
  json.buffers = [{ byteLength: bin.length + binPad.length }];
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length + binPad.length;
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length + binPad.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([head, jh, js, bh, bin, binPad]));
  return { bytes: total, keys };
}

/** Patches root/scene extras of a GLB in place (merge). */
export function patchExtras(file, extra) {
  const { json, bin } = readGLB(file);
  Object.assign(json.scenes[0].extras ||= {}, extra);
  Object.assign(json.nodes[0].extras ||= {}, extra);
  writeGLBFile(file, json, bin);
}

/** Reads a GLB: {json, bin}. */
function readGLB(file) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binLen = buf.readUInt32LE(20 + jsonLen);
  return { json, bin: buf.subarray(20 + jsonLen + 8, 20 + jsonLen + 8 + binLen) };
}

function writeGLBFile(file, json, bin) {
  const binPad = Buffer.alloc((4 - (bin.length % 4)) % 4);
  json.buffers = [{ byteLength: bin.length + binPad.length }];
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length + binPad.length;
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length + binPad.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([head, jh, js, bh, bin, binPad]));
}

/** Accessor / bufferView / binary sizes of a GLB before clips are appended (see stripClips). */
export function glbCounts(file) {
  const { json, bin } = readGLB(file);
  return { accessors: json.accessors.length, bufferViews: json.bufferViews.length, bin: bin.length };
}

/** Removes the clips appended by appendClips (everything past the recorded counts). */
export function stripClips(file, base) {
  const { json, bin } = readGLB(file);
  if (json.accessors.length < base.accessors || json.bufferViews.length < base.bufferViews || bin.length < base.bin) throw new Error('stripClips: GLB does not match animbase.json (rebuild fully)');
  delete json.animations;
  json.accessors.length = base.accessors;
  json.bufferViews.length = base.bufferViews;
  writeGLBFile(file, json, bin.subarray(0, base.bin));
}

/** Copies a file, retrying while the destination is locked (dev server / browser / scanner holding it open). */
export function copyRetry(src, dst, tries = 40) {
  for (let k = 0; ; k++) {
    try { fs.copyFileSync(src, dst); return; } catch (e) {
      if (k >= tries) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
}

/** Greedy key reduction (same idea as the zombie anim writer). */
function reduceKeys(vals, isQuat, tol) {
  const n = vals.length;
  const err = (a, b, u, ref) => {
    if (isQuat) {
      const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
      const m = a.map((v, i) => v * (1 - u) + s * b[i] * u); const l = Math.hypot(...m);
      const d = Math.abs(m[0] * ref[0] + m[1] * ref[1] + m[2] * ref[2] + m[3] * ref[3]) / l;
      return 2 * Math.acos(Math.min(1, d));
    }
    let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] * (1 - u) + b[i] * u - ref[i]));
    return d;
  };
  let constant = true;
  for (let f = 1; f < n && constant; f++) if (err(vals[0], vals[0], 0, vals[f]) > tol) constant = false;
  if (constant) return [0];
  const keep = [0];
  let a = 0;
  while (a < n - 1) {
    let b = a + 1;
    for (let c = a + 2; c < n; c++) {
      let ok = true;
      for (let m = a + 1; m < c && ok; m++) if (err(vals[a], vals[c], (m - a) / (c - a), vals[m]) > tol) ok = false;
      if (!ok) break;
      b = c;
    }
    keep.push(b);
    a = b;
  }
  return keep;
}
