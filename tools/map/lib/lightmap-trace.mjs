// Lightmap baker - ray tracing kernels. Runs inside worker_threads (and in the main thread when
// workers = 1). Everything lives in flat (Shared)ArrayBuffers; the hot loops allocate nothing and copy the
// module-level views into locals (V8 keeps them in registers / hoists the bounds checks).
//
// BVH: the packed node buffer of three-mesh-bvh 0.9 (non-indirect mode):
//   node = 8 x uint32: float32 minX minY minZ maxX maxY maxZ, then
//     leaf:     uint32[6] = triangle offset, uint16[14] = count, uint16[15] = 0xFFFF
//     internal: uint32[6] = right child offset (in nodes, relative), uint32[7] = split axis; left = next node
// Triangles are stored in BVH order as v0, e1 = v1 - v0, e2 = v2 - v0 (9 floats).
// Barycentrics everywhere are (u, v) = weights of (v1, v2), like Moller-Trumbore.
//
// Per-texel outputs (indexed by texel id):
//   O_VIS    f32  sun visibility 0..1 (soft: sun cone x texel footprint)
//   O_SKY1   rgb  pass-A sky irradiance (few samples, only feeds the bounce source)
//   O_LIGHTS rgb  baked point / spot light irradiance
//   O_BACK   u8   fraction of hemisphere rays that hit a back face x 255 (texel inside geometry)
//   O_IND    rgb  pass-B sky + bounce irradiance (the indirect term of the final lightmap)
//   O_VAR    f32  variance of the pass-B estimate (denoiser guide)

let NF, NU32, NU16;            // node views
let TRI, TN, TUV, TMAT, TATL;  // per-triangle data (BVH order)
let MATS;                      // per material: albedo rgb, emissive rgb, transmission, doubleSided
let TEX_TRI, TEX_BARY;         // per texel
let O_VIS, O_SKY1, O_LIGHTS, O_BACK, O_IND, O_VAR, VALID;
let SKY, SKY_W, SKY_H, IRR, IRR_W, IRR_H;
let P;                         // params
let LIGHTS, NLIGHTS;
let ATLAS = [];                // [{ w, h, E: Float32Array rgb }]
let HAMX, HAMY;                // hemisphere point sets (pass A / pass B)
let HAMX2, HAMY2;
let TRANS_ANY = false;
let sunL, sunT, sunB;

const STACK = new Int32Array(256);
const PI = Math.PI;
const TMIN = 1e-7;
/** Closest-hit result: t, u, v, det (det < 0: hit from behind). */
export const HIT = new Float64Array(4);
/** Rays traced by this thread (for the Mrays/s log). */
export let rayCount = 0;

// ---------------------------------------------------------------- rng
let rs = 1;
function seed(i, p) {
  let h = Math.imul(i ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(p + 0x6b43a9b5, 0x85EBCA77);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  rs = h | 0 || 0x1234567;
}
function rnd() {
  rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5;
  return (rs >>> 0) * 2.3283064365386963e-10;
}

function radicalInverse(i) {
  let b = i >>> 0;
  b = ((b << 16) | (b >>> 16)) >>> 0;
  b = (((b & 0x55555555) << 1) | ((b & 0xaaaaaaaa) >>> 1)) >>> 0;
  b = (((b & 0x33333333) << 2) | ((b & 0xcccccccc) >>> 2)) >>> 0;
  b = (((b & 0x0f0f0f0f) << 4) | ((b & 0xf0f0f0f0) >>> 4)) >>> 0;
  b = (((b & 0x00ff00ff) << 8) | ((b & 0xff00ff00) >>> 8)) >>> 0;
  return b * 2.3283064365386963e-10;
}
function hammersley(n) {
  const x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = (i + 0.5) / n; y[i] = radicalInverse(i); }
  return [x, y];
}

