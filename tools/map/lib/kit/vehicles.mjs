// Procedural vehicle hulks: sedan, police, taxi, van, pickup, box truck, bus. Bodies are convex hulls of
// side profiles (bevelled), glass is inset from the cabin faces, wheels are cylinders with rims, and the
// paint is per-vehicle vertex tint over a worn-paint texture. Wreck states: intact | wrecked | burnt.
import { Kit, V, convexHullFaces, faceBasis } from './core.mjs';

const PAINTS = ['#7d1f1a', '#1f3a5c', '#2f4a36', '#bdb8ac', '#3a3a3c', '#6c6a64', '#8a6a3c', '#d3cfc6', '#4b2f2a', '#2c4f63'];

/**
 * Body hull from a side profile [[x, y]...] (x along the vehicle, y up), full width w at the bottom, top width
 * scaled by `tuck`, bevel b (rounded look). Returns the hull faces (local).
 */
function profileHull(profile, w, b, tuck = 0.92) {
  const ys = profile.map((p) => p[1]);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pts = [];
  for (const [x, y] of profile) {
    const t = (y - y0) / Math.max(1e-3, y1 - y0);
    const hw = (w / 2) * (1 + (tuck - 1) * t);
    pts.push([x, y, hw - b], [x, y, -(hw - b)]);
    // bevel ring: pull the profile point inward toward the profile centre + full width
    pts.push([x, y, hw * 0.999], [x, y, -hw * 0.999]);
  }
  // inset copy (bevel): profile shrunk toward its centroid at full width
  const cx = profile.reduce((s, p) => s + p[0], 0) / profile.length, cy = profile.reduce((s, p) => s + p[1], 0) / profile.length;
  const out = [];
  for (const [x, y] of profile) {
    const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1;
    const ix = x - (dx / l) * b, iy = y - (dy / l) * b;
    const t = (y - y0) / Math.max(1e-3, y1 - y0);
    const hw = (w / 2) * (1 + (tuck - 1) * t);
    out.push([ix, iy, hw], [ix, iy, -hw]);
    out.push([x, y, hw - b], [x, y, -(hw - b)]);
  }
  return convexHullFaces(out);
}

