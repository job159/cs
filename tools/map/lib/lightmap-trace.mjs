// Lightmap baker - ray tracing kernels. Runs inside worker_threads (and in the main thread when
// threads = 1). Everything lives in flat (Shared)ArrayBuffers; the hot loops allocate nothing.
//
// BVH: the packed node buffer of three-mesh-bvh 0.9 (non-indirect mode):
//   node = 8 x uint32: float32 minX minY minZ maxX maxY maxZ, then
//     leaf:     uint32[6] = triangle offset, uint16[14] = count, uint16[15] = 0xFFFF
//     internal: uint32[6] = right child offset (in nodes, relative), uint32[7] = split axis; left = next node
// Triangles are stored in BVH order as v0, e1 = v1 - v0, e2 = v2 - v0 (9 floats).
// Barycentrics everywhere are (u, v) = weights of (v1, v2), like Moller-Trumbore.

let NF, NU32, NU16;            // node views
let TRI, TN, TUV, TMAT, TATL;  // per-triangle data (BVH order)
let MATS;                      // per material: albedo rgb, emissive rgb, transmission, doubleSided
let TEX_TRI, TEX_BARY;         // per texel
let O_DIRECT, O_SKY1, O_LIGHTS, O_BACK, O_SKY2, O_BOUNCE, O_VAR, VALID;
let SKY, SKY_W, SKY_H, IRR, IRR_W, IRR_H;
let P;                         // params
let LIGHTS, NLIGHTS;
let ATLAS = [];                // [{ w, h, E: Float32Array rgb }]
let HAMX, HAMY;                // hemisphere sequences (pass A: [0, S1), pass B: separate arrays)
let HAMX2, HAMY2;
let TRANS_ANY = false;

const STACK = new Int32Array(256);
const PI = Math.PI;
const TMIN = 1e-7;

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
  O_DIRECT = new Float32Array(S.outDirect); O_SKY1 = new Float32Array(S.outSky1); O_LIGHTS = new Float32Array(S.outLights);
  O_BACK = new Float32Array(S.outBack); O_SKY2 = new Float32Array(S.outSky2); O_BOUNCE = new Float32Array(S.outBounce);
  O_VAR = new Float32Array(S.outVar); VALID = new Uint8Array(S.valid);
  SKY = new Float32Array(S.sky); SKY_W = S.skyW; SKY_H = S.skyH;
  IRR = new Float32Array(S.irr); IRR_W = S.irrW; IRR_H = S.irrH;
  P = S.params;
  LIGHTS = new Float32Array(S.lights); NLIGHTS = (LIGHTS.length / 16) | 0;
  [HAMX, HAMY] = hammersley(P.skySamples1);
  [HAMX2, HAMY2] = hammersley(P.skySamples2);
  TRANS_ANY = false;
  for (let m = 0; m < MATS.length / 8; m++) if (MATS[m * 8 + 6] > 0) TRANS_ANY = true;
  // sun frame
  const L = P.sunDir;
  sunL = L;
  const f = onb(L[0], L[1], L[2]);
  sunT = [f[0], f[1], f[2]]; sunB = [f[3], f[4], f[5]];
}
let sunL, sunT, sunB;

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
export let hitT = 0, hitTri = -1, hitU = 0, hitV = 0, hitDet = 0;