// ---------------------------------------------------------------- setup
export function init(S) {
  NF = new Float32Array(S.nodes); NU32 = new Uint32Array(S.nodes); NU16 = new Uint16Array(S.nodes);
  TRI = new Float32Array(S.tri); TN = new Float32Array(S.triN); TUV = new Float32Array(S.triUV);
  TMAT = new Int32Array(S.triMat); TATL = new Int32Array(S.triAtlas);
  MATS = new Float32Array(S.mats);
  TEX_TRI = new Int32Array(S.texTri); TEX_BARY = new Float32Array(S.texBary);
  O_VIS = new Float32Array(S.outVis); O_SKY1 = new Float32Array(S.outSky1); O_LIGHTS = new Float32Array(S.outLights);
  O_BACK = new Uint8Array(S.outBack); O_IND = new Float32Array(S.outInd);
  O_VAR = new Float32Array(S.outVar); VALID = new Uint8Array(S.valid);
  SKY = new Float32Array(S.sky); SKY_W = S.skyW; SKY_H = S.skyH;
  IRR = new Float32Array(S.irr); IRR_W = S.irrW; IRR_H = S.irrH;
  P = S.params;
  LIGHTS = new Float32Array(S.lights); NLIGHTS = P.nLights;
  [HAMX, HAMY] = hammersley(P.skySamples1);
  [HAMX2, HAMY2] = hammersley(P.skySamples2);
  TRANS_ANY = false;
  for (let m = 0; m < MATS.length / 8; m++) if (MATS[m * 8 + 6] > 0) TRANS_ANY = true;
  sunL = P.sunDir;
  const f = onb(sunL[0], sunL[1], sunL[2]);
  sunT = [f[0], f[1], f[2]]; sunB = [f[3], f[4], f[5]];
}

export function setAtlases(list) {
  ATLAS = list.map((a) => ({ w: a.w, h: a.h, E: new Float32Array(a.E) }));
}

// Branchless ONB (Duff et al. 2017). Returns [tx,ty,tz,bx,by,bz].
const _onb = new Float64Array(6);
function onb(nx, ny, nz) {
  const s = nz >= 0 ? 1 : -1;
  const a = -1 / (s + nz), b = nx * ny * a;
  _onb[0] = 1 + s * nx * nx * a; _onb[1] = s * b; _onb[2] = -s * nx;
  _onb[3] = b; _onb[4] = s + ny * ny * a; _onb[5] = -ny;
  return _onb;
}

// ---------------------------------------------------------------- traversal
/**
 * Closest hit within (TMIN, tmax): returns the triangle (BVH order) or -1; HIT = [t, u, v, det].
 * Transmissive materials are passed through stochastically.
 */
export function intersect(ox, oy, oz, dx, dy, dz, tmax) {
  const nf = NF, nu32 = NU32, nu16 = NU16, tri = TRI, stack = STACK;
  if (dx > -1e-12 && dx < 1e-12) dx = dx < 0 ? -1e-12 : 1e-12;
  if (dy > -1e-12 && dy < 1e-12) dy = dy < 0 ? -1e-12 : 1e-12;
  if (dz > -1e-12 && dz < 1e-12) dz = dz < 0 ? -1e-12 : 1e-12;
  const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
  const negX = dx < 0, negY = dy < 0, negZ = dz < 0;
  // near / far slab offsets inside a node
  const nxo = negX ? 3 : 0, fxo = negX ? 0 : 3, nyo = negY ? 4 : 1, fyo = negY ? 1 : 4, nzo = negZ ? 5 : 2, fzo = negZ ? 2 : 5;
  let sp = 0;
  stack[sp++] = 0;
  let best = tmax, hit = -1, hu = 0, hv = 0, hd = 0;
  rayCount++;
  while (sp > 0) {
    const n = stack[--sp];
    let t0 = (nf[n + nxo] - ox) * ix, t1 = (nf[n + fxo] - ox) * ix;
    const ty0 = (nf[n + nyo] - oy) * iy, ty1 = (nf[n + fyo] - oy) * iy;
    if (ty0 > t0) t0 = ty0;
    if (ty1 < t1) t1 = ty1;
    const tz0 = (nf[n + nzo] - oz) * iz, tz1 = (nf[n + fzo] - oz) * iz;
    if (tz0 > t0) t0 = tz0;
    if (tz1 < t1) t1 = tz1;
    if (t0 > t1 || t1 < 0 || t0 > best) continue;
    const n16 = n * 2;
    if (nu16[n16 + 15] === 0xffff) {
      const off = nu32[n + 6], end = off + nu16[n16 + 14];
      for (let k = off; k < end; k++) {
        const b = k * 9;
        const e1x = tri[b + 3], e1y = tri[b + 4], e1z = tri[b + 5];
        const e2x = tri[b + 6], e2y = tri[b + 7], e2z = tri[b + 8];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-14 && det < 1e-14) continue;
        const inv = 1 / det;
        const tx = ox - tri[b], ty = oy - tri[b + 1], tz = oz - tri[b + 2];
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t <= TMIN || t >= best) continue;
        if (TRANS_ANY) { const tr = MATS[TMAT[k] * 8 + 6]; if (tr > 0 && rnd() < tr) continue; }
        best = t; hit = k; hu = u; hv = v; hd = det;
      }
    } else {
      const axis = nu32[n + 7];
      const right = n + nu32[n + 6] * 8, left = n + 8;
      const neg = axis === 0 ? negX : axis === 1 ? negY : negZ;
      if (neg) { stack[sp++] = left; stack[sp++] = right; } else { stack[sp++] = right; stack[sp++] = left; }
    }
  }
  HIT[0] = best; HIT[1] = hu; HIT[2] = hv; HIT[3] = hd;
  return hit;
}