Object.assign(Kit.prototype, {
  /**
   * Vehicle at [x, z] facing rot (front = local +x). type: sedan | police | taxi | van | pickup | truck | bus.
   * Options: color (sRGB), state ('intact' | 'wrecked' | 'burnt'), y, tilt (rz radians), collide (true).
   */
  vehicle(v) {
    const type = v.type || 'sedan';
    const state = v.state || 'intact';
    const burnt = state === 'burnt';
    const color = burnt ? '#ffffff' : v.color || (type === 'taxi' ? '#d9a82a' : type === 'police' ? '#1c1d20' : type === 'bus' ? '#d8a020' : this.pick(PAINTS));
    const paint = burnt ? 'car_burnt' : state === 'wrecked' ? 'car_paint_worn' : 'car_paint';
    const spec = SPECS[type] || SPECS.sedan;
    this.at({ x: v.at[0], y: v.y || 0, z: v.at[1], rot: v.rot || 0, rz: v.tilt || 0, rx: v.roll || 0 }, () => {
      const W = spec.w;
      // ---- lower body
      const grime = { y: 0, h: 1.1, k: burnt ? 0.2 : 0.45 };
      for (const f of profileHull(spec.lower, W, 0.07, 0.96)) this.face(f, paint, { tint: color, uvLocal: true, grime });
      // ---- cabin / cargo
      const glassMat = state === 'intact' ? 'car_glass' : null;
      for (const part of spec.upper) {
        const pw = part.w ?? W * 0.94, tuck = part.tuck ?? 0.82, frame = part.frame ?? 0.07;
        const faces = profileHull(part.profile, pw, 0.05, tuck);
        const pm = part.mat === 'paint' || !part.mat ? paint : part.mat;
        const pt = part.mat && part.mat !== 'paint' ? part.tint : type === 'police' && !burnt ? '#e8e6e0' : color;
        let glazed = 0;
        for (const f of faces) {
          const n = faceNormal(f);
          // glass openings on side / front / rear faces (not the roof, not the bottom): the paint face gets a hole,
          // the pane sits slightly recessed in it and the dark cabin interior shows through
          const eligible = part.glass && n[1] <= 0.75 && n[1] >= -0.3 && !(Math.abs(n[2]) > 0.5 && part.sideGlass === false) && polyArea(f) >= 0.12;
          const pane = eligible ? insetFace(f, n, frame, 0) : null;
          if (!pane) { this.face(f, pm, { tint: pt, uvLocal: true }); continue; }
          glazed++;
          this.face(f, pm, { tint: pt, uvLocal: true, holes: [pane] });
          const rec = pane.map((p) => V.sub(p, V.scale(n, 0.012)));
          // reveal of the opening (frame depth)
          for (let i = 0; i < pane.length; i++) {
            const p = pane[i], q = pane[(i + 1) % pane.length], q2 = rec[(i + 1) % pane.length], p2 = rec[i];
            this.face([p, p2, q2, q], 'car_plastic', { tint: '#151515' });
          }
          if (glassMat) this.face(rec, glassMat, {});
          else if (!burnt && this.chance(0.5)) this.face(shrinkTri(rec), 'glass_dirty', {});
          // side windows: B / C pillars
          if (Math.abs(n[2]) > 0.5 && part.pillars) {
            for (const px of part.pillars) {
              const ys = pane.map((p) => p[1]);
              const y0 = Math.min(...ys), y1 = Math.max(...ys);
              const zc = pane.reduce((s2, p) => s2 + p[2], 0) / pane.length;
              this.box({ x: px, y: y0 - 0.01, z: zc - n[2] * 0.004, w: 0.09, h: y1 - y0 + 0.02, d: 0.02, mat: pm, tint: pt });
            }
          }
        }
        if (glazed) {
          // inside-out shell of the cabin: dark interior seen through the windows, plus seat backs
          const cx = part.profile.reduce((s2, p) => s2 + p[0], 0) / part.profile.length, cy = part.profile.reduce((s2, p) => s2 + p[1], 0) / part.profile.length;
          const inner = part.profile.map(([x, y]) => [cx + (x - cx) * 0.94, cy + (y - cy) * 0.9]);
          for (const f of profileHull(inner, pw * 0.92, 0.0, tuck)) this.face(f.slice().reverse(), burnt ? 'car_burnt' : 'car_interior', { tint: burnt ? '#3a3633' : undefined, shade: 0.55 });
          if (part.seats !== false) for (const sx of part.seats || []) for (const sz of [-1, 1]) {
            this.bbox({ x: sx, y: Math.min(...part.profile.map((p) => p[1])) + 0.05, z: sz * pw * 0.22, w: 0.18, h: 0.62, d: pw * 0.34, bevel: 0.04, mat: burnt ? 'car_burnt' : 'car_interior', tint: burnt ? '#2f2b28' : '#3b3632', rz: -0.18 });
          }
        }
      }
      // ---- details
      const L = spec.l, hl = spec.lightY;
      const front = L / 2, rear = -L / 2;
      // bumpers
      this.bbox({ x: front - 0.06, y: spec.bumperY, z: 0, w: 0.2, h: 0.2, d: W * 0.98, bevel: 0.05, mat: spec.chrome ? 'car_chrome' : 'car_plastic', tint: burnt ? '#5a5652' : undefined });
      this.bbox({ x: rear + 0.06, y: spec.bumperY, z: 0, w: 0.2, h: 0.2, d: W * 0.98, bevel: 0.05, mat: spec.chrome ? 'car_chrome' : 'car_plastic', tint: burnt ? '#5a5652' : undefined });
      if (!burnt) {
        for (const s of [-1, 1]) {
          // headlights / taillights on the end faces
          this.face(quadYZ(front + 0.005, hl, s * (W / 2 - 0.3), 0.16, 0.34), 'car_light', {});
          this.face(quadYZ(rear - 0.005, hl, s * (W / 2 - 0.25), 0.14, 0.3, true), 'car_taillight', {});
        }
        this.face(quadYZ(front + 0.006, hl - 0.04, 0, 0.18, W * 0.34), 'car_plastic', { tint: '#1a1a1a' }); // grille
        this.face(quadYZ(rear - 0.006, spec.bumperY + 0.24, 0, 0.12, 0.3, true), 'sign_white', { tint: '#e2dfd5' }); // plate
        // mirrors
        if (spec.mirrors) for (const s of [-1, 1]) this.bbox({ x: spec.mirrors[0], y: spec.mirrors[1], z: s * (W / 2 + 0.08), w: 0.1, h: 0.12, d: 0.16, bevel: 0.02, mat: paint, tint: color });
      }
      // ---- wheels
      for (const [wx, wz] of spec.wheels) for (const s of [-1, 1]) {
        const z = s * (W / 2 - spec.tyreW / 2 + 0.02);
        const r = spec.tyreR;
        this.at({ x: wx, y: r, z, rx: Math.PI / 2 }, () => {
          if (!burnt) this.cyl({ x: 0, y: -spec.tyreW / 2, z: 0, r, h: spec.tyreW, seg: 16, mat: 'rubber', bottom: true });
          this.cyl({ x: 0, y: s > 0 ? spec.tyreW / 2 - 0.02 : -spec.tyreW / 2 - 0.005, z: 0, r: burnt ? r * 0.72 : r * 0.62, h: 0.025, seg: 12, mat: 'car_chrome', tint: burnt ? '#5e5853' : '#9a9da0', bottom: true });
        });
        // dark wheel arch on the body side
        const arch = [];
        for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; arch.push([wx + Math.cos(a) * (r + 0.06), r + Math.sin(a) * (r + 0.06)]); }
        const zz = s * (W / 2 + 0.002);
        const pts = arch.map(([x, y]) => [x, Math.max(y, spec.lower[0][1] + 0.01), zz]);
        this.face(s > 0 ? pts : pts.slice().reverse(), 'car_plastic', { tint: '#0e0e0e' });
      }
      // ---- extras
      if (type === 'police' && !burnt) {
        this.bbox({ x: spec.roofX, y: spec.roofY, z: 0, w: 0.3, h: 0.12, d: W * 0.7, bevel: 0.03, mat: 'car_plastic' });
        for (const s of [-1, 1]) this.box({ x: spec.roofX, y: spec.roofY + 0.02, z: s * W * 0.18, w: 0.26, h: 0.09, d: W * 0.3, mat: s > 0 ? 'lamp_red' : 'lamp_off', tint: s > 0 ? undefined : '#2040a0' });
        for (const s of [-1, 1]) this.face(s > 0 ? quadXY(0.2, 0.62, W / 2 + 0.004, 1.9, 0.42) : quadXY(0.2, 0.62, -W / 2 - 0.004, 1.9, 0.42, true), 'car_paint', { tint: '#e8e6e0' });
      }
      if (type === 'taxi' && !burnt) this.bbox({ x: spec.roofX, y: spec.roofY, z: 0, w: 0.25, h: 0.22, d: 0.7, bevel: 0.03, mat: 'sign_yellow' });
      if (type === 'bus' && !burnt) for (const s of [-1, 1]) this.face(s > 0 ? quadXY(0, 1.0, W / 2 + 0.004, spec.l - 1.2, 0.12) : quadXY(0, 1.0, -W / 2 - 0.004, spec.l - 1.2, 0.12, true), 'car_plastic', { tint: '#1a1a1a' });
      if (burnt) this.patch([[-L / 2 - 0.6, -W / 2 - 0.6], [L / 2 + 0.6, -W / 2 - 0.6], [L / 2 + 0.6, W / 2 + 0.6], [-L / 2 - 0.6, W / 2 + 0.6]], { mat: 'asphalt_patch', y: 0.002 });
      if (v.collide !== false) {
        this.colBox({ x: 0, y: 0.15, z: 0, w: L, h: spec.lowerTop - 0.15, d: W }, 'metal');
        for (const part of spec.upper) {
          const xs = part.profile.map((p) => p[0]), ys = part.profile.map((p) => p[1]);
          const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
          this.colBox({ x: (x0 + x1) / 2, y: y0, z: 0, w: (x1 - x0) * 0.92, h: y1 - y0, d: (part.w ?? W * 0.94) * 0.95 }, 'metal');
        }
      }
    });
  },
});

