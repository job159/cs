// High-top combat boots for character builds: a ring loft fitted round the CC0 MakeHuman foot / shin (base mesh),
// one horizontal ring per height: lugged rubber outsole with a protruding welt and a heel, the upper over the foot with
// ~1.2 cm toe-box clearance, a straight shaft ~14 cm above the ankle bone, a padded collar rolled over the top and
// a lining ring inside. Each boot is its own texture zone (arc-length uv: the back seam on the zone edges, the lacing
// down the middle) plus a planar zone for the tread. Skinned to calf / foot / ball by inverse-distance weights of the
// nearest base-mesh vertices. Also answers "how far is the boot surface from the leg axis here" (trouser tuck).
import * as THREE from 'three';
import { V3 } from './kit.mjs';

const TAU = Math.PI * 2;
const NPHI = 64;
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ss = smoothstep;
const mix = (a, b, t) => a + (b - a) * t;

/**
 * Boot shape for both feet. bvh: BVH of the full base mesh; sk: skeleton byName. Returns per side
 * { rings: [{y, c, r: Float64Array(NPHI) outer radius per phi, kind}], yTop, sx, footBottom, heelZ, toeZ, radius(y, phi) }.
 */
export function bootShape(h, bvh, o = {}) {
  const sk = h.skeleton.byName;
  const ray = new THREE.Ray();
  const top = o.shaft ?? 0.145;
  const out = {};
  for (const s of ['l', 'r']) {
    const sx = s === 'l' ? 1 : -1;
    const ft = sk[`foot_${s}`], ca = sk[`calf_${s}`], ba = sk[`ball_${s}`];
    // foot extents from base-mesh vertices round the foot
    let fb = Infinity, heelZ = Infinity, toeZ = -Infinity;
    for (let v = 0; v < h.pos.length / 3; v++) {
      const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
      if (y > 0.12 || Math.abs(x - ft.head.x) > 0.09) continue;
      fb = Math.min(fb, y); heelZ = Math.min(heelZ, z); toeZ = Math.max(toeZ, z);
    }
    const yTop = ft.head.y + top;
    const legAxis = (y) => { const t = (y - ca.tail.y) / (ca.head.y - ca.tail.y); return ca.tail.clone().lerp(ca.head, t); };
    // farthest surface along a horizontal ray from c (star hull of the section)
    const section = (c, y) => {
      const r = new Float64Array(NPHI);
      for (let k = 0; k < NPHI; k++) {
        const ph = k / NPHI * TAU;
        ray.origin.set(c.x, y, c.z); ray.direction.set(Math.sin(ph), 0, Math.cos(ph));
        const hits = bvh.raycast(ray, THREE.DoubleSide, 0, 0.17);
        let m = 0;
        for (const hh of hits) m = Math.max(m, hh.distance);
        r[k] = m;
      }
      return r;
    };
    const centreAt = (y) => {
      const footC = V3(ft.head.x * 0.7 + ba.head.x * 0.3, y, heelZ + (toeZ - heelZ) * 0.45);
      const legC = legAxis(Math.max(y, ft.head.y)); legC.y = y;
      return footC.lerp(legC, smoothstep(0.045, 0.11, y));
    };
    // ring levels: [y, kind, extra offset]: sole (bottom bevel, tread edge, welt top), upper, shaft, collar
    const L = [
      [0.0, 'sole', 0.012], [0.007, 'sole', 0.016], [0.024, 'sole', 0.017], [0.031, 'upper', 0.009],
      [0.046, 'upper', 0.01], [0.062, 'upper', 0.011], [0.08, 'upper', 0.012], [0.1, 'upper', 0.013],
      [0.125, 'shaft', 0.014], [yTop - 0.06, 'shaft', 0.014], [yTop - 0.025, 'shaft', 0.015], [yTop, 'collar', 0.019],
      [yTop + 0.007, 'lip', 0.014], [yTop - 0.014, 'inner', 0.004],
    ];
    const rings = [];
    for (const [y, kind, off] of L) {
      const c = centreAt(Math.min(y, yTop));
      let r = new Float64Array(NPHI);
      // vertical dilation: the boot section at y is the union of the foot / leg sections a little below and above
      // (toe box over the toes, a straight shaft that never pinches in at the ankle)
      const ys = kind === 'sole' ? [fb + 0.006, fb + 0.014, fb + 0.024]
        : kind === 'upper' ? [y - 0.016, y - 0.008, y, y + 0.004].map((v) => Math.max(fb + 0.006, v))
          : [y, (y + yTop) / 2, yTop, Math.max(ft.head.y + 0.04, y - 0.03)];
      for (const yy of ys) { const q = section(c, yy); for (let k = 0; k < NPHI; k++) r[k] = Math.max(r[k], q[k]); }
      // fill misses, circular smoothing
      for (let k = 0; k < NPHI; k++) if (!r[k]) r[k] = Math.max(r[(k + NPHI - 1) % NPHI], r[(k + 1) % NPHI], 0.03);
      for (let p = 0; p < 3; p++) { const b = r.slice(); for (let k = 0; k < NPHI; k++) r[k] = (b[(k + NPHI - 1) % NPHI] + 2 * b[k] + b[(k + 1) % NPHI]) / 4; }
      for (let k = 0; k < NPHI; k++) r[k] += off;
      rings.push({ y, c, r, kind });
    }
    // the shaft rings above the ankle never narrower than the collar (no hourglass), the inner lining inside the top
    const col = rings.find((q) => q.kind === 'collar');
    for (const q of rings) if (q.kind === 'shaft') for (let k = 0; k < NPHI; k++) q.r[k] = Math.max(q.r[k], col.r[k] - 0.006 - (yTop - q.y) * 0.05);
    const inner = rings.find((q) => q.kind === 'inner'), lip = rings.find((q) => q.kind === 'lip');
    for (let k = 0; k < NPHI; k++) { lip.r[k] = col.r[k] - 0.005; inner.r[k] = col.r[k] - 0.013; }
    // radius of the outer surface at (y, phi) (shaft / upper rings only)
    const outerRings = rings.filter((q) => q.kind !== 'lip' && q.kind !== 'inner');
    const radius = (y, ph) => {
      const kf = ((ph / TAU) * NPHI % NPHI + NPHI) % NPHI, k0 = Math.floor(kf), k1 = (k0 + 1) % NPHI, t = kf - k0;
      const at = (q) => q.r[k0] * (1 - t) + q.r[k1] * t;
      if (y <= outerRings[0].y) return { r: at(outerRings[0]), c: outerRings[0].c };
      for (let i = 1; i < outerRings.length; i++) {
        const a = outerRings[i - 1], b = outerRings[i];
        if (y <= b.y) { const u = (y - a.y) / (b.y - a.y); return { r: at(a) * (1 - u) + at(b) * u, c: a.c.clone().lerp(b.c, u) }; }
      }
      const z = outerRings[outerRings.length - 1];
      return { r: at(z), c: z.c };
    };
    out[s] = { rings, yTop, sx, footBottom: fb, heelZ, toeZ, radius, ankle: ft.head.clone(), legAxis };
  }
  return out;
}