/**
 * Any hit within (TMIN, tmax) - shadow rays. Returns 0 (clear), 1 (blocked) or 2 (the first hit found is the
 * back of a single-sided triangle: the origin is probably inside geometry).
 */
export function occluded(ox, oy, oz, dx, dy, dz, tmax) {
  const nf = NF, nu32 = NU32, nu16 = NU16, tri = TRI, stack = STACK, mats = MATS, tmat = TMAT;
  if (dx > -1e-12 && dx < 1e-12) dx = dx < 0 ? -1e-12 : 1e-12;
  if (dy > -1e-12 && dy < 1e-12) dy = dy < 0 ? -1e-12 : 1e-12;
  if (dz > -1e-12 && dz < 1e-12) dz = dz < 0 ? -1e-12 : 1e-12;
  const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
  const negX = dx < 0, negY = dy < 0, negZ = dz < 0;
  const nxo = negX ? 3 : 0, fxo = negX ? 0 : 3, nyo = negY ? 4 : 1, fyo = negY ? 1 : 4, nzo = negZ ? 5 : 2, fzo = negZ ? 2 : 5;
  let sp = 0;
  stack[sp++] = 0;
  rayCount++;
  while (sp > 0) {
    const n = stack[--sp];
    let t0 = (nf[n + nxo] - ox) * ix, t1 = (nf[n + fxo] - ox) * ix;
    const ty0 = (nf[n + nyo] - oy) * iy, ty1 = (nf[n + fyo] - oy) * iy;
    if (ty0 > t0) t0 = ty0;
    if (ty1 < t1) t1 = ty1;
    const tz0 = (nf[n + nzo] - oz) * iz, tz1 = (nf[n + fzo] - oz) * iz;
    if (tz0 > t0) t0 = tz0;
    if (tz1 < t1) t1 = tz1;
    if (t0 > t1 || t1 < 0 || t0 > tmax) continue;
    const n16 = n * 2;
    if (nu16[n16 + 15] === 0xffff) {
      const off = nu32[n + 6], end = off + nu16[n16 + 14];
      for (let k = off; k < end; k++) {
        const b = k * 9;
        const e1x = tri[b + 3], e1y = tri[b + 4], e1z = tri[b + 5];
        const e2x = tri[b + 6], e2y = tri[b + 7], e2z = tri[b + 8];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-14 && det < 1e-14) continue;
        const inv = 1 / det;
        const tx = ox - tri[b], ty = oy - tri[b + 1], tz = oz - tri[b + 2];
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t <= TMIN || t >= tmax) continue;
        const m = tmat[k] * 8;
        if (TRANS_ANY) { const tr = mats[m + 6]; if (tr > 0 && rnd() < tr) continue; }
        return det < 0 && mats[m + 7] === 0 ? 2 : 1;
      }
    } else {
      const axis = nu32[n + 7];
      const right = n + nu32[n + 6] * 8, left = n + 8;
      const neg = axis === 0 ? negX : axis === 1 ? negY : negZ;
      if (neg) { stack[sp++] = left; stack[sp++] = right; } else { stack[sp++] = right; stack[sp++] = left; }
    }
  }
  return 0;
}