// ---------------------------------------------------------------------------------------------- specs
// lower: side profile of the lower body [[x, y]], upper: cabins / boxes, wheels: [[x, _]] (both sides mirrored)
const SPECS = {
  sedan: {
    l: 4.7, w: 1.8, lowerTop: 0.95, lightY: 0.72, bumperY: 0.3, tyreR: 0.33, tyreW: 0.22,
    lower: [[-2.35, 0.3], [2.35, 0.3], [2.41, 0.45], [2.39, 0.68], [2.26, 0.8], [1.6, 0.86], [1.15, 0.92], [-1.75, 0.96], [-2.24, 0.91], [-2.38, 0.76], [-2.41, 0.45]],
    upper: [{ profile: [[1.15, 0.92], [-1.72, 0.95], [-1.28, 1.41], [0.32, 1.44]], glass: true, tuck: 0.8, pillars: [-0.38], seats: [0.05, -0.85] }],
    wheels: [[1.45, 0], [-1.4, 0]], mirrors: [0.95, 1.0], roofX: -0.5, roofY: 1.43,
  },
  van: {
    l: 5.3, w: 2.0, lowerTop: 1.05, lightY: 0.85, bumperY: 0.35, tyreR: 0.37, tyreW: 0.24, chrome: false,
    lower: [[-2.65, 0.35], [2.65, 0.35], [2.68, 0.75], [2.55, 1.05], [-2.62, 1.08], [-2.68, 0.7]],
    upper: [
      { profile: [[2.5, 1.02], [1.25, 1.02], [1.15, 2.2], [1.75, 2.15]], glass: true, tuck: 0.88, w: 1.94, seats: [1.45] },
      { profile: [[1.3, 1.02], [-2.62, 1.05], [-2.62, 2.25], [1.2, 2.25]], glass: false, mat: 'paint', tuck: 0.95, w: 1.98 },
    ],
    wheels: [[1.75, 0], [-1.7, 0]], mirrors: [1.6, 1.4], roofX: 0, roofY: 2.24,
  },
  pickup: {
    l: 5.5, w: 2.0, lowerTop: 1.05, lightY: 0.9, bumperY: 0.4, tyreR: 0.4, tyreW: 0.26, chrome: true,
    lower: [[-2.75, 0.4], [2.75, 0.4], [2.78, 0.8], [2.65, 1.1], [1.0, 1.15], [-2.72, 1.12], [-2.78, 0.75]],
    upper: [
      { profile: [[1.05, 1.1], [-0.7, 1.12], [-0.6, 1.88], [0.45, 1.88]], glass: true, tuck: 0.86, seats: [-0.25] },
      { profile: [[-0.75, 1.1], [-2.72, 1.1], [-2.72, 1.55], [-0.75, 1.55]], glass: false, mat: 'paint', tuck: 1.0, w: 1.98 },
    ],
    wheels: [[1.75, 0], [-1.75, 0]], mirrors: [0.95, 1.3], roofX: -0.1, roofY: 1.87,
  },
  truck: {
    l: 7.6, w: 2.45, lowerTop: 1.1, lightY: 0.95, bumperY: 0.45, tyreR: 0.48, tyreW: 0.3, chrome: false,
    lower: [[-3.8, 0.55], [3.8, 0.55], [3.82, 0.95], [3.7, 1.15], [-3.8, 1.15]],
    upper: [
      { profile: [[3.75, 1.1], [2.0, 1.1], [2.0, 2.75], [3.45, 2.7]], glass: true, tuck: 0.95, w: 2.35, seats: [2.4] },
      { profile: [[1.8, 1.1], [-3.8, 1.1], [-3.8, 3.55], [1.8, 3.55]], glass: false, mat: 'paint_metal', tint: '#d9d6cc', tuck: 1.0, w: 2.45 },
    ],
    wheels: [[2.7, 0], [-2.2, 0], [-3.0, 0]], mirrors: [3.4, 2.1], roofX: 2.8, roofY: 2.74,
  },
  bus: {
    l: 11.5, w: 2.55, lowerTop: 1.1, lightY: 0.9, bumperY: 0.4, tyreR: 0.5, tyreW: 0.3, chrome: false,
    lower: [[-5.75, 0.4], [5.75, 0.4], [5.78, 0.95], [5.7, 1.15], [-5.75, 1.15]],
    upper: [{ profile: [[5.72, 1.1], [-5.72, 1.1], [-5.7, 3.05], [5.55, 3.05]], glass: true, tuck: 0.96, frame: 0.22, w: 2.5, pillars: [-4.2, -2.7, -1.2, 0.3, 1.8, 3.3], seats: [] }],
    wheels: [[3.9, 0], [-3.2, 0]], mirrors: [5.6, 2.2], roofX: 0, roofY: 3.05,
  },
};
SPECS.police = SPECS.sedan;
SPECS.taxi = SPECS.sedan;