/** Closest hit within (TMIN, tmax). Stochastic pass-through for transmissive materials. */
export function intersect(ox, oy, oz, dx, dy, dz, tmax) {
  if (dx > -1e-12 && dx < 1e-12) dx = dx < 0 ? -1e-12 : 1e-12;
  if (dy > -1e-12 && dy < 1e-12) dy = dy < 0 ? -1e-12 : 1e-12;
  if (dz > -1e-12 && dz < 1e-12) dz = dz < 0 ? -1e-12 : 1e-12;
  const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
  const negX = dx < 0, negY = dy < 0, negZ = dz < 0;
  let sp = 0;
  STACK[sp++] = 0;
  let best = tmax;
  hitTri = -1;
  while (sp > 0) {
    const n = STACK[--sp];
    // slab test
    let t0 = ((negX ? NF[n + 3] : NF[n]) - ox) * ix;
    let t1 = ((negX ? NF[n] : NF[n + 3]) - ox) * ix;
    let ty0 = ((negY ? NF[n + 4] : NF[n + 1]) - oy) * iy;
    let ty1 = ((negY ? NF[n + 1] : NF[n + 4]) - oy) * iy;
    if (ty0 > t0) t0 = ty0;
    if (ty1 < t1) t1 = ty1;
    ty0 = ((negZ ? NF[n + 5] : NF[n + 2]) - oz) * iz;
    ty1 = ((negZ ? NF[n + 2] : NF[n + 5]) - oz) * iz;
    if (ty0 > t0) t0 = ty0;
    if (ty1 < t1) t1 = ty1;
    if (t0 > t1 || t1 < 0 || t0 > best) continue;
    const n16 = n * 2;
    if (NU16[n16 + 15] === 0xffff) {
      const off = NU32[n + 6], end = off + NU16[n16 + 14];
      for (let k = off; k < end; k++) {
        const b = k * 9;
        const e1x = TRI[b + 3], e1y = TRI[b + 4], e1z = TRI[b + 5];
        const e2x = TRI[b + 6], e2y = TRI[b + 7], e2z = TRI[b + 8];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-14 && det < 1e-14) continue;
        const inv = 1 / det;
        const tx = ox - TRI[b], ty = oy - TRI[b + 1], tz = oz - TRI[b + 2];
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t <= TMIN || t >= best) continue;
        if (TRANS_ANY) { const tr = MATS[TMAT[k] * 8 + 6]; if (tr > 0 && rnd() < tr) continue; }
        best = t; hitTri = k; hitU = u; hitV = v; hitDet = det;
      }
    } else {
      const axis = NU32[n + 7];
      const right = n + NU32[n + 6] * 8, left = n + 8;
      const neg = axis === 0 ? negX : axis === 1 ? negY : negZ;
      if (neg) { STACK[sp++] = left; STACK[sp++] = right; } else { STACK[sp++] = right; STACK[sp++] = left; }
    }
  }
  hitT = best;
  return hitTri >= 0;
}

/** True when the triangle was hit from behind and is not double sided (= ray started inside geometry). */
function hitBack() { return hitDet < 0 && MATS[TMAT[hitTri] * 8 + 7] === 0; }