// ---------------------------------------------------------------- sky
function skyLookup(dx, dy, dz, out, o) {
  const u = Math.atan2(dz, dx) * (0.5 / PI) + 0.5;
  const v = Math.asin(dy < -1 ? -1 : dy > 1 ? 1 : dy) * (1 / PI) + 0.5;
  let x = (u * SKY_W) | 0; if (x >= SKY_W) x = SKY_W - 1; if (x < 0) x = 0;
  let y = ((1 - v) * SKY_H) | 0; if (y >= SKY_H) y = SKY_H - 1; if (y < 0) y = 0;
  const k = (y * SKY_W + x) * 3;
  out[o] = SKY[k]; out[o + 1] = SKY[k + 1]; out[o + 2] = SKY[k + 2];
}
function irrLookup(nx, ny, nz, out, o) {
  const u = Math.atan2(nz, nx) * (0.5 / PI) + 0.5;
  const v = Math.asin(ny < -1 ? -1 : ny > 1 ? 1 : ny) * (1 / PI) + 0.5;
  let x = (u * IRR_W) | 0; if (x >= IRR_W) x = IRR_W - 1;
  let y = ((1 - v) * IRR_H) | 0; if (y >= IRR_H) y = IRR_H - 1; if (y < 0) y = 0;
  const k = (y * IRR_W + x) * 3;
  out[o] = IRR[k]; out[o + 1] = IRR[k + 1]; out[o + 2] = IRR[k + 2];
}

// ---------------------------------------------------------------- texel geometry
// Filled by texelGeom(): position, geometric normal, shading normal.
let px = 0, py = 0, pz = 0, gx = 0, gy = 0, gz = 0, nx = 0, ny = 0, nz = 0;
let curTri = 0, curBu = 0, curBv = 0;
function texelGeom(i) {
  const t = TEX_TRI[i];
  const bu = TEX_BARY[i * 2], bv = TEX_BARY[i * 2 + 1], bw = 1 - bu - bv;
  curTri = t; curBu = bu; curBv = bv;
  const b = t * 9;
  const e1x = TRI[b + 3], e1y = TRI[b + 4], e1z = TRI[b + 5];
  const e2x = TRI[b + 6], e2y = TRI[b + 7], e2z = TRI[b + 8];
  px = TRI[b] + e1x * bu + e2x * bv; py = TRI[b + 1] + e1y * bu + e2y * bv; pz = TRI[b + 2] + e1z * bu + e2z * bv;
  gx = e1y * e2z - e1z * e2y; gy = e1z * e2x - e1x * e2z; gz = e1x * e2y - e1y * e2x;
  let l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
  gx /= l; gy /= l; gz /= l;
  nx = TN[b] * bw + TN[b + 3] * bu + TN[b + 6] * bv;
  ny = TN[b + 1] * bw + TN[b + 4] * bu + TN[b + 7] * bv;
  nz = TN[b + 2] * bw + TN[b + 5] * bu + TN[b + 8] * bv;
  l = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (!(l > 1e-8) || (nx * gx + ny * gy + nz * gz) / l < 0.25) { nx = gx; ny = gy; nz = gz; } else { nx /= l; ny /= l; nz /= l; }
}

// Pixel -> barycentric mapping of the current triangle (for footprint jitter that stays on the triangle).
let jA = 0, jB = 0, jC = 0, jD = 0, jOk = false;
function jitterSetup() {
  const u = curTri * 6;
  const d1x = TUV[u + 2] - TUV[u], d1y = TUV[u + 3] - TUV[u + 1];
  const d2x = TUV[u + 4] - TUV[u], d2y = TUV[u + 5] - TUV[u + 1];
  const det = d1x * d2y - d2x * d1y;
  jOk = det > 1e-12 || det < -1e-12;
  if (!jOk) return;
  const id = 1 / det;
  // [du dv] = M [dx dy]
  jA = d2y * id; jB = -d2x * id; jC = -d1y * id; jD = d1x * id;
}

const tmp3 = new Float64Array(3);