function faceNormal(f) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
  return V.norm([nx, ny, nz]);
}
function polyArea(f) { const n = faceNormal(f); let s = [0, 0, 0]; for (let i = 0; i < f.length; i++) s = V.add(s, V.cross(f[i], f[(i + 1) % f.length])); return Math.abs(V.dot(s, n)) / 2; }
/** Shrinks a planar face by `m` (approx. offset toward the centroid) and pushes it out along n by `out`. */
function insetFace(f, n, m, out) {
  const c = f.reduce((s, p) => V.add(s, p), [0, 0, 0]).map((v) => v / f.length);
  const [T, B] = faceBasis(n);
  let r = Infinity;
  for (const p of f) r = Math.min(r, Math.hypot(V.dot(V.sub(p, c), T), V.dot(V.sub(p, c), B)));
  if (r < m * 1.5) return null;
  return f.map((p) => {
    const d = V.sub(p, c), l = V.len(d) || 1;
    const k = Math.max(0, (l - m * 1.4) / l);
    return V.add(V.add(c, V.scale(d, k)), V.scale(n, out));
  });
}
function shrinkTri(f) { return [f[0], f[1], V.lerp(f[1], f[2], 0.4)]; }
/** Quad on the plane x = x0 facing +x (or -x when back), centred at (y, z), size h x w. */
function quadYZ(x0, y, z, h, w, back = false) {
  const q = [[x0, y - h / 2, z + w / 2], [x0, y - h / 2, z - w / 2], [x0, y + h / 2, z - w / 2], [x0, y + h / 2, z + w / 2]];
  return back ? q.reverse() : q;
}
/** Quad on the plane z = z0 facing +z (or -z), centred at x, from y0 height h, length w. */
function quadXY(x, y0, z0, w, h, back = false) {
  const q = [[x - w / 2, y0, z0], [x + w / 2, y0, z0], [x + w / 2, y0 + h, z0], [x - w / 2, y0 + h, z0]];
  return back ? q.reverse() : q;
}