/** Point of a ring at angle phi (rest pose). */
const ringPoint = (q, ph) => {
  const kf = ((ph / TAU) * NPHI % NPHI + NPHI) % NPHI, k0 = Math.floor(kf), k1 = (k0 + 1) % NPHI, t = kf - k0;
  const r = q.r[k0] * (1 - t) + q.r[k1] * t;
  return V3(q.c.x + Math.sin(ph) * r, q.y, q.c.z + Math.cos(ph) * r);
};

/**
 * Adds both boots to a Builder: B.piece per boot (zone zU[s]) + tread (zone zT[s]). n = points per ring.
 * wfn(s) -> weight function for that side. Returns the zone sizes needed (call once with B = null to size zones).
 */
export function bootGeometry(shape, n = 16) {
  const res = {};
  for (const s of ['l', 'r']) {
    const S = shape[s];
    // ring polylines resampled by arc length, starting at the back, lateral side first
    const polys = S.rings.map((q) => {
      const fine = [];
      for (let k = 0; k <= 256; k++) fine.push(ringPoint(q, Math.PI - S.sx * k / 256 * TAU));
      const len = [0];
      for (let k = 1; k < fine.length; k++) len.push(len[k - 1] + fine[k].distanceTo(fine[k - 1]));
      const C = len[len.length - 1];
      const pts = [];
      for (let j = 0; j <= n; j++) {
        const a = j / n * C;
        let k = 1; while (k < fine.length - 1 && len[k] < a) k++;
        const t = (a - len[k - 1]) / Math.max(1e-9, len[k] - len[k - 1]);
        pts.push(fine[k - 1].clone().lerp(fine[k], t));
      }
      return { pts, C };
    });
    const Cmax = Math.max(...polys.map((p) => p.C));
    // profile length along the back seam (v)
    const vs = [0];
    for (let i = 1; i < polys.length; i++) vs.push(vs[i - 1] + polys[i].pts[0].distanceTo(polys[i - 1].pts[0]) * 0.5 + polys[i].pts[n >> 1].distanceTo(polys[i - 1].pts[n >> 1]) * 0.5);
    const H = vs[vs.length - 1];
    const verts = [], tris = [];
    polys.forEach((p, i) => p.pts.forEach((pt, j) => verts.push({ p: pt, uv: [0.5 + (j / n * p.C - p.C / 2) / Cmax, vs[i] / H] })));
    const id = (i, j) => i * (n + 1) + j;
    for (let i = 0; i < polys.length - 1; i++) for (let j = 0; j < n; j++) {
      const a = id(i, j), b = id(i, j + 1), c = id(i + 1, j + 1), d = id(i + 1, j);
      tris.push([a, b, c], [a, c, d]);
    }
    // winding: outward on the first band (the lining ring at the end faces inwards by construction)
    {
      const [a, b, c] = tris[0];
      const nrm = verts[b].p.clone().sub(verts[a].p).cross(verts[c].p.clone().sub(verts[a].p));
      const outw = verts[a].p.clone().sub(S.rings[0].c).setY(0);
      if (nrm.dot(outw) < 0) for (const t of tris) [t[1], t[2]] = [t[2], t[1]];
    }
    // tread: fan under the bottom ring, planar uv
    const bot = polys[0].pts.slice(0, n);
    let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
    for (const pt of bot) { mnx = Math.min(mnx, pt.x); mxx = Math.max(mxx, pt.x); mnz = Math.min(mnz, pt.z); mxz = Math.max(mxz, pt.z); }
    const cen = bot.reduce((a, pt) => a.add(pt), V3()).divideScalar(bot.length);
    const tv = [{ p: cen.clone(), n: V3(0, -1, 0), uv: [(cen.x - mnx) / (mxx - mnx), (cen.z - mnz) / (mxz - mnz)] }];
    for (const pt of bot) tv.push({ p: pt.clone(), n: V3(0, -1, 0), uv: [(pt.x - mnx) / (mxx - mnx), (pt.z - mnz) / (mxz - mnz)] });
    const tt = [];
    for (let j = 0; j < n; j++) tt.push([0, 1 + j, 1 + (j + 1) % n]);
    {
      const [a, b, c] = tt[0];
      const nrm = tv[b].p.clone().sub(tv[a].p).cross(tv[c].p.clone().sub(tv[a].p));
      if (nrm.y > 0) for (const t of tt) [t[1], t[2]] = [t[2], t[1]];
    }
    res[s] = { verts, tris, tread: { verts: tv, tris: tt }, zone: [Cmax, H], treadZone: [mxx - mnx, mxz - mnz] };
  }
  return res;
}