// Hemisphere probe from the current texel frame (closest hits, so back faces are detected).
// Returns the number of back-face hits; hemiSky (rgb sum of escaped sky radiance) and hemiEsc (escaped rays).
const hemiSky = new Float64Array(3);
let hemiEsc = 0;
function hemiProbe(ox, oy, oz, S, step, r1, r2, wantSky) {
  const hx = HAMX, hy = HAMY, far = P.far;
  const f = onb(nx, ny, nz);
  const tx = f[0], ty = f[1], tz = f[2], bx = f[3], by = f[4], bz = f[5];
  let back = 0;
  hemiSky[0] = hemiSky[1] = hemiSky[2] = 0; hemiEsc = 0;
  for (let k = 0; k < S; k += step) {
    let u1 = hx[k] + r1; if (u1 >= 1) u1 -= 1;
    let u2 = hy[k] + r2; if (u2 >= 1) u2 -= 1;
    const r = Math.sqrt(u1), phi = 2 * PI * u2;
    const lx = r * Math.cos(phi), ly = r * Math.sin(phi), lz = Math.sqrt(1 - u1);
    const dx = tx * lx + bx * ly + nx * lz, dy = ty * lx + by * ly + ny * lz, dz = tz * lx + bz * ly + nz * lz;
    if (dx * gx + dy * gy + dz * gz <= 1e-4) continue;
    const h = intersect(ox, oy, oz, dx, dy, dz, far);
    if (h < 0) {
      hemiEsc++;
      if (wantSky) { skyLookup(dx, dy, dz, tmp3, 0); hemiSky[0] += tmp3[0]; hemiSky[1] += tmp3[1]; hemiSky[2] += tmp3[2]; }
    } else if (HIT[3] < 0 && MATS[TMAT[h] * 8 + 7] === 0) back++;
  }
  return back;
}

// Candidate sample positions inside the texel footprint (pixel offsets) for texels whose centre is inside geometry.
const CAND = [0.45, 0, -0.45, 0, 0, 0.45, 0, -0.45, 0.4, 0.4, -0.4, 0.4, 0.4, -0.4, -0.4, -0.4, 0.25, 0, -0.25, 0, 0, 0.25, 0, -0.25];