// ---------------------------------------------------------------- sky
function skyLookup(dx, dy, dz, out, o) {
  let u = Math.atan2(dz, dx) * (0.5 / PI) + 0.5;
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
// Filled by texelGeom(): position, geometric normal, shading normal, d(position)/d(pixel x|y).
let px = 0, py = 0, pz = 0, gx = 0, gy = 0, gz = 0, nx = 0, ny = 0, nz = 0;
let jxx = 0, jxy = 0, jxz = 0, jyx = 0, jyy = 0, jyz = 0;
function texelGeom(i) {
  const t = TEX_TRI[i];
  const bu = TEX_BARY[i * 2], bv = TEX_BARY[i * 2 + 1], bw = 1 - bu - bv;
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
  // jacobian: [e1 e2] = J [d1 d2], d = uv deltas in pixels
  const u = t * 6;
  const d1x = TUV[u + 2] - TUV[u], d1y = TUV[u + 3] - TUV[u + 1];
  const d2x = TUV[u + 4] - TUV[u], d2y = TUV[u + 5] - TUV[u + 1];
  const det = d1x * d2y - d2x * d1y;
  if (det > 1e-12 || det < -1e-12) {
    const id = 1 / det;
    jxx = (e1x * d2y - e2x * d1y) * id; jxy = (e1y * d2y - e2y * d1y) * id; jxz = (e1z * d2y - e2z * d1y) * id;
    jyx = (e2x * d1x - e1x * d2x) * id; jyy = (e2y * d1x - e1y * d2x) * id; jyz = (e2z * d1x - e1z * d2x) * id;
  } else { jxx = jxy = jxz = jyx = jyy = jyz = 0; }
}

const tmp3 = new Float64Array(3);

// ---------------------------------------------------------------- pass A: direct light + sky + validity
/**
 * Writes per texel: O_DIRECT [rgb sun irradiance, sun visibility], O_SKY1 [rgb], O_LIGHTS [rgb], O_BACK [backface ratio].
 */
export function passDirect(i0, i1) {
  const S1 = P.skySamples1, eps = P.eps, far = P.far;
  const sunCol = P.sunColor, sunCos = P.sunCos, SS = P.sunSamples, jitter = P.jitter;
  const LS = P.lightSamples;
  const L = sunL;
  for (let i = i0; i < i1; i++) {
    seed(i, 1);
    texelGeom(i);
    const ox = px + gx * eps, oy = py + gy * eps, oz = pz + gz * eps;
    // --- sky (closest hit so back faces can be detected)
    const f = onb(nx, ny, nz);
    const tx = f[0], ty = f[1], tz = f[2], bx = f[3], by = f[4], bz = f[5];
    const r1 = rnd(), r2 = rnd();
    let sr = 0, sg = 0, sb = 0, back = 0;
    for (let k = 0; k < S1; k++) {
      let u1 = HAMX[k] + r1; if (u1 >= 1) u1 -= 1;
      let u2 = HAMY[k] + r2; if (u2 >= 1) u2 -= 1;
      const r = Math.sqrt(u1), phi = 2 * PI * u2;
      const lx = r * Math.cos(phi), ly = r * Math.sin(phi), lz = Math.sqrt(1 - u1);
      const dx = tx * lx + bx * ly + nx * lz, dy = ty * lx + by * ly + ny * lz, dz = tz * lx + bz * ly + nz * lz;
      if (dx * gx + dy * gy + dz * gz <= 1e-4) continue;
      if (!intersect(ox, oy, oz, dx, dy, dz, far)) {
        skyLookup(dx, dy, dz, tmp3, 0);
        sr += tmp3[0]; sg += tmp3[1]; sb += tmp3[2];
      } else if (hitBack()) back++;
    }
    const ks = PI / S1;
    O_SKY1[i * 3] = sr * ks; O_SKY1[i * 3 + 1] = sg * ks; O_SKY1[i * 3 + 2] = sb * ks;
    O_BACK[i] = back / S1;

    // --- sun: jittered over the texel footprint and the sun disc
    let vis = 0;
    const ndl = nx * L[0] + ny * L[1] + nz * L[2];
    const gdl = gx * L[0] + gy * L[1] + gz * L[2];
    if (sunCol[0] + sunCol[1] + sunCol[2] > 0 && gdl > -0.05 && ndl > 0) {
      let cnt = 0, sum = 0;
      const sx = rnd(), sy = rnd(), sa = rnd(), sbb = rnd();
      for (let k = 0; k < SS; k++) {
        let qx = px, qy = py, qz = pz;
        if (jitter) {
          let ja = 0.5 + k * 0.7548776662466927 + sx; ja -= Math.floor(ja);
          let jb = 0.5 + k * 0.5698402909980532 + sy; jb -= Math.floor(jb);
          ja -= 0.5; jb -= 0.5;
          qx += jxx * ja + jyx * jb; qy += jxy * ja + jyy * jb; qz += jxz * ja + jyz * jb;
        }
        let ua = (k + sa) / SS; if (ua >= 1) ua -= 1;
        let ub = radicalInverse(k) + sbb; if (ub >= 1) ub -= 1;
        const ct = 1 - ua * (1 - sunCos), st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = 2 * PI * ub;
        const c1 = Math.cos(ph) * st, c2 = Math.sin(ph) * st;
        const dx = L[0] * ct + sunT[0] * c1 + sunB[0] * c2;
        const dy = L[1] * ct + sunT[1] * c1 + sunB[1] * c2;
        const dz = L[2] * ct + sunT[2] * c1 + sunB[2] * c2;
        if (dx * gx + dy * gy + dz * gz <= 0) { cnt++; continue; }
        if (intersect(qx + gx * eps, qy + gy * eps, qz + gz * eps, dx, dy, dz, far)) {
          if (jitter && hitBack()) continue; // jittered point ended inside geometry: discard the sample
          cnt++;
        } else { cnt++; sum++; }
        if (cnt === 4 && k < SS - 1 && (sum === 0 || sum === 4)) break; // adaptive: uniform texel
      }
      vis = cnt > 0 ? sum / cnt : 0;
      if (cnt === 0) { // all jittered samples inside geometry - retry once from the texel centre
        vis = intersect(ox, oy, oz, L[0], L[1], L[2], far) ? 0 : 1;
      }
    }
    const es = Math.max(0, ndl) * vis;
    O_DIRECT[i * 4] = sunCol[0] * es; O_DIRECT[i * 4 + 1] = sunCol[1] * es; O_DIRECT[i * 4 + 2] = sunCol[2] * es;
    O_DIRECT[i * 4 + 3] = gdl > 0 || ndl > 0 ? vis : 0;

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
          // uniform point in a sphere (rejection-free: direction * cbrt)
          const z = 2 * rnd() - 1, a = 2 * PI * rnd(), rr = radius * Math.cbrt(rnd()), s = Math.sqrt(1 - z * z);
          tx2 += Math.cos(a) * s * rr; ty2 += Math.sin(a) * s * rr; tz2 += z * rr;
        }
        let dx = tx2 - ox, dy = ty2 - oy, dz = tz2 - oz;
        const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        dx /= dl; dy /= dl; dz /= dl;
        if (intersect(ox, oy, oz, dx, dy, dz, dl - 1e-3)) {
          if (hitBack() && hitT < 0.02) continue;
          cnt++;
        } else { cnt++; sum++; }
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
    const saveT = hitT, saveTri = hitTri, saveU = hitU, saveV = hitV, saveD = hitDet;
    if (!intersect(hx + fnx * e, hy + fny * e, hz + fnz * e, L[0], L[1], L[2], P.far)) {
      out[0] += c[0] * ndl; out[1] += c[1] * ndl; out[2] += c[2] * ndl;
    }
    hitT = saveT; hitTri = saveTri; hitU = saveU; hitV = saveV; hitDet = saveD;
  }
}

