// UV-space rasteriser: for every texel of a part's texture, which triangle covers it and where (barycentric),
// so procedural masks can be evaluated on the 3D rest-pose surface (position, normal, base-mesh binding) and
// painted back into the texture. Texels just outside UV islands get the nearest island texel (gutter
// padding, `pad` texels) so mipmaps don't bleed seams.

/**
 * @param tris  Int32Array of corner triples [v0,t0, v1,t1, v2,t2] per triangle (original vertex + uv index)
 * @param uvs   Float32Array OBJ-convention uvs (v up)
 * @param size  texture size (square)
 * @returns {size, tri: Int32Array, b1: Float32Array, b2: Float32Array, covered: Uint8Array}
 */
export function rasterUV(tris, uvs, size, pad = 6) {
  const N = size * size;
  const tri = new Int32Array(N).fill(-1);
  const b1 = new Float32Array(N), b2 = new Float32Array(N);
  const nt = tris.length / 6;
  for (let t = 0; t < nt; t++) {
    const ia = tris[t * 6 + 1], ib = tris[t * 6 + 3], ic = tris[t * 6 + 5];
    const ax = uvs[ia * 2] * size, ay = (1 - uvs[ia * 2 + 1]) * size;
    const bx = uvs[ib * 2] * size, by = (1 - uvs[ib * 2 + 1]) * size;
    const cx = uvs[ic * 2] * size, cy = (1 - uvs[ic * 2 + 1]) * size;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area; // weight of b
        const w2 = ((ax - px) * (by - py) - (bx - px) * (ay - py)) / area; // weight of c
        const w0 = 1 - w1 - w2;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const i = y * size + x;
        tri[i] = t; b1[i] = w1; b2[i] = w2;
      }
    }
  }
  const covered = new Uint8Array(N);
  for (let i = 0; i < N; i++) covered[i] = tri[i] >= 0 ? 1 : 0;
  // gutter: grow islands outward by `pad` texels (copy nearest covered neighbour, clamped barycentrics)
  for (let p = 0; p < pad; p++) {
    const add = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (tri[i] >= 0) continue;
      const nb = [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, y > 0 ? i - size : -1, y < size - 1 ? i + size : -1];
      for (const j of nb) if (j >= 0 && tri[j] >= 0) { add.push(i, j); break; }
    }
    for (let k = 0; k < add.length; k += 2) { const i = add[k], j = add[k + 1]; tri[i] = tri[j]; b1[i] = b1[j]; b2[i] = b2[j]; }
  }
  return { size, tri, b1, b2, covered };
}

/**
 * Evaluates the rest-pose surface at texel i: writes position and normalised normal into out arrays.
 * pos / nrm are per original vertex Float32Arrays (xyz).
 */
export function texelSurface(r, tris, pos, nrm, i, P, Nn) {
  const t = r.tri[i];
  if (t < 0) return false;
  const w1 = r.b1[i], w2 = r.b2[i], w0 = 1 - w1 - w2;
  const a = tris[t * 6] * 3, b = tris[t * 6 + 2] * 3, c = tris[t * 6 + 4] * 3;
  for (let k = 0; k < 3; k++) {
    P[k] = pos[a + k] * w0 + pos[b + k] * w1 + pos[c + k] * w2;
    Nn[k] = nrm[a + k] * w0 + nrm[b + k] * w1 + nrm[c + k] * w2;
  }
  const l = Math.hypot(Nn[0], Nn[1], Nn[2]) || 1;
  Nn[0] /= l; Nn[1] /= l; Nn[2] /= l;
  return true;
}

/** Interpolates an arbitrary per-vertex scalar attribute at texel i. */
export function texelAttr(r, tris, attr, i) {
  const t = r.tri[i];
  if (t < 0) return 0;
  const w1 = r.b1[i], w2 = r.b2[i], w0 = 1 - w1 - w2;
  return attr[tris[t * 6]] * w0 + attr[tris[t * 6 + 2]] * w1 + attr[tris[t * 6 + 4]] * w2;
}