// ---------------------------------------------------------------- pass A: sun, lights, sky estimate, validity
export function passDirect(i0, i1) {
  const S1 = P.skySamples1, eps = P.eps, far = P.far;
  const sunOn = P.sunColor[0] + P.sunColor[1] + P.sunColor[2] > 0;
  const sunCos = P.sunCos, SS = P.sunSamples, jitter = P.jitter;
  const LS = P.lightSamples;
  const L = sunL, sT = sunT, sB = sunB;
  const thr = P.invalidThreshold;
  const probeStep = Math.max(1, Math.floor(S1 / 12));
  const tri = TRI;
  for (let i = i0; i < i1; i++) {
    seed(i, 1);
    texelGeom(i);
    let ox = px + gx * eps, oy = py + gy * eps, oz = pz + gz * eps;
    const r1 = rnd(), r2 = rnd();
    // --- sky estimate + inside-geometry test
    let back = hemiProbe(ox, oy, oz, S1, 1, r1, r2, true);
    if (back / S1 > thr && P.adjust) {
      // the texel centre is under / inside other geometry: look for a visible point in its footprint. Among the
      // visible candidates take the one that sees the least sky (a texel straddling a wall represents the room
      // side, never the sunlit outside), ties -> closest to the centre.
      jitterSetup();
      if (jOk) {
        const t9 = curTri * 9, bu0 = curBu, bv0 = curBv;
        let bestS = Infinity, bu = 0, bv = 0;
        for (let c = 0; c < CAND.length; c += 2) {
          let u = bu0 + jA * CAND[c] + jB * CAND[c + 1], v = bv0 + jC * CAND[c] + jD * CAND[c + 1];
          if (u < 0) u = 0; if (v < 0) v = 0;
          const s = u + v; if (s > 1) { u /= s; v /= s; }
          px = tri[t9] + tri[t9 + 3] * u + tri[t9 + 6] * v;
          py = tri[t9 + 1] + tri[t9 + 4] * u + tri[t9 + 7] * v;
          pz = tri[t9 + 2] + tri[t9 + 5] * u + tri[t9 + 8] * v;
          // quick reject: a point inside geometry sees a back face straight up its normal
          const qh = intersect(px + gx * eps, py + gy * eps, pz + gz * eps, nx, ny, nz, far);
          if (qh >= 0 && HIT[3] < 0 && MATS[TMAT[qh] * 8 + 7] === 0) continue;
          const nb = hemiProbe(px + gx * eps, py + gy * eps, pz + gz * eps, S1, probeStep, r1, r2, false);
          const ns = Math.ceil(S1 / probeStep);
          if (nb / ns > thr * 0.5) continue;
          const score = hemiEsc / ns + 0.02 * (CAND[c] * CAND[c] + CAND[c + 1] * CAND[c + 1]);
          if (score < bestS) { bestS = score; bu = u; bv = v; }
        }
        if (bestS < Infinity) {
          TEX_BARY[i * 2] = bu; TEX_BARY[i * 2 + 1] = bv;
          texelGeom(i);
          ox = px + gx * eps; oy = py + gy * eps; oz = pz + gz * eps;
          back = hemiProbe(ox, oy, oz, S1, 1, r1, r2, true);
        } else texelGeom(i);
      }
    }
    const ks = PI / S1;
    O_SKY1[i * 3] = hemiSky[0] * ks; O_SKY1[i * 3 + 1] = hemiSky[1] * ks; O_SKY1[i * 3 + 2] = hemiSky[2] * ks;
    O_BACK[i] = Math.round((back / S1) * 255);

    // --- sun: jittered over the texel footprint (clamped to the triangle) and the sun disc
    let vis = 0;
    const ndl = nx * L[0] + ny * L[1] + nz * L[2];
    const gdl = gx * L[0] + gy * L[1] + gz * L[2];
    if (sunOn && gdl > -0.05 && ndl > 0) {
      let cnt = 0, sum = 0;
      const sx = rnd(), sy = rnd(), sa = rnd(), sbb = rnd();
      if (jitter) jitterSetup();
      const b9 = curTri * 9;
      for (let k = 0; k < SS; k++) {
        let qx = px, qy = py, qz = pz;
        if (jitter && jOk && k > 0) {
          let ja = 0.5 + k * 0.7548776662466927 + sx; ja -= Math.floor(ja);
          let jb = 0.5 + k * 0.5698402909980532 + sy; jb -= Math.floor(jb);
          ja -= 0.5; jb -= 0.5;
          let u = curBu + jA * ja + jB * jb, v = curBv + jC * ja + jD * jb;
          // clamp into the triangle (keeps samples on this surface; footprint beyond its edges is handled
          // by the neighbouring triangles' own texels)
          if (u < 0) u = 0; if (v < 0) v = 0;
          const s = u + v; if (s > 1) { u /= s; v /= s; }
          qx = tri[b9] + tri[b9 + 3] * u + tri[b9 + 6] * v;
          qy = tri[b9 + 1] + tri[b9 + 4] * u + tri[b9 + 7] * v;
          qz = tri[b9 + 2] + tri[b9 + 5] * u + tri[b9 + 8] * v;
        }
        let ua = (k + sa) / SS; if (ua >= 1) ua -= 1;
        let ub = radicalInverse(k) + sbb; if (ub >= 1) ub -= 1;
        const ct = 1 - ua * (1 - sunCos), st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = 2 * PI * ub;
        const c1 = Math.cos(ph) * st, c2 = Math.sin(ph) * st;
        const dx = L[0] * ct + sT[0] * c1 + sB[0] * c2;
        const dy = L[1] * ct + sT[1] * c1 + sB[1] * c2;
        const dz = L[2] * ct + sT[2] * c1 + sB[2] * c2;
        if (dx * gx + dy * gy + dz * gz <= 0) { cnt++; continue; }
        const occ = occluded(qx + gx * eps, qy + gy * eps, qz + gz * eps, dx, dy, dz, far);
        if (occ === 2 && k > 0) continue; // jittered point under other geometry: discard the sample
        cnt++;
        if (occ === 0) sum++;
        if (cnt === 4 && k < SS - 1 && (sum === 0 || sum === 4)) break; // adaptive: uniform texel
      }
      vis = cnt > 0 ? sum / cnt : 0;
    }
    O_VIS[i] = vis;

    // --- static point / spot lights
    let lr = 0, lg = 0, lb = 0;
    for (let l = 0; l < NLIGHTS; l++) {
      const o = l * 16;
      let vx = LIGHTS[o] - px, vy = LIGHTS[o + 1] - py, vz = LIGHTS[o + 2] - pz;
      const d2 = vx * vx + vy * vy + vz * vz;
      const range = LIGHTS[o + 6];
      if (range > 0 && d2 >= range * range) continue;
      const d = Math.sqrt(d2) || 1e-6;
      vx /= d; vy /= d; vz /= d;
      const cn = vx * nx + vy * ny + vz * nz;
      if (cn <= 0 || vx * gx + vy * gy + vz * gz <= -0.05) continue;
      const decay = LIGHTS[o + 14];
      // three.js punctual falloff: 1 / max(d^decay, 0.01) x (1 - (d / range)^4)^2
      let fall = 1 / Math.max(Math.pow(d, decay), 0.01);
      if (range > 0) { const q = d / range, q4 = q * q * q * q; const s = Math.max(0, 1 - q4); fall *= s * s; }
      if (LIGHTS[o + 8] === 1) { // spot
        const ac = vx * LIGHTS[o + 9] + vy * LIGHTS[o + 10] + vz * LIGHTS[o + 11];
        const c0 = LIGHTS[o + 12], c1 = LIGHTS[o + 13];
        let s = (ac - c0) / Math.max(1e-6, c1 - c0); s = s < 0 ? 0 : s > 1 ? 1 : s;
        fall *= s * s * (3 - 2 * s);
        if (fall <= 0) continue;
      }
      const radius = LIGHTS[o + 7];
      let cnt = 0, sum = 0;
      for (let k = 0; k < LS; k++) {
        let tx2 = LIGHTS[o], ty2 = LIGHTS[o + 1], tz2 = LIGHTS[o + 2];
        if (radius > 0) {
          const z = 2 * rnd() - 1, a = 2 * PI * rnd(), rr = radius * Math.cbrt(rnd()), s = Math.sqrt(1 - z * z);
          tx2 += Math.cos(a) * s * rr; ty2 += Math.sin(a) * s * rr; tz2 += z * rr;
        }
        let dx = tx2 - ox, dy = ty2 - oy, dz = tz2 - oz;
        const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        dx /= dl; dy /= dl; dz /= dl;
        const occ = occluded(ox, oy, oz, dx, dy, dz, dl - 1e-3);
        cnt++;
        if (occ === 0) sum++;
        if (cnt === 2 && k < LS - 1 && (sum === 0 || sum === 2)) break;
      }
      const v = cnt ? sum / cnt : 0;
      const e = fall * cn * v;
      lr += LIGHTS[o + 3] * e; lg += LIGHTS[o + 4] * e; lb += LIGHTS[o + 5] * e;
    }
    O_LIGHTS[i * 3] = lr; O_LIGHTS[i * 3 + 1] = lg; O_LIGHTS[i * 3 + 2] = lb;
  }
}