// ------------------------------------------------------------------------------------------------ painters
const S2L = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lin = (rgb) => rgb.map(S2L);
const over = (c, col, a) => { if (!(a > 0)) return; a = Math.min(1, a); for (let k = 0; k < 3; k++) c[k] += (col[k] - c[k]) * a; };
const mul = (c, k) => { c[0] *= k; c[1] *= k; c[2] *= k; };
const fract = (x) => x - Math.floor(x);
const BOOT = {
  leather: lin([72, 57, 41]), nylon: lin([80, 68, 50]), toe: lin([50, 40, 31]), heel: lin([62, 49, 36]),
  sole: lin([27, 25, 23]), lace: lin([36, 30, 24]), hook: lin([46, 46, 46]), tongue: lin([86, 74, 55]),
  collar: lin([66, 54, 41]), loop: lin([30, 29, 27]), stitch: lin([128, 112, 86]), dust: lin([150, 136, 112]),
};

/**
 * Upper / shaft / sole side painter for one boot. N: lib noise; S: bootShape side.
 * The sole band is higher at the heel (heel block) and recessed under the arch; lugs are vertical grooves along the
 * sole edge; lacing (tongue, crossed laces, eyelets below the ankle, speed hooks above) runs up the front.
 */
export function bootPaint(N, S, side) {
  const lat = side === 'l' ? 1 : -1;
  const fb = S.footBottom;
  return (P, Nn, lu, lv, out, ctx) => {
    const c = out.c;
    const y = P[1] - fb;
    const ring = S.radius(Math.min(P[1], S.yTop), 0);
    const rc = ring.c;
    const ph = Math.atan2(P[0] - rc.x, P[2] - rc.z), a = Math.abs(ph); // 0 front .. PI back
    const X = lu * ctx.zone.w;                                          // arc length round the boot
    const heelSide = ss(S.ankle.z + 0.03, S.ankle.z - 0.02, P[2]);       // 1 under the heel
    const medial = (P[0] - S.ankle.x) * lat < -0.01 ? 1 : 0;
    const arch = medial * ss(S.ankle.z - 0.0, S.ankle.z + 0.03, P[2]) * (1 - ss(S.ankle.z + 0.07, S.ankle.z + 0.1, P[2]));
    const solTop = 0.026 + 0.009 * heelSide + 0.004 * arch;
    let h = 0, ro = 0.74, me = 0;
    const base = BOOT.leather;
    c[0] = base[0]; c[1] = base[1]; c[2] = base[2];
    const gr = N.noise(P[0] * 260, P[1] * 260, P[2] * 260);
    if (y < solTop) {
      // rubber outsole + midsole line, lugs
      c[0] = BOOT.sole[0]; c[1] = BOOT.sole[1]; c[2] = BOOT.sole[2];
      ro = 0.82; h = 1.2;
      if (Math.abs(y - 0.013) < 0.0012) { mul(c, 0.6); h -= 0.8; }
      const lug = fract(X / 0.0095);
      if (y > 0.003 && y < solTop - 0.005 && lug < 0.3) { mul(c, 0.55); h -= 1.6; }
      if (arch > 0.5 && y < 0.012) { mul(c, 0.5); h -= 1.2; } // recessed arch
      mul(c, 1 + gr * 0.06);
    } else {
      // upper: suede leather; nylon side panels on the shaft; toe cap; heel counter
      const nylon = ss(0.55, 0.7, a) * (1 - ss(2.3, 2.45, a)) * ss(0.065, 0.075, y);
      over(c, BOOT.nylon, nylon);
      if (nylon > 0.5) { h += Math.sin(X * 2200) * Math.sin(y * 2200) * 0.2; ro = 0.88; }
      else { mul(c, 1 + N.noise(P[0] * 700, P[1] * 700, P[2] * 700) * 0.07); ro = 0.72; h += gr * 0.15; }
      const toe = ss(S.toeZ - 0.07, S.toeZ - 0.06, P[2]) * (1 - ss(0.062, 0.07, y)) * (1 - ss(1.25, 1.4, a));
      if (toe > 0) { over(c, BOOT.toe, toe); ro = mix(ro, 0.6, toe); h += toe * 0.6; }
      const heel = ss(2.15, 2.3, a) * (1 - ss(S.ankle.y - fb + 0.01, S.ankle.y - fb + 0.02, y));
      if (heel > 0) { over(c, BOOT.heel, heel); ro = mix(ro, 0.66, heel); h += heel * 0.5; }
      // panel seams with stitching: toe-cap edge, heel-counter edge, nylon panel edges
      for (const e of [Math.abs(toe - 0.5) * 2, Math.abs(heel - 0.5) * 2, Math.abs(nylon - 0.5) * 2]) {
        if (e < 0.2) { mul(c, 0.82); h -= 0.6; }
        else if (e < 0.45 && fract(X / 0.004 + y / 0.004) < 0.5) over(c, BOOT.stitch, 0.35);
      }
      // welt stitch just above the sole
      if (y < solTop + 0.004 && fract(X / 0.005) < 0.55) { over(c, BOOT.stitch, 0.5); h += 0.3; }
      // lacing up the front: from the toe box to the collar
      const dx = (P[0] - rc.x) * lat;                                   // lateral offset from the front line
      const front = Nn[2] > 0.15 && a < 0.9 && P[2] < S.ankle.z + 0.125 && y > 0.06;
      if (front && Math.abs(dx) < 0.026) {
        const along = y / 0.021;
        const u = dx / 0.017;
        if (Math.abs(dx) < 0.013) { over(c, BOOT.tongue, 0.85); h += 0.6; ro = 0.86; }
        // crossed laces between the eyelets
        const d1 = Math.abs(fract(along + u * 0.5) - 0.5), d2 = Math.abs(fract(along - u * 0.5) - 0.5);
        if (Math.abs(u) < 1 && Math.min(d1, d2) < 0.085) { over(c, BOOT.lace, 0.95); h += 1.4; ro = 0.8; }
        // eyelets (below the ankle) / speed hooks (above): metal at both edges
        const ey = Math.abs(fract(along) - 0.5);
        const hookZone = P[1] > S.ankle.y + 0.025;
        const r = Math.hypot((Math.abs(dx) - 0.0185) / (hookZone ? 0.0042 : 0.0032), ey * 0.021 / (hookZone ? 0.005 : 0.0032));
        if (r < 1) { over(c, BOOT.hook, 0.95); ro = 0.38; me = 0.65; h += hookZone ? 2.2 * (1 - r) : 1.2 - (r < 0.5 ? 1.6 : 0); }
      }
      // padded collar with quilting, pull loop at the back
      const top = S.yTop - fb;
      if (y > top - 0.022) { over(c, BOOT.collar, 0.8); h += 0.8 + Math.sin(X * 600) * 0.25; ro = 0.8; if (Math.abs(y - (top - 0.022)) < 0.0015) { mul(c, 0.7); h -= 0.6; } }
      if (a > 2.85 && y > top - 0.05) { over(c, BOOT.loop, 0.9); h += 1; ro = 0.85; }
      // creases over the instep / ankle flex
      if (a < 1.3 && y > 0.06 && y < S.ankle.y - fb + 0.05) h += Math.sin(y * 900 + N.noise(P[0] * 40, P[1] * 40, P[2] * 40) * 3) * 0.25;
    }
    // dust and scuffs: lower part and the toe
    const dust = Math.max(0, Math.min(1, (1 - ss(0.02, 0.12, y)) * 0.45 + ss(0.2, 0.75, N.fbm(P[0] * 14, P[1] * 14, P[2] * 14, 3)) * 0.3));
    over(c, BOOT.dust, dust * 0.22);
    out.h = h; out.ro = ro; out.me = me;
  };
}

/** Tread: chevron lugs, a transverse heel breast groove. */
export function treadPaint(N) {
  return (P, Nn, lu, lv, out, ctx) => {
    const c = out.c, w = ctx.zone.w, hh = ctx.zone.h;
    const X = (lu - 0.5) * w, Y = lv * hh;
    c[0] = BOOT.sole[0]; c[1] = BOOT.sole[1]; c[2] = BOOT.sole[2];
    const chev = fract((Y + Math.abs(X) * 0.7) / 0.017);
    let h = chev < 0.58 ? 1.4 : -1.2;
    if (chev >= 0.58) mul(c, 0.55);
    if (Math.abs(Y - hh * 0.3) < 0.006) { h = -1.8; mul(c, 0.5); }
    mul(c, 1 + N.noise(P[0] * 300, P[1] * 300, P[2] * 300) * 0.08);
    over(c, BOOT.dust, 0.18);
    out.h = h; out.ro = 0.85; out.me = 0;
  };
}