/** Writes O_SKY2, O_BOUNCE (rgb) and O_VAR (variance of the mean luminance) for valid texels. */
export function passBounce(i0, i1, passNo = 0) {
  const S2 = P.skySamples2, eps = P.eps, far = P.far;
  const invPi = 1 / PI;
  for (let i = i0; i < i1; i++) {
    if (!VALID[i]) continue;
    seed(i, 7 + passNo * 3);
    texelGeom(i);
    const ox = px + gx * eps, oy = py + gy * eps, oz = pz + gz * eps;
    const f = onb(nx, ny, nz);
    const tx = f[0], ty = f[1], tz = f[2], bx = f[3], by = f[4], bz = f[5];
    const r1 = rnd(), r2 = rnd();
    let sr = 0, sg = 0, sb = 0, br = 0, bg = 0, bb = 0, m1 = 0, m2 = 0;
    for (let k = 0; k < S2; k++) {
      let u1 = HAMX2[k] + r1; if (u1 >= 1) u1 -= 1;
      let u2 = HAMY2[k] + r2; if (u2 >= 1) u2 -= 1;
      const r = Math.sqrt(u1), phi = 2 * PI * u2;
      const lx = r * Math.cos(phi), ly = r * Math.sin(phi), lz = Math.sqrt(1 - u1);
      const dx = tx * lx + bx * ly + nx * lz, dy = ty * lx + by * ly + ny * lz, dz = tz * lx + bz * ly + nz * lz;
      if (dx * gx + dy * gy + dz * gz <= 1e-4) continue;
      let cr = 0, cg = 0, cb = 0;
      if (!intersect(ox, oy, oz, dx, dy, dz, far)) {
        skyLookup(dx, dy, dz, eq, 0);
        sr += eq[0]; sg += eq[1]; sb += eq[2];
        cr = eq[0]; cg = eq[1]; cb = eq[2];
      } else {
        const ht = hitTri;
        const m = TMAT[ht] * 8;
        if (hitDet < 0 && MATS[m + 7] === 0) { /* back face: no light */ } else {
          const a = TATL[ht];
          if (a >= 0) {
            const u = ht * 6, w = 1 - hitU - hitV;
            const x = TUV[u] * w + TUV[u + 2] * hitU + TUV[u + 4] * hitV;
            const y = TUV[u + 1] * w + TUV[u + 3] * hitU + TUV[u + 5] * hitV;
            atlasLookup(a, x, y, eq, 0);
          } else {
            const b = ht * 9;
            const e1x = TRI[b + 3], e1y = TRI[b + 4], e1z = TRI[b + 5], e2x = TRI[b + 6], e2y = TRI[b + 7], e2z = TRI[b + 8];
            let fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
            const fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
            fx /= fl; fy /= fl; fz /= fl;
            if (fx * dx + fy * dy + fz * dz > 0) { fx = -fx; fy = -fy; fz = -fz; }
            occluderIrradiance(ox + dx * hitT, oy + dy * hitT, oz + dz * hitT, fx, fy, fz, eq);
          }
          cr = MATS[m] * invPi * eq[0] + MATS[m + 3];
          cg = MATS[m + 1] * invPi * eq[1] + MATS[m + 4];
          cb = MATS[m + 2] * invPi * eq[2] + MATS[m + 5];
          br += cr; bg += cg; bb += cb;
        }
      }
      const c = PI * (0.2126 * cr + 0.7152 * cg + 0.0722 * cb);
      m1 += c; m2 += c * c;
    }
    const ks = PI / S2;
    O_SKY2[i * 3] = sr * ks; O_SKY2[i * 3 + 1] = sg * ks; O_SKY2[i * 3 + 2] = sb * ks;
    O_BOUNCE[i * 3] = br * ks; O_BOUNCE[i * 3 + 1] = bg * ks; O_BOUNCE[i * 3 + 2] = bb * ks;
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

export const kernels = { passDirect, passBounce };