// ---------------------------------------------------------------- pass B: sky + one bounce from the atlases
function atlasLookup(a, x, y, out, o) {
  const A = ATLAS[a];
  const W = A.w, H = A.h, E = A.E;
  let fx = x - 0.5, fy = y - 0.5;
  if (fx < 0) fx = 0; if (fy < 0) fy = 0;
  if (fx > W - 1.001) fx = W - 1.001; if (fy > H - 1.001) fy = H - 1.001;
  const x0 = fx | 0, y0 = fy | 0;
  const ax = fx - x0, ay = fy - y0;
  const k00 = (y0 * W + x0) * 3, k10 = k00 + 3, k01 = k00 + W * 3, k11 = k01 + 3;
  const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
  out[o] = E[k00] * w00 + E[k10] * w10 + E[k01] * w01 + E[k11] * w11;
  out[o + 1] = E[k00 + 1] * w00 + E[k10 + 1] * w10 + E[k01 + 1] * w01 + E[k11 + 1] * w11;
  out[o + 2] = E[k00 + 2] * w00 + E[k10 + 2] * w10 + E[k01 + 2] * w01 + E[k11 + 2] * w11;
}

const eq = new Float64Array(3);
/** Irradiance estimate at a hit on a non-lightmapped occluder: direct sun (1 shadow ray) + 60 % of open sky. */
function occluderIrradiance(hx, hy, hz, fnx, fny, fnz, out) {
  irrLookup(fnx, fny, fnz, out, 0);
  out[0] *= 0.6; out[1] *= 0.6; out[2] *= 0.6;
  const L = sunL, c = P.sunColor;
  const ndl = fnx * L[0] + fny * L[1] + fnz * L[2];
  if (ndl > 0 && c[0] + c[1] + c[2] > 0) {
    const e = P.eps;
    if (occluded(hx + fnx * e, hy + fny * e, hz + fnz * e, L[0], L[1], L[2], P.far) === 0) {
      out[0] += c[0] * ndl; out[1] += c[1] * ndl; out[2] += c[2] * ndl;
    }
  }
}

/** Writes O_IND (sky + bounce, rgb) and O_VAR (variance of the mean luminance) for valid texels. */
export function passBounce(i0, i1, passNo = 0) {
  const S2 = P.skySamples2, eps = P.eps, far = P.far;
  const invPi = 1 / PI;
  const hx = HAMX2, hy = HAMY2;
  const tuv = TUV, tatl = TATL, tmat = TMAT, mats = MATS, tri = TRI;
  for (let i = i0; i < i1; i++) {
    if (!VALID[i]) continue;
    seed(i, 7 + passNo * 3);
    texelGeom(i);
    const ox = px + gx * eps, oy = py + gy * eps, oz = pz + gz * eps;
    const f = onb(nx, ny, nz);
    const tx = f[0], ty = f[1], tz = f[2], bx = f[3], by = f[4], bz = f[5];
    const r1 = rnd(), r2 = rnd();
    let ar = 0, ag = 0, ab = 0, m1 = 0, m2 = 0;
    for (let k = 0; k < S2; k++) {
      let u1 = hx[k] + r1; if (u1 >= 1) u1 -= 1;
      let u2 = hy[k] + r2; if (u2 >= 1) u2 -= 1;
      const r = Math.sqrt(u1), phi = 2 * PI * u2;
      const lx = r * Math.cos(phi), ly = r * Math.sin(phi), lz = Math.sqrt(1 - u1);
      const dx = tx * lx + bx * ly + nx * lz, dy = ty * lx + by * ly + ny * lz, dz = tz * lx + bz * ly + nz * lz;
      if (dx * gx + dy * gy + dz * gz <= 1e-4) continue;
      let cr = 0, cg = 0, cb = 0;
      const ht = intersect(ox, oy, oz, dx, dy, dz, far);
      if (ht < 0) {
        skyLookup(dx, dy, dz, eq, 0);
        cr = eq[0]; cg = eq[1]; cb = eq[2];
      } else {
        const m = tmat[ht] * 8;
        if (!(HIT[3] < 0 && mats[m + 7] === 0)) { // back faces reflect nothing
          const a = tatl[ht];
          const hu = HIT[1], hv = HIT[2];
          if (a >= 0) {
            const u = ht * 6, w = 1 - hu - hv;
            const x = tuv[u] * w + tuv[u + 2] * hu + tuv[u + 4] * hv;
            const y = tuv[u + 1] * w + tuv[u + 3] * hu + tuv[u + 5] * hv;
            atlasLookup(a, x, y, eq, 0);
          } else {
            const b = ht * 9;
            const e1x = tri[b + 3], e1y = tri[b + 4], e1z = tri[b + 5], e2x = tri[b + 6], e2y = tri[b + 7], e2z = tri[b + 8];
            let fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
            const fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
            fx /= fl; fy /= fl; fz /= fl;
            if (fx * dx + fy * dy + fz * dz > 0) { fx = -fx; fy = -fy; fz = -fz; }
            const t = HIT[0];
            occluderIrradiance(ox + dx * t, oy + dy * t, oz + dz * t, fx, fy, fz, eq);
          }
          cr = mats[m] * invPi * eq[0] + mats[m + 3];
          cg = mats[m + 1] * invPi * eq[1] + mats[m + 4];
          cb = mats[m + 2] * invPi * eq[2] + mats[m + 5];
        }
      }
      ar += cr; ag += cg; ab += cb;
      const c = PI * (0.2126 * cr + 0.7152 * cg + 0.0722 * cb);
      m1 += c; m2 += c * c;
    }
    const ks = PI / S2;
    O_IND[i * 3] = ar * ks; O_IND[i * 3 + 1] = ag * ks; O_IND[i * 3 + 2] = ab * ks;
    const mean = m1 / S2;
    O_VAR[i] = Math.max(0, m2 / S2 - mean * mean) / S2;
  }
}

/** Texel frame for post-processing: out = [px,py,pz, nx,ny,nz]. */
export function texelFrame(i, out) {
  texelGeom(i);
  out[0] = px; out[1] = py; out[2] = pz; out[3] = nx; out[4] = ny; out[5] = nz;
  return out;
}

export function takeRayCount() { const r = rayCount; rayCount = 0; return r; }

export const kernels = { passDirect, passBounce };
