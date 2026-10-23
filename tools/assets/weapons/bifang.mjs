// 畢方．焚翼 Bifang Pyrewing (and, through buildPyrewing('guiche'), its light/dark twin 鬼車．晦翼 Guiche Gloomwing)
// — M03 神兵 heavy, docs/PREMIUM_WEAPONS.md M03 (v1.2 card: cloisonné feathers, feather veins, crest fan; no gold-leaf
// shards / honeycomb / corona).
// An AA-12-pattern automatic scatter cannon built as the one-legged crane of the 山海經 (「其狀如鶴，一足，赤文青質而白喙」):
//   - receiver: three porcelain shells lofted from cross-sections (flat flanks, elliptical shoulders, crowned roof) with
//     real bevelled seams, gold inlay borders, on a dark steel chassis rail; on each flank a cloisonné feather vane:
//     raised gold cloisons along every barb and two row lines, enamel recessed in rows (青 at the rachis, 朱 at the edge,
//     white tip), carrying the 羽脈紋 (glowing rachis and nine main barb channels); behind it a red-lacquer roundel with
//     the crane in two-level gold relief between ruyi-cloud corners; cloud-scroll filigree along the shoulders, a ruyi
//     collar inlaid round the pearl, a louvred heat vent (right) and the charging handle (left);
//   - tail = in-line stock: porcelain tail with gold borders, rump-feather scallops in low relief, an underglaze scroll
//     band, a stitched leather cheek pad, three stepped cloisonné tail feathers a side, ribbed butt;
//   - neck = vented barrel shroud: throat-feather scales with cloisonné hearts, gold bands round a red lacquer ring
//     (赤文); head with shingled feather scales round each glazed eye (round pupil; 鬼車: slit); crest of four
//     lens-section plumes (cloisonné rows, gold-edged) fanned out and rolled about their spines, a gold crest pin
//     between them carrying the front-sight bead;
//   - beak = muzzle shroud: two lofted mandibles (keeled culmen, concave cheeks, rolled tomium lip holding a gold wire,
//     rounded gonys, sheath groove, cut nostril); the lower one hinged (fx_beak), the bore fires from the gape;
//     鬼車: the upper tip hooked down 20°;
//   - two gold wing bones on ball joints (fx_wingRootL / R): teardrop-section lofts with a fuller and a knuckle, six
//     cambered cloisonné flight feathers in gold socket cups; the light-wing cards grow from the middle rivet at runtime;
//   - the single focus: a briolette-cut 火珠 fire pearl (fx_pearl) over a gold claw cradle; 鬼車: a crescent of nine
//     slit-pupil eyes in almond lids instead (one large, eight at 0.4 brightness);
//   - single-leg foregrip (畢方一足), lofted pistol grip in pebbled leather with flat silk cord wraps, a stitched back
//     seam and a tassel; feather-shaped energy magazine (double glass wall, glowing rachis / barbs) behind a side gate;
//   - a gold seal cartouche (畢方 / 鬼車 in folded seal script, engraved serial) on the lower receiver.
// Materials 60 / 30 / 10: porcelain (black lacquer) / gold + aged bronze (antique silver) / glow.
// Side view, mm: s forward from the buttplate, t up from the bore axis, w right.
import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { Gun, V, makeShape, profile, plan, section, lathe, cyl, box, sphere, sweep, cut, union, cutters, merge, xform } from '../lib/gunkit.mjs';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';

// ------------------------------------------------------------------------------------------ local helpers

const D2R = Math.PI / 180;
const PF = (pts, o = {}) => profile(pts, { curveSeg: 4, ...o });
const PL = (pts, o = {}) => plan(pts, { curveSeg: 4, ...o });
const SC = (pts, a, b, o = {}) => section(pts, a, b, { curveSeg: 4, ...o });
const ROT = { s: null, '-s': [0, 180, 0], t: [90, 0, 0], '-t': [-90, 0, 0], w: [0, -90, 0], '-w': [0, 90, 0] };
/** lathe along `axis` ('t' runs up, '-t' down, 'w' right...) starting at `at` (s, t, w) */
function lax(pts, at, axis = 's', seg = 20) {
  const g = lathe(pts, { seg });
  if (ROT[axis]) xform(g, { rot: ROT[axis] });
  const c = V(...at);
  g.translate(c.x, c.y, c.z);
  return g;
}
const _qa = new THREE.Quaternion(), _fw = new THREE.Vector3(0, 0, -1);
/** geometry authored along +s from the origin (lathe pts [[s, r]] from s = 0), turned towards b and moved to a */
function aim(geo, a, b, roll = 0) {
  const A = V(...a), d = V(...b).sub(A).normalize();
  if (roll) geo.rotateZ(roll * D2R);
  _qa.setFromUnitVectors(_fw, d);
  geo.applyQuaternion(_qa);
  geo.translate(A.x, A.y, A.z);
  return geo;
}
const dist3 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] || 0) - (a[2] || 0));
/** tapered round segment a -> b (radii r0 -> r1, rounded ends) */
const limb = (a, b, r0, r1, seg = 10) => { const L = dist3(a, b); return aim(lathe([[0, 0], [0, r0 * 0.7], [r0 * 0.3, r0], [L - r1 * 0.3, r1], [L, r1 * 0.7], [L, 0]], { seg }), a, b); };
const capScrew = (at, r, axis = 'w', d = 1.4, seg = 8) =>
  lax([[0, 0], [0, r], [d * 0.62, r], [d, r - 0.35], [d, r * 0.5], [d - 0.7, r * 0.5], [d - 0.7, 0]], at, axis, Math.min(seg, 6));
const domeRivet = (at, r, axis = 'w', d = 1.2, seg = 8) => lax([[0, 0], [0, r], [d * 0.5, r * 0.8], [d, 0]], at, axis, seg);
const pinEnd = (at, r, axis = 'w', d = 0.6) => lax([[0, 0], [0, r], [d, r - 0.2], [d, 0]], at, axis, 10);
const arcPts = (cs, ct, r, a0, a1, n) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + ((a1 - a0) * i) / n) * D2R; out.push([cs + r * Math.cos(a), ct + r * Math.sin(a)]); }
  return out;
};
/** ring band round the bore axis (s0..s1, radii r0..r1, chamfer b), axis offset t */
const band = (s0, s1, r0, r1, t = 0, b = 0.5, seg = 36) => lathe([[s0, r0], [s0, r1 - b], [s0 + b, r1], [s1 - b, r1], [s1, r1 - b], [s1, r0], [s0, r0]], { t, seg });
/** straight strip (inlay, wire, groove cutter) from a to b in the side plane at w: height h, thickness d */
function strip(a, b, w, h, d, r = 0.25) {
  const ds = b[0] - a[0], dt = b[1] - a[1], L = Math.hypot(ds, dt);
  if (Math.min(h, d) < 1.5) r = 0;          // thin wires / inlays: plain boxes (12 tris), rounding is invisible there
  return box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w], [L, h, d], { r, seg: 1, rot: [Math.atan2(dt, ds) * 180 / Math.PI, 0, 0] });
}
const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
/** frame along a side-plane axis a -> b: P(u in 0..1, o across, up-positive) -> [s, t] */
function axisFrame(a, b) {
  const ds = b[0] - a[0], dt = b[1] - a[1], L = Math.hypot(ds, dt), ux = ds / L, uy = dt / L;
  return { a, L, ux, uy, P: (u, o) => [a[0] + ux * u * L - uy * o, a[1] + uy * u * L + ux * o], ang: Math.atan2(dt, ds) };
}
/**
 * Feather / vane outline in the side plane: quill end at a, tip at b, half widths hu(u) above and hd(u) below the
 * axis (mm, u 0..1). [s, t, 0] points.
 */
function vaneOutline(a, b, hu, hd, n = 16) {
  const F = axisFrame(a, b);
  const up = [], dn = [];
  for (let i = 0; i <= n; i++) { const u = i / n; up.push([...F.P(u, hu(u)), 0]); }
  for (let i = n - 1; i >= 0; i--) { const u = i / n; dn.push([...F.P(u, -hd(u)), 0]); }
  return [...up, ...dn];
}
/** classic feather width: fast rise off the quill, full belly, rounded tip */
const vaneW = (max, rise = 0.18, belly = 0.6, q = 0.16) => (u) => max * (q + (1 - q) * smooth(0, rise, u)) * (u < belly ? 1 : Math.sqrt(Math.max(0, 1 - ((u - belly) / (1 - belly)) ** 2)));
/** smooth function through [x, y] control points sorted by x (Catmull-Rom Hermite, clamped ends) */
function curveFn(pts) {
  const n = pts.length;
  const m = (k) => { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)]; return (b[1] - a[1]) / (b[0] - a[0]); };
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (x > pts[i + 1][0]) i++;
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m(i) * h + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m(i + 1) * h;
  };
}
/** drops near-duplicate consecutive points (earcut chokes on them) */
function dedupe(pts, eps = 0.03) {
  const out = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps) out.push(p); }
  const a = out[0], z = out[out.length - 1];
  if (out.length > 2 && Math.hypot(a[0] - z[0], a[1] - z[1]) <= eps) out.pop();
  return out;
}
/** closed polygon offset (miter), d > 0 grows it */
function offsetPoly(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
  const sg = area > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2];
    const m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(...m) || 1;
    const k = d * sg / Math.max(0.35, (m[0] * n1[0] + m[1] * n1[1]) / ml);
    return [p[0] + (m[0] / ml) * k, p[1] + (m[1] / ml) * k];
  });
}
/** ribbon polygon of width wd round an open polyline (smooth curves only) */
function ribbonPoly(pts, wd) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    L.push([p[0] - dy * wd / 2, p[1] + dx * wd / 2]); R.push([p[0] + dy * wd / 2, p[1] - dx * wd / 2]);
  }
  return [...L, ...R.reverse()];
}
/** side-plane plate on the face w0 (sd = outward side): from z0 to z1 above the face */
const onFace = (w0, sd, z0, z1) => ({ w: z1 - z0, cw: w0 + sd * (z0 + z1) / 2 });
/**
 * Flat plate on a side face without its hidden bottom: top cap + side walls of poly [[s, t]...] (and holes) from z0 to
 * z1 above the face w0 (sd = outward side). Cloisons, enamel cells, inlays: 3 n triangles instead of a full prism's 4 n.
 */
function slab(poly, w0, sd, z0, z1, holes = [], walls = true, bottom = false, crease = 40) {
  const loops = [dedupe(poly), ...holes.map((h) => dedupe(h))].filter((l) => l.length >= 3);
  if (!loops.length) return null;
  const v2 = (l) => l.map(([x, y]) => new THREE.Vector2(x, y));
  const tris = THREE.ShapeUtils.triangulateShape(v2(loops[0]), loops.slice(1).map(v2));
  if (process.env.SLABDBG && tris.length < loops.reduce((n, l) => n + l.length, 0) + 2 * (loops.length - 1) - 2) console.warn('slab: short triangulation', tris.length, loops.map((l) => l.length), new Error().stack.split(String.fromCharCode(10))[2].trim());
  const flat = loops.flat(), n = flat.length, P = [], I = [], E = [];
  for (const [x, y] of flat) P.push(x, y, w0 + sd * z1);
  for (const [x, y] of flat) P.push(x, y, w0 + sd * z0);
  for (const [a, b, c] of tris) { I.push(a, b, c); E.push([0, 0, sd]); }
  if (bottom) for (const [a, b, c] of tris) { I.push(n + a, n + c, n + b); E.push([0, 0, -sd]); }   // closed plate (two-faced parts)
  let o = 0;
  if (walls) loops.forEach((l, li) => {
    const m = l.length;
    let A = 0;
    for (let i = 0; i < m; i++) { const p = l[i], q = l[(i + 1) % m]; A += p[0] * q[1] - q[0] * p[1]; }
    const sg = (A > 0 ? 1 : -1) * (li ? -1 : 1);                 // outer walls face out, hole walls into the hole
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m, p = l[i], q = l[j], e = [(q[1] - p[1]) * sg, -(q[0] - p[0]) * sg, 0];
      I.push(o + i, o + j, n + o + j, o + i, n + o + j, n + o + i); E.push(e, e);
    }
    o += m;
  });
  for (let k = 0; k < E.length; k++) {
    const a = I[3 * k] * 3, b = I[3 * k + 1] * 3, c = I[3 * k + 2] * 3;
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], e = E[k];
    if (nn[0] * e[0] + nn[1] * e[1] + nn[2] * e[2] < 0) { const t = I[3 * k + 1]; I[3 * k + 1] = I[3 * k + 2]; I[3 * k + 2] = t; }
  }
  return mesh(P, I, { closed: false, crease });
}
// cloison wires / thin inlays: sub-millimetre walls shade as one rounded bead (real cloisonné wire is rounded on top),
// and the smoothed walls share the top's vertices (a hard-edged wire costs 2.5x the vertices)
const WIRE = 100;
/** straight flat strip (a cloison wire, a glow channel) as a slab from a to b, width wd */
const slabStrip = (a, b, wd, w0, sd, z0, z1, crease = 40) => {
  const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...d) || 1, n = [-d[1] / l * wd / 2, d[0] / l * wd / 2];
  return slab([[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]], w0, sd, z0, z1, [], true, false, crease);
};
/** flush gold inlay line along a closed polygon on a flat face (0.1 proud, sunk 0.35) */
function inlayRing(poly, w0, sd, wd = 0.7, z0 = -0.35, z1 = 0.1) {
  const pts = dedupe(poly), A = offsetPoly(pts, wd / 2), B = offsetPoly(pts, -wd / 2), n = pts.length, P = [], I = [], E = [];
  for (const [x, y] of A) P.push(x, y, w0 + sd * z1);
  for (const [x, y] of B) P.push(x, y, w0 + sd * z1);
  for (const [x, y] of A) P.push(x, y, w0 + sd * z0);
  for (const [x, y] of B) P.push(x, y, w0 + sd * z0);
  let ar = 0;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; ar += p[0] * q[1] - q[0] * p[1]; }
  const sg = ar > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, e = [(pts[j][1] - pts[i][1]) * sg, -(pts[j][0] - pts[i][0]) * sg, 0];
    I.push(i, j, n + j, i, n + j, n + i); E.push([0, 0, sd], [0, 0, sd]);                                   // top
    I.push(i, j, 2 * n + j, i, 2 * n + j, 2 * n + i); E.push(e, e);                                         // outer wall
    I.push(n + i, n + j, 3 * n + j, n + i, 3 * n + j, 3 * n + i); E.push(e.map((v) => -v), e.map((v) => -v)); // inner wall
  }
  for (let k = 0; k < E.length; k++) {
    const a = I[3 * k] * 3, b = I[3 * k + 1] * 3, c = I[3 * k + 2] * 3;
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], e = E[k];
    if (nn[0] * e[0] + nn[1] * e[1] + nn[2] * e[2] < 0) { const t = I[3 * k + 1]; I[3 * k + 1] = I[3 * k + 2]; I[3 * k + 2] = t; }
  }
  return mesh(P, I, { closed: false, crease: WIRE });
}
const inlayLine = (pts, w0, sd, wd = 0.7, z1 = 0.1) => slab(ribbonPoly(pts, wd), w0, sd, -0.35, z1, [], false);   // flush: no walls

/** filigree scroll: a spiral of gold wire in the side plane at w (turns, radius r0 shrinking inward). */
function scrollPts(c, r0, a0, turns, dir, w, n = 18, shrink = 0.72) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = (a0 + dir * u * turns * 360) * D2R, r = r0 * (1 - shrink * u);
    pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, w]);
  }
  return pts;
}
/**
 * cloud-scroll band (祥雲 filigree): a running wave from s0 to s1 round baseline t0; every crest / trough grows a curl
 * that starts on the wave, tangent to it, and winds over (up at crests, down at troughs)
 */
function cloudBand(s0, s1, t0, proj, { amp = 2.2, step = 24, r = 0.48, curl = 3.0 } = {}) {
  const geos = [];
  const n = Math.round((s1 - s0) / step);
  const wave = [];
  for (let i = 0; i <= n * 8; i++) { const s = s0 + (s1 - s0) * i / (n * 8); wave.push(proj([s, t0 + Math.sin((s - s0) / step * Math.PI * 2) * amp])); }
  geos.push(sweep(wave, r, { seg: n * 8, radial: 4 }));
  for (let k = 0; k < n; k++) {
    const up = k % 2 === 0, s = s0 + (k + (up ? 0.25 : 0.75)) * step, tc = t0 + (up ? amp : -amp);
    const c = [s, tc + (up ? curl : -curl)];
    // starts at the crest (angle 270° / 90° round c), runs on in the wave's direction (+s) and winds inward
    geos.push(sweep(scrollPts(c, curl, up ? 270 : 90, 0.95, up ? 1 : -1, 0, 9).map(([a, b]) => proj([a, b])), r * 0.85, { seg: 9, radial: 4 }));
  }
  return merge(geos);
}
/** points (s, t) dropped onto a mesh along -w (sd = 1, right flank) or +w: [s, t, w + lift] (filigree on curved shells) */
function projector(geo, sd, lift = 0.3, dflt = 0) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const rc = new THREE.Raycaster(), d = new THREE.Vector3(-sd, 0, 0);
  return ([s, t]) => { rc.set(V(s, t, 120 * sd), d); const h = rc.intersectObject(mesh, false)[0]; return [s, t, h ? h.point.x + lift * sd : dflt]; };
}
/** (s, w) dropped onto a mesh from above: the surface height t (plates on the receiver top) */
function projectorT(geo, dflt = 0) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const rc = new THREE.Raycaster(), d = new THREE.Vector3(0, -1, 0);
  return (s, w) => { rc.set(V(s, 200, w), d); const h = rc.intersectObject(mesh, false)[0]; return h ? h.point.y : dflt; };
}
/** rectangle corners subdivided so a sweep stays straight along the edges */
function rectLoop(c0, c1, n = 4) {
  const [a, b] = c0, [e, f] = c1, out = [];
  const edge = (p, q) => { for (let i = 0; i < n; i++) out.push([p[0] + (q[0] - p[0]) * i / n, p[1] + (q[1] - p[1]) * i / n]); };
  edge([a, b], [e, b]); edge([e, b], [e, f]); edge([e, f], [a, f]); edge([a, f], [a, b]);
  return out;
}
/** a tube loop round a superellipse cross-section (ferrules) */
function seLoop(ring, r, closed = true) { return sweep(ring, r, { seg: Math.max(16, ring.length * 2), radial: 5, closed }); }

// ------------------------------------------------------------------------------------------ surfaces

const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
/** indexed [s,t,w] triangles -> non-indexed geometry with creased normals; closed solids are wound outward */
function mesh(P, I, { crease = 40, closed = true } = {}) {
  const pos = new Float32Array(P.length);
  for (let i = 0; i < P.length; i += 3) { pos[i] = P[i + 2]; pos[i + 1] = P[i + 1]; pos[i + 2] = -P[i]; }
  if (closed) {
    let vol = 0;
    for (let i = 0; i < I.length; i += 3) {
      _va.fromArray(pos, I[i] * 3); _vb.fromArray(pos, I[i + 1] * 3); _vc.fromArray(pos, I[i + 2] * 3);
      vol += _va.dot(_vb.cross(_vc));
    }
    if (vol < 0) for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(I);
  return toCreasedNormals(geo.toNonIndexed(), crease * D2R);
}
/** loft through closed rings of [s,t,w] points (equal counts); ends capped by a fan to the ring centroid */
function loft(rings, { capA = true, capB = true, crease = 40 } = {}) {
  const n = rings[0].length, P = [], I = [];
  for (const r of rings) for (const p of r) P.push(p[0], p[1], p[2]);
  for (let k = 0; k + 1 < rings.length; k++) for (let i = 0; i < n; i++) {
    const a = k * n + i, b = k * n + (i + 1) % n;
    I.push(a, a + n, b, b, a + n, b + n);
  }
  const cap = (k, rev) => {
    const r = rings[k], c = [0, 0, 0];
    for (const p of r) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
    const ci = P.length / 3;
    P.push(...c);
    for (let i = 0; i < n; i++) { const a = k * n + i, b = k * n + (i + 1) % n; if (rev) I.push(ci, b, a); else I.push(ci, a, b); }
  };
  if (capA) cap(0, false);
  if (capB) cap(rings.length - 1, true);
  return mesh(P, I, { crease, closed: capA && capB });
}
/**
 * Bake tessellation (12 mm, up to 14 split rounds) of the triangles that need it: thin slivers (height under `thin`
 * over their longest edge: wires, inlay lines, ribbons) are kept whole, splitting them only multiplies triangles
 * without changing the AO they get.
 */
function tessellateFat(geo, maxEdge, thin) {
  const p = geo.attributes.position, n = geo.attributes.normal, keep = [], fat = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const L = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    (2 * area / Math.max(L, 1e-9) < thin ? keep : fat).push(i);
  }
  const pick = (list) => {
    const g = new THREE.BufferGeometry(), P = new Float32Array(list.length * 9), N = new Float32Array(list.length * 9);
    list.forEach((i, k) => { for (let j = 0; j < 3; j++) for (let d = 0; d < 3; d++) { P[k * 9 + j * 3 + d] = p.array[(i + j) * 3 + d]; N[k * 9 + j * 3 + d] = n.array[(i + j) * 3 + d]; } });
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    return g;
  };
  if (!fat.length) return geo;
  const t = new TessellateModifier(maxEdge, 14).modify(pick(fat));
  for (const k of Object.keys(t.attributes)) if (k !== 'position' && k !== 'normal') t.deleteAttribute(k);
  return keep.length ? mergeGeometries([t, pick(keep)], false) : t;
}
/** section() along s with a vertex ring every `step` mm (long extrusions get a bake grid without splitting) */
function stepSection(spec, s0, s1, { bevel = 0.6, bevelSeg = 2, curveSeg = 3, step = 12 } = {}) {
  const shape = makeShape(spec), len = Math.abs(s1 - s0), b = Math.max(0, Math.min(bevel, len / 2 - 0.05)), depth = Math.max(0.02, len - 2 * b);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: bevelSeg, curveSegments: curveSeg, steps: Math.max(1, Math.ceil(depth / step)) });
  geo.translate(0, 0, b + Math.min(s0, s1));
  geo.scale(1, 1, -1);
  // the mirror (scale z -1) turned the winding inside out: swap two corners of every triangle (ExtrudeGeometry is
  // non-indexed, so swap the vertices themselves)
  const idx = geo.index;
  if (idx) { const a = idx.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
  else { const a = geo.attributes.position.array; for (let i = 0; i < a.length; i += 9) for (let c = 0; c < 3; c++) { const t = a[i + 3 + c]; a[i + 3 + c] = a[i + 6 + c]; a[i + 6 + c] = t; } }
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  return toCreasedNormals(geo.index ? geo.toNonIndexed() : geo, 38 * D2R);
}
/**
 * Width taper along s: w *= f(s) (gunkit x = w, z = -s); normals through the inverse-transpose of the map so the
 * shading follows the tapered surface.
 */
function taperW(geo, f) {
  const p = geo.attributes.position, n = geo.attributes.normal, e = 0.5;
  for (let i = 0; i < p.count; i++) {
    const sv = -p.getZ(i), x = p.getX(i), k = f(sv), dk = (f(sv + e) - f(sv - e)) / (2 * e);   // df/ds
    p.setX(i, x * k);
    if (n) {
      // map (x, y, z) -> (x k(s), y, z) with s = -z: J = [[k, 0, -x dk], [0, 1, 0], [0, 0, 1]]; n' = J^-T n
      const nx = n.getX(i) / k, ny = n.getY(i), nz = n.getZ(i) + x * dk * n.getX(i) / k, l = Math.hypot(nx, ny, nz) || 1;
      n.setXYZ(i, nx / l, ny / l, nz / l);
    }
  }
  p.needsUpdate = true; if (n) n.needsUpdate = true;
  geo.computeBoundingBox?.();
  return geo;
}
/** recompute creased normals after moving vertices */
const renormal = (geo, crease = 40) => { geo.deleteAttribute('normal'); return toCreasedNormals(geo, crease * D2R); };
/** flat band (chamfered rectangle section wd x th) along pts with outward normals nrm: cord wraps, stitched seams */
function bandAlong(pts, nrm, wd, th, sink = 0.2, o = {}) {
  const rings = [];
  for (let i = 0; i < pts.length; i++) {
    const p = V(...pts[i]), a = V(...pts[Math.max(0, i - 1)]), b = V(...pts[Math.min(pts.length - 1, i + 1)]);
    const T = b.sub(a).normalize(), N = V(...nrm[i]).normalize(), B = new THREE.Vector3().crossVectors(T, N).normalize();
    N.crossVectors(B, T).normalize();
    const c = p.clone().addScaledVector(N, th / 2 - sink), h = wd / 2, z = th / 2, ch = Math.min(h, z) * 0.6;
    rings.push((o.flat ? [[-h, -z], [-h * 0.72, z], [h * 0.72, z], [h, -z]] : [[-h, 0], [-h + ch, z], [h - ch, z], [h, 0], [h - ch, -z], [-h + ch, -z]]).map(([x, y]) => {
      const q = c.clone().addScaledVector(B, x).addScaledVector(N, y);
      return [-q.z, q.y, q.x];
    }));
  }
  return loft(rings, { crease: 50 });
}

// ------------------------------------------------------------------------------------------ cloisonné

/**
 * Cloisonné feather plate in the side plane: a gold backing plate, enamel bands recessed between raised gold cloison
 * wires (rows: inner / middle / outer + a tip zone, `en` = 4 material keys), barb wires every 1 / `lines` of the length
 * at `ang`° off the rachis, two row wires, the outline wire; the rachis is a glowing channel between two wires when
 * `glow` is given (and every `main`-th barb too: the 羽脈紋), else a raised gold ribbon.
 * Coordinates: x = barb line position at the rachis (0 quill .. 1 tip), f = 0 at the rachis channel .. 1 at the edge.
 * Returns [[geo, mat], ...] (the caller may bend / project them before adding).
 */
function cloisonne(o) {
  const { a, b, hu, hd, w0, sd, en, trim, glow = null, lines = 12, main = 0, rows = [0.36, 0.7], tipX = 0.84,
    plate = 1.0, enT = 0.5, rim = 1.1, ang = 45, rachis = 1.0, ww = 0.42, wh = 0.28, nx = 16, lift = 0, plateBevel = 0.3, noPlate = false, dome = 0.32 } = o;
  const F = axisFrame(a, b), k = 1 / (F.L * Math.tan(ang * D2R));
  const HW = (side) => (side > 0 ? hu : hd);
  const off = (u, f, side) => Math.max(0, Math.min(HW(side)(u), rachis + f * (HW(side)(u) - rachis)));
  const at = (x, f, side) => { let u = x; for (let i = 0; i < 8; i++) u = Math.min(1, x + off(u, f, side) * k); return F.P(u, side * off(u, f, side)); };
  const z1 = plate + enT, zw0 = z1 - 0.12, zw1 = z1 + wh;
  const out = [];
  // gold backing plate (rim margin round the vane), standing off the face by `lift` when stacked over other feathers
  // (noPlate: the second face of a two-faced feather, whose plate the first face already built)
  const back = vaneOutline(F.P(-0.012, 0), F.P(1.012, 0), (u) => hu(u) + rim, (u) => hd(u) + rim, Math.max(10, nx)).map(([x, y]) => [x, y]);
  if (!noPlate) out.push([plateBevel === 'closed' ? slab(back, w0, sd, -lift, plate, [], true, true) : plateBevel ? PF(back, { ...onFace(w0, sd, -lift, plate), bevel: plateBevel, bevelSeg: 1, curveSeg: 2 }) : slab(back, w0, sd, -lift - 0.2, plate), trim]);
  // enamel bands (rows), recessed between the cloisons; each cell's normals domed (the glaze pools proud in the
  // middle of a cell and rolls down to its wires: the sweep runs over every cell instead of one flat sheet)
  const bandPoly = (xa, xb, fa, fb, side) => {
    const pts = [];
    for (let i = 0; i <= nx; i++) pts.push(at(xa + (xb - xa) * i / nx, fa, side));
    for (let i = nx; i >= 0; i--) pts.push(at(xa + (xb - xa) * i / nx, fb, side));
    return pts;
  };
  const cell = (poly) => domed(slab(poly, w0, sd, plate - 0.2, z1, [], false), poly, sd, dome);
  const fr = [0, ...rows, 1], nT = Math.max(3, Math.round(nx * 0.4));
  for (const side of [1, -1]) {
    const rowKeys = fr.length === 2 ? [en[0]] : fr.length === 3 ? [en[0], en[2]] : [en[0], en[1], en[2]];
    for (let r = 0; r < fr.length - 1; r++) out.push([cell(bandPoly(0, tipX, fr[r], fr[r + 1], side)), rowKeys[Math.min(r, rowKeys.length - 1)]]);   // walls hide under the wires
    const tp = [];
    for (let i = 0; i <= nT; i++) tp.push(at(tipX + (0.995 - tipX) * i / nT, 0, side));
    for (let i = nT; i >= 0; i--) tp.push(at(tipX + (0.995 - tipX) * i / nT, 1, side));
    out.push([cell(tp), en[en.length - 1]]);
  }
  // cloisons: row wires and the outline (ribbons), barbs (straight), the rachis
  const wires = [], glows = [];
  const ribbon = (pts) => slab(ribbonPoly(dedupe(pts), ww), w0, sd, zw0, zw1, [], true, false, WIRE);
  for (const side of [1, -1]) {
    for (const f of [...rows, 1]) { const pts = []; for (let i = 0; i <= nx; i++) pts.push(at(0.995 * i / nx, f, side)); wires.push(ribbon(pts)); }
    for (let j = 0; j <= lines; j++) {
      const x = (j / lines) * 0.97, A = at(x, 0, side), B = at(x, 1, side);
      const d = [B[0] - A[0], B[1] - A[1]], l = Math.hypot(...d);
      if (l < 0.8) continue;
      if (glow && main && j % main === 0 && j > 0 && j < lines) {
        const nn = [-d[1] / l, d[0] / l], g0 = 0.3 + ww / 2;
        for (const q of [1, -1]) wires.push(slabStrip([A[0] + nn[0] * g0 * q, A[1] + nn[1] * g0 * q], [B[0] + nn[0] * g0 * q, B[1] + nn[1] * g0 * q], ww, w0, sd, zw0, zw1, WIRE));
        glows.push(slabStrip(A, B, 0.62, w0, sd, z1 - 0.3, z1 + 0.03));          // just over the enamel, between its two wires
      } else wires.push(slabStrip(A, B, ww, w0, sd, zw0, zw1, WIRE));
    }
  }
  // rachis: stops where the vane gets narrower than the channel
  let uEnd = 0.97;
  while (uEnd > 0.5 && Math.min(hu(uEnd), hd(uEnd)) < rachis + 0.6) uEnd -= 0.01;
  if (glow) {
    for (const q of [1, -1]) wires.push(slabStrip(F.P(-0.01, q * (rachis - ww / 2)), F.P(uEnd, q * (rachis - ww / 2)), ww, w0, sd, zw0, zw1, WIRE));
    glows.push(slabStrip(F.P(-0.01, 0), F.P(uEnd, 0), 2 * rachis - 2 * ww + 0.1, w0, sd, z1 - 0.35, z1 - 0.08));
  } else wires.push(slabStrip(F.P(-0.01, 0), F.P(uEnd, 0), 2 * rachis, w0, sd, zw0, zw1 + 0.12, WIRE));
  out.push([merge(wires.filter(Boolean)), trim]);
  if (glows.length) out.push([merge(glows), glow]);
  return out.filter(([geo]) => geo);
}
/**
 * Domes a flat cell's face normals (the top face: normal along ±w): each vertex's normal leans away from the cell's
 * middle line by `k` (strips: across their width, so a band reads as a rounded glaze bead between two wires).
 */
function domed(geo, poly, sd, k = 0.32) {
  if (!geo || !k) return geo;
  // the cell's spine: least-squares line through its outline (s, t)
  let cs = 0, ct = 0;
  for (const [x, y] of poly) { cs += x; ct += y; }
  cs /= poly.length; ct /= poly.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of poly) { const dx = x - cs, dy = y - ct; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
  let wmax = 1e-3;
  for (const [x, y] of poly) wmax = Math.max(wmax, Math.abs(-(x - cs) * uy + (y - ct) * ux));
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getX(i)) < 0.9) continue;                         // walls keep their normals
    const s = -p.getZ(i), t = p.getY(i), o = (-(s - cs) * uy + (t - ct) * ux) / wmax;
    // three axes: x = w, y = t, z = -s; across direction (in s, t) = (-uy, ux)
    const ax = -uy * o * k, ay = ux * o * k;
    const nx = Math.sign(n.getX(i)), ny = ay, nz = -ax, l = Math.hypot(nx, ny, nz);
    n.setXYZ(i, nx / l, ny / l, nz / l);
  }
  n.needsUpdate = true;
  return geo;
}
/** bends feather geometry about its frame F: w += sd * (bend * u² + twist * u * o / 10) (u 0..1 along, o mm across) */
function bendFeather(list, F, sd, bend, twist = 0, creaseOf = () => 40) {
  return list.map(([geo, m]) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = -p.getZ(i), t = p.getY(i), ds = s - F.a[0], dt = t - F.a[1];
      const u = Math.max(0, (ds * F.ux + dt * F.uy) / F.L), o = -ds * F.uy + dt * F.ux;
      p.setX(i, p.getX(i) + sd * (bend * u * u + twist * u * o / 10));
    }
    return [renormal(geo, creaseOf(m)), m];
  });
}
/**
 * Lens-section feather loft (crest plumes): spine(u) -> [s,t,w] root -> tip, in-plane half widths hu / hd, thickness
 * th(u); a raised rachis; top and bottom faces split into enamel rows by |x| (mats[0..rows], tip zone mats[last]).
 * Returns { list: [[geo, mat]], surf(u, x, face) -> [s,t,w] }.
 */
function featherLoft(spine, hu, hd, th, { nU = 16, nX = 10, rows = [0.5], mats, tipU = 0.85, rachisH = 0.45, roll = () => 0 } = {}) {
  const Nw = new THREE.Vector3(1, 0, 0);
  const frame = (u) => {
    const c = V(...spine(u)), T = V(...spine(Math.min(1, u + 0.01))).sub(V(...spine(Math.max(0, u - 0.01)))).normalize();
    const Wd = new THREE.Vector3().crossVectors(Nw, T).normalize(), N = new THREE.Vector3().crossVectors(T, Wd).normalize();
    // roll about the spine (radians, may vary along u): turns the vane's faces out of the side plane (a fan, not a row)
    const r = roll(u);
    if (r) { const cr = Math.cos(r), sr = Math.sin(r), w2 = Wd.clone().multiplyScalar(cr).addScaledVector(N, sr); N.multiplyScalar(cr).addScaledVector(Wd, -sr); Wd.copy(w2); }
    return { c, Wd, N };
  };
  const surfV = (u, x, face) => {
    const { c, Wd, N } = frame(u), h = x >= 0 ? hu(u) : hd(u);
    const z = (th(u) / 2) * Math.sqrt(Math.max(0, 1 - x * x)) + rachisH * (1 - u * 0.7) * Math.exp(-((x / 0.11) ** 2));
    return c.addScaledVector(Wd, x * h).addScaledVector(N, z * face);
  };
  const out = new Map();
  for (const face of [1, -1]) {
    const P = [];
    for (let i = 0; i <= nU; i++) for (let j = 0; j <= nX; j++) P.push(surfV(i / nU, -1 + 2 * j / nX, face));
    const idx = new Map();
    for (let i = 0; i < nU; i++) for (let j = 0; j < nX; j++) {
      const um = (i + 0.5) / nU, xm = Math.abs(-1 + 2 * (j + 0.5) / nX);
      const m = um > tipU ? mats[mats.length - 1] : mats[rows.filter((r) => xm > r).length];
      const a = i * (nX + 1) + j, b = a + 1, c = a + nX + 1, d = c + 1;
      if (!idx.has(m)) idx.set(m, []);
      if (face > 0) idx.get(m).push(a, c, b, b, c, d); else idx.get(m).push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(P);
    geo.setIndex([...idx.values()].flat());
    geo.computeVertexNormals();
    for (const [m, I] of idx) {
      const gm = new THREE.BufferGeometry();
      gm.setAttribute('position', geo.attributes.position); gm.setAttribute('normal', geo.attributes.normal); gm.setIndex(I);
      const ni = gm.toNonIndexed();
      if (!out.has(m)) out.set(m, []);
      out.get(m).push(ni);
    }
  }
  const surf = (u, x, face, lift = 0) => { const v = surfV(u, x, face); if (lift) v.addScaledVector(frame(u).N, lift * face); return [-v.z, v.y, v.x]; };
  return { list: [...out].map(([m, l]) => [merge(l), m]), surf };
}

// ------------------------------------------------------------------------------------------ lettering

// folded seal script (九疊篆-like) on a 10 x 10 grid: axis-aligned strokes [x0, y0, x1, y1] (our own drawings)
const SEAL = {
  畢: [[2, 10, 8, 10], [2, 6.6, 8, 6.6], [2, 10, 2, 6.6], [8, 10, 8, 6.6], [2, 8.3, 8, 8.3], [5, 10, 5, 6.6], [0.8, 5.2, 9.2, 5.2],
    [3.1, 5.2, 3.1, 3.5], [6.9, 5.2, 6.9, 3.5], [3.1, 3.5, 6.9, 3.5], [0.8, 1.9, 9.2, 1.9], [5, 5.2, 5, 0]],
  方: [[5, 10, 5, 8.4], [0.8, 8.4, 9.2, 8.4], [3.4, 8.4, 3.4, 0.6], [3.4, 0.6, 1.2, 0.6], [1.2, 0.6, 1.2, 2.2], [3.4, 5.4, 8.2, 5.4], [8.2, 5.4, 8.2, 0.6], [8.2, 0.6, 6, 0.6]],
  鬼: [[4.4, 10, 5.6, 10], [5, 10, 5, 9], [1.8, 9, 8.2, 9], [1.8, 5.4, 8.2, 5.4], [1.8, 9, 1.8, 5.4], [8.2, 9, 8.2, 5.4], [1.8, 7.2, 8.2, 7.2], [5, 9, 5, 5.4],
    [3.6, 5.4, 3.6, 0.8], [3.6, 0.8, 0.8, 0.8], [6.4, 5.4, 6.4, 0.8], [6.4, 0.8, 9.4, 0.8], [9.4, 0.8, 9.4, 2.4], [6.4, 3.2, 8.4, 3.2], [8.4, 3.2, 8.4, 4.4]],
  車: [[1, 9.6, 9, 9.6], [2.2, 7.8, 7.8, 7.8], [2.2, 3.4, 7.8, 3.4], [2.2, 7.8, 2.2, 3.4], [7.8, 7.8, 7.8, 3.4], [2.2, 5.6, 7.8, 5.6], [0.6, 1.6, 9.4, 1.6], [5, 10, 5, 0]],
};
/** raised seal-glyph strokes (boxes, square caps) on a face: glyph box lower-left corner c [s, t] (reading +s as seen from sd) */
function sealGlyph(ch, c, size, w0, sd, z0, z1, sw = 0.95) {
  const k = size / 10, out = [], f = onFace(w0, sd, z0, z1);
  for (const [x0, y0, x1, y1] of SEAL[ch]) {
    const P = (x, y) => [c[0] + sd * x * k, c[1] + y * k];
    const a = P(x0, y0), b = P(x1, y1), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    out.push(box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, f.cw], [x0 === x1 ? sw * k : L + sw * k, x0 === x1 ? L + sw * k : sw * k, f.w], { r: 0 }));
  }
  return merge(out);
}
// small stroke font (4 x 6 cell, polylines) for the engraved serial lines (our own glyphs)
const FONT = {
  A: [[[0, 0], [0, 4], [2, 6], [4, 4], [4, 0]], [[0, 2.6], [4, 2.6]]], B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 6], [1, 6], [0, 5], [0, 1], [1, 0], [4, 0]]], E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]], F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2, 3]]], H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 6], [3, 6]], [[2, 6], [2, 0]], [[1, 0], [3, 0]]], L: [[[0, 6], [0, 0], [4, 0]]], M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]], O: [[[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]]],
  P: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]], R: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[2, 3], [4, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]], W: [[[0, 6], [1, 0], [2, 4], [3, 0], [4, 6]]], Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  0: [[[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]], [[0.6, 1.2], [3.4, 4.8]]], 1: [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
  2: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]], 3: [[[0, 6], [4, 6], [2, 3.6], [3, 3.6], [4, 2.6], [4, 1], [3, 0], [1, 0], [0, 1]]],
  4: [[[3, 0], [3, 6], [0, 2], [4, 2]]], 6: [[[3.5, 6], [1.5, 6], [0, 4], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3]]],
  7: [[[0, 6], [4, 6], [1.5, 0]]], '-': [[[0.8, 3], [3.2, 3]]],
};

// ------------------------------------------------------------------------------------------ looks / layout

// variant looks (the twin shares the skeleton, §2.26)
const LOOKS = {
  bifang: {
    id: 'bifang', body: 'porcelain', trim: 'gold', trim2: 'bronze_aged', dark: 'black_chrome', chassis: 'steel_dark',
    en: ['glaze_teal', 'glaze_turquoise', 'glaze_vermilion', 'porcelain'],          // cloisonné rows: rachis, middle, edge, tip
    crestEn: ['glaze_teal', 'glaze_vermilion', 'glaze_vermilion', 'glaze_vermilion'], eyeRing: 'glaze_vermilion', scroll: 'glaze_cobalt',
    vein: 'glow_sun', crest: 'lacquer_red', medal: 'lacquer_red', claw: 'bronze_aged', toe: 'gold', wrap: 'leather_pebble', cord: 'silk_red',
    eye: 'glaze_teal', pupil: 'glaze_black', seal: ['畢', '方'], serial: 'M03-0417', name: 'PYREWING', hooked: false, focus: 'pearl', throat: 'glow_vermilion',
    mag: { coreMode: 1, coreTint: '#ff8a2a', coreScale: 1.6 },
  },
  guiche: {
    id: 'guiche', body: 'lacquer_black', trim: 'silver_aged', trim2: 'steel_bright', dark: 'black_chrome', chassis: 'steel_dark',
    en: ['glaze_inkteal', 'glaze_aubergine', 'glaze_aubergine', 'glaze_coldteal'],
    crestEn: ['glaze_aubergine', 'glaze_aubergine', 'glaze_coldteal', 'glaze_coldteal'], eyeRing: 'glaze_aubergine', scroll: 'glaze_inkteal',
    vein: 'glow_purple', crest: 'glaze_aubergine', medal: 'glaze_aubergine', claw: 'black_chrome', toe: 'silver_aged', wrap: 'leather_black', cord: 'silk_violet',
    eye: 'crystal', pupil: 'glaze_black', seal: ['鬼', '車'], serial: 'M03-0666', name: 'GLOOMWING', hooked: true, focus: 'eyes', throat: 'glow_purple',
    mag: { coreMode: 1, coreTint: '#b54bff', coreScale: 1.6 },
  },
};

// wing geometry (rest = folded back 10° along the shoulder; open = 69° about a compound hinge, up and out)
const HINGE = [420, 70, 38];            // s, t, |w| of the shoulder ball joints
const BONE_L = 180;
const tv = (s, t, w) => new THREE.Vector3(w, t, -s);           // gunkit (s,t,w) -> three
const st = (v) => [-v.z, v.y, v.x];                            // three -> (s,t,w)
function wingHinge(sd) {
  // folded direction d0 (backwards, 10° up) -> open direction d1 (up, out, a little back): rotation axis + angle
  const d0 = tv(-Math.cos(10 * D2R), Math.sin(10 * D2R), 0).normalize();
  const d1 = tv(-0.22, 0.78, 0.58 * sd).normalize();
  const axis = new THREE.Vector3().crossVectors(d0, d1).normalize();
  const ang = Math.acos(d0.dot(d1)) / D2R;
  return { axis, ang, q: new THREE.Quaternion().setFromAxisAngle(axis, ang * D2R), sAxis: st(axis).map((x) => +x.toFixed(4)) };
}
/** rest point (s,t,w) on a wing bone -> where it sits with the wing open (s,t,w) */
function openPoint(p, sd) {
  const h = wingHinge(sd), piv = tv(HINGE[0], HINGE[1], HINGE[2] * sd);
  const v = tv(...p).sub(piv).applyQuaternion(h.q).add(piv);
  return st(v).map((x) => +x.toFixed(2));
}

// the flank vane (both sides): quill -> tip along the 6° rachis
const VA = [350, 0.6], VB = [616, 28.6];
const VHU = vaneW(16.5, 0.16, 0.58, 0.2), VHD = vaneW(20, 0.2, 0.62, 0.2);
const FLANK = 32;                       // receiver half width (flat flank)

// receiver shells: side outline (the old profile) sampled for the top / bottom of every lofted cross-section
const SHELL = [[236, -15, 1], [640, -15, 1], [652, 4, 8], [646, 30, 12], [604, 52, 24], [540, 61, 16], [330, 61, 16], [266, 56, 18], [236, 46, 4]];
const SHELL_POLY = makeShape(SHELL).getPoints(10).map((v) => [v.x, v.y]);
const SHELL_SMAX = Math.max(...SHELL_POLY.map((p) => p[0]));
function vExtent(poly, s) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if ((p[0] - s) * (q[0] - s) > 0 || p[0] === q[0]) continue;
    const t = p[1] + (q[1] - p[1]) * (s - p[0]) / (q[0] - p[0]);
    lo = Math.min(lo, t); hi = Math.max(hi, t);
  }
  return [lo, hi];
}
/** shell cross-section at s, inset by e (end bevels): flat bottom, rounded corners, flat flank, elliptical shoulder, crowned roof */
function shellDims(s, e = 0) {
  const [tb0, tt0] = vExtent(SHELL_POLY, s);
  const tb = tb0 + e, tt = tt0 - e, FW = FLANK - e, H = Math.max(0.6, tt - tb);
  const rb = Math.max(0.25, Math.min(3.2 - e * 0.5, H * 0.22)), at = Math.max(rb, Math.min(15, H * 0.3)), aw = at * 0.8, crown = 1.2 * at / 15;
  return { tb, tt, FW, H, rb, at, aw, crown, flankTop: tt - crown - at };
}
function shellRing(s, e = 0) {
  const { tb, tt, FW, rb, at, aw, crown, flankTop } = shellDims(s, e);
  const half = [[0, tb], [(FW - rb) * 0.36, tb], [(FW - rb) * 0.72, tb]];
  for (let k = 0; k <= 4; k++) { const a = (-90 + 22.5 * k) * D2R; half.push([FW - rb + rb * Math.cos(a), tb + rb + rb * Math.sin(a)]); }
  for (let k = 1; k <= 4; k++) half.push([FW, tb + rb + (flankTop - tb - rb) * k / 5]);
  for (let k = 0; k <= 8; k++) { const a = 11.25 * k * D2R; half.push([FW - aw + aw * Math.cos(a), flankTop + at * Math.sin(a)]); }
  const wr = FW - aw;
  for (const x of [0.66, 0.33]) half.push([wr * x, tt - crown * x * x]);
  half.push([0, tt]);
  const ring = half.map(([w, t]) => [s, t, w]);
  for (let i = half.length - 2; i >= 1; i--) ring.push([s, half[i][1], -half[i][0]]);
  return ring;
}
/** one shell from s0 to s1, bevel radius b0 / b1 at the ends (0 = plain cap), stations every ~step mm */
function shellLoft(s0, s1, b0, b1, step) {
  const rings = [];
  const bev = (sEnd, dir, b) => { const out = []; for (let j = 0; j <= 3; j++) { const th = (j / 3) * Math.PI / 2; out.push(shellRing(sEnd - dir * b * (1 - Math.sin(th)), b * (1 - Math.cos(th)))); } return out; };
  if (b0) rings.push(...bev(s0, -1, b0).reverse());
  const a = s0 + b0, z = s1 - b1, n = Math.max(1, Math.round((z - a) / step));
  for (let i = b0 ? 1 : 0; i <= (b1 ? n - 1 : n); i++) rings.push(shellRing(a + (z - a) * i / n));
  if (b1) rings.push(...bev(s1, 1, b1));
  return loft(rings, { crease: 40 });
}

// beak curves (upper: culmen tc, tomium tm, half width W; lower: tomium ltm, gonys lg, half width lW); 鬼車 hooks 20°
const BEAKS = {
  bifang: {
    tip: 962, ltip: 954,
    tc: [[806, 34], [826, 32.6], [860, 29], [900, 23.2], [935, 16.6], [952, 12.4], [962, 9.0]],
    tm: [[806, 13.4], [840, 12.7], [880, 11.9], [920, 10.9], [950, 10.0], [962, 9.0]],
    W: [[806, 16.2], [826, 15.4], [860, 13.2], [900, 9.8], [935, 5.8], [952, 2.9], [962, 0.5]],
    ltm: [[810, -13.4], [840, -12.8], [880, -11.9], [920, -10.8], [945, -10.0], [954, -9.6]],
    lg: [[810, -34], [840, -30.5], [880, -24.6], [920, -17.6], [945, -12.6], [954, -10.2]],
    lW: [[810, 15.4], [840, 13.6], [880, 10.4], [920, 6.6], [945, 3.0], [954, 0.5]],
  },
  guiche: {
    tip: 959, ltip: 944,
    tc: [[806, 34], [826, 32.6], [860, 29], [900, 23.0], [930, 17.6], [946, 13.0], [954, 7.6], [959, 1.6]],
    tm: [[806, 13.4], [840, 12.6], [880, 11.6], [920, 10.4], [938, 9.5], [948, 7.2], [955, 3.8], [959, 1.4]],
    W: [[806, 16.2], [826, 15.4], [860, 13.2], [900, 9.8], [930, 6.2], [946, 3.6], [955, 1.8], [959, 0.4]],
    ltm: [[810, -13.4], [840, -12.6], [880, -11.6], [920, -10.4], [944, -9.0]],
    lg: [[810, -34], [840, -30.0], [880, -23.0], [920, -15.0], [944, -10.0]],
    lW: [[810, 15.4], [840, 13.6], [880, 10.2], [920, 6.0], [944, 0.5]],
  },
};
/** the beak's sampled curves, upper / lower cross-sections and the upper cheek surface w(s, t) */
function beakKit(key) {
  const B = BEAKS[key], tc = curveFn(B.tc), tm = curveFn(B.tm), W = curveFn(B.W), ltm = curveFn(B.ltm), lg = curveFn(B.lg), lW = curveFn(B.lW);
  const g = (x) => { const e = 0.06, xp = Math.sqrt(x * x + e * e) - e, x1 = Math.sqrt(0.9 * 0.9 + e * e) - e; return Math.pow(Math.max(0, 1 - xp / x1), 1.35); };
  const CX = [0, 0.06, 0.15, 0.27, 0.4, 0.53, 0.66, 0.78, 0.87];
  const up = (s) => { const w = W(s), c = tc(s), m = tm(s), k = Math.min(1, w / 6); return { w, c, m, k, H: Math.max(0.3, c - m), lip: 1.6 * k }; };
  // sheath groove: a bulge then a groove where the bill sheath leaves the head
  const inflate = (s) => 0.45 * Math.exp(-(((s - 829.5) / 1.5) ** 2)) - 0.55 * Math.exp(-(((s - 833.5) / 1.3) ** 2));
  const mirrorRing = (s, half) => {
    const ring = half.map(([w, t]) => [s, t, w]);
    for (let i = half.length - 2; i >= 1; i--) ring.push([s, half[i][1], -half[i][0]]);
    return ring;
  };
  const puff = (half, d) => {
    if (!d) return half;
    const n = half.length, cw = 0, ct = half.reduce((a, p) => a + p[1], 0) / n;
    return half.map(([w, t]) => { const dx = w - cw, dy = t - ct, l = Math.hypot(dx, dy) || 1; return [w + dx / l * d, t + dy / l * d]; });
  };
  const upperRing = (s) => {
    const { w, c, m, k, H, lip } = up(s), arch = Math.min(2.2, H * 0.3) * k;
    const half = CX.map((x) => [x * w, m + lip + (H - lip) * g(x)]);
    half.push([0.93 * w - 0.25 * k, m + 1.5 * k], [w + 0.3 * k, m + 0.85 * k], [w + 0.32 * k, m + 0.2 * k], [w - 0.5 * k, m - 0.35 * k],
      [0.72 * w, m + arch * 0.5], [0.4 * w, m + arch * 0.85], [0, m + arch]);
    return mirrorRing(s, puff(half, inflate(s)));
  };
  const lowerRing = (s) => {
    const w = lW(s), m = ltm(s), b = lg(s), D = Math.max(0.3, m - b), k = Math.min(1, w / 6), lh = 1.6 * k, arch = Math.min(2.0, D * 0.3) * k;
    const kl = 0.15 + 0.6 * smooth(870, 940, s);                 // the gonys keel sharpens towards the tip
    const half = [[0, m - arch], [0.4 * w, m - arch * 0.85], [0.72 * w, m - arch * 0.5], [w - 0.5 * k, m + 0.35 * k], [w + 0.32 * k, m - 0.2 * k],
      [w + 0.3 * k, m - 0.85 * k], [0.93 * w - 0.25 * k, m - 1.5 * k]];
    for (const th of [0, 14, 28, 42, 56, 68, 79, 87]) {
      const a = th * D2R;
      half.push([0.9 * w * Math.cos(a), m - lh - (D - lh) * ((1 - kl) * Math.sin(a) + kl * (1 - Math.cos(a)))]);
    }
    half.push([0, b]);
    // ring runs floor -> right side -> keel; mirror the left side back to the floor
    return mirrorRing(s, puff(half, inflate(s)));
  };
  /** |w| of the upper cheek at (s, t) (inlays laid on the curved cheek) */
  const cheekW = (s, t) => {
    const { w, m, H, lip } = up(s);
    if (t <= m + lip) return w;
    const q = Math.min(1, (t - m - lip) / Math.max(0.01, H - lip));
    let lo = 0, hi = 0.9;
    for (let i = 0; i < 30; i++) { const x = (lo + hi) / 2; if (g(x) > q) lo = x; else hi = x; }
    return lo * w;
  };
  return { B, tc, tm, W, ltm, lg, lW, upperRing, lowerRing, cheekW, up };
}
/** stations s0 .. s1 denser towards the tip, plus a dense band round the sheath groove */
function beakStations(s0, s1, n = 19) {
  const out = new Set();
  for (let i = 0; i < n; i++) { const v = i / (n - 1); out.add(+(s0 + (s1 - s0) * (1 - Math.pow(1 - v, 1.45))).toFixed(2)); }
  for (let s = 826; s <= 838; s += 1) if (s > s0 && s < s1) out.add(s);
  return [...out].sort((a, b) => a - b);
}

// crane emblem (local mm, facing +x): body + tail, S-neck, head with crest plume and long beak, one leg with three
// toes; the raised wing (second relief level) with five primaries
const CRANE = {
  body: [[5.2, 0.4], [3.5, 2.4], [0, 3.0], [-4, 2.2], [-8, 0.2], [-12.8, -5.2, 'c'], [-9.6, -4.3, 'c'], [-11.6, -6.8, 'c'], [-7, -4.9], [-3, -5.1], [1.5, -4.0], [4.6, -2.0]],
  neck: [[4.0, 0.6], [6.3, 3.4], [6.5, 6.5], [5.2, 9.3], [5.5, 11.9], [7.2, 13.5]],
  head: [7.8, 13.9, 1.95],
  crest: [[6.4, 15.0], [4.8, 16.3], [2.8, 16.8]],
  beak: [[9.2, 14.7], [16.6, 12.4], [9.5, 13.0]],
  leg: [[0.4, -4.2], [0.9, -8.6], [0.2, -13.2]],
  toes: [[[0.2, -13.4], [4.4, -14.6]], [[0.2, -13.4], [3.0, -15.8]], [[0.2, -13.4], [-2.8, -14.5]]],
  wing: [[3.4, 2.5], [2.2, 6.6], [-0.6, 10.3], [-3.4, 12.4, 'c'], [-6.6, 9.9], [-6.9, 6.4], [-5.0, 3.0], [-1.5, 1.4]],
};
/** tapered thick polyline -> polygon (w0 at the start, w1 at the end), rounded-ish ends */
function thickLine(pts, w0, w1) {
  const n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const h = (w0 + (w1 - w0) * i / (n - 1)) / 2;
    L.push([p[0] - dy * h, p[1] + dx * h]); R.push([p[0] + dy * h, p[1] - dx * h]);
  }
  return [...L, ...R.reverse()];
}
/** a smooth polyline through control points (Catmull-Rom in 2D) */
function smoothPts(pts, n = 16) {
  const c = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return c.getPoints(n).map((v) => [v.x, v.y]);
}
/** a smooth closed outline through control points (centripetal Catmull-Rom); [x, y, 'c'] marks a sharp corner */
function smoothClosed(pts, perSeg = 4) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    // a corner point keeps its neighbours' tangents from bending round it
    const a = p1[2] === 'c' ? p1 : p0, d = p2[2] === 'c' ? p2 : p3;
    const cv = new THREE.CatmullRomCurve3([a, p1, p2, d].map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal');
    for (let k = 0; k < perSeg; k++) {
      // the segment p1 -> p2 is the middle third of the 4-point curve (by parameter, close enough at these sizes)
      const v = cv.getPoint((1 + k / perSeg) / 3);
      out.push([v.x, v.y]);
    }
  }
  return dedupe(out, 0.05);
}

// ------------------------------------------------------------------------------------------ model

export function buildPyrewing(variant = 'bifang') {
  const L = LOOKS[variant];
  const g = new Gun(L.id);
  const BODY = L.body, TRIM = L.trim, TRIM2 = L.trim2, DARK = L.dark;
  const SIGHT = 92;
  const sideAx = (sd) => (sd > 0 ? 'w' : '-w');
  const addAll = (tgt, list) => { for (const [geo, m] of list) tgt.add(geo, m); };

  let shellGeo = null;
  // ======================================================================== receiver: chassis rail + three porcelain shells
  {
    // dark steel chassis rail between the shells and the lower receiver: machined slots, hex screws
    let rail = stepSection([[-30.6, -24.5, 1], [30.6, -24.5, 1], [30.6, -15.4, 1], [-30.6, -15.4, 1]], 246, 644, { bevel: 0.8, bevelSeg: 1, step: 12 });   // top 0.4 under the shells (no coplanar faces)
    const slots = [];
    for (const sd of [1, -1]) for (let k = 0; k < 7; k++) { const s = 268 + k * 52; slots.push(cutters.box([s + 15, -19.8, 30.8 * sd], [30, 3.4, 1.6])); }
    rail = cut(rail, slots);
    g.add(rail, L.chassis);
    for (const sd of [1, -1]) for (let k = 0; k < 8; k++) g.add(capScrew([262 + k * 52, -19.8, 30.4 * sd], 1.5, sideAx(sd), 0.7, 6), DARK);

    // three shells lofted from cross-sections, split at s 340 / 622 with 0.9 mm seams and bevelled ends
    const shells = [shellLoft(236, 339.55, 2.6, 0.7, 8), shellLoft(340.45, 621.55, 0.7, 0.7, 14), shellLoft(622.45, SHELL_SMAX - 0.25, 0.7, 0, 4)];
    // right: louvred heat-vent pocket (front, low); left: the charging-handle slot under the shoulder
    const vent = cutters.pocketW([[576, -12.5, 2], [634, -12.5, 2], [634, -1.5, 2], [576, -1.5, 2]], 27.6, 8);
    const slot = cutters.pocketW([[482, 38.2, 2.4], [574, 38.2, 2.4], [574, 43.4, 2.4], [482, 43.4, 2.4]], -28.8, 8);
    shells[1] = cut(shells[1], [vent, slot]);
    shells[2] = cut(shells[2], [vent]);
    for (const sh of shells) g.add(sh, BODY);
    shellGeo = merge(shells.map((x) => x.clone()));
    // gold inlay borders 3 mm inside every shell flank (the vane / roundel lie over them)
    for (const sd of [1, -1]) {
      const top = [];
      for (let s = 335.2; s >= 240.4; s -= 4.74) top.push([s, shellDims(s).flankTop - 3.2]);
      g.add(inlayRing([[240.4, -9.6], [335.2, -9.6], ...top], FLANK * sd, sd), TRIM);
      const fs = sd > 0 ? 568 : 617.4;
      g.add(inlayRing([[344.6, -9.6], [fs, -9.6], [fs, 35.4], [344.6, 35.4]], FLANK * sd, sd), TRIM);
    }
    // receiver top: gold spines with screws either side of the focus
    g.add(SC([[-4.2, 60.4, 0.6], [4.2, 60.4, 0.6], [3.4, 62.6, 0.6], [-3.4, 62.6, 0.6]], 398, 452, { bevel: 0.5 }), TRIM);
    for (const s of [402, 448]) g.add(capScrew([s, 62, 0], 1.6, 't', 0.7), DARK);
    g.add(SC([[-3.4, 60.6, 0.5], [3.4, 60.6, 0.5], [2.8, 62.2, 0.5], [-2.8, 62.2, 0.5]], 492, 584, { bevel: 0.4 }), TRIM);
    for (const s of [500, 542, 578]) g.add(capScrew([s, 61.8, 0], 1.3, 't', 0.6), DARK);
    // ruyi-cloud collar inlaid round the focus (double gold line on the crowned roof)
    {
      const top = projectorT(shellGeo, 61);
      for (const [r0, amp, rad] of [[19.6, 2.6, 0.42], [16.8, 2.2, 0.3]]) {
        const pts = [];
        for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2, r = r0 + amp * Math.cos(4 * a) + 0.8 * Math.cos(8 * a); const s = 470 + r * Math.cos(a), w = r * Math.sin(a); pts.push([s, top(s, w) + 0.06, w]); }
        g.add(sweep(pts, rad, { seg: 72, radial: 3, closed: true }), TRIM);
      }
    }

    // heat vent (right): dark back plate, a dim furnace strip, six aged-bronze louvres in a gold bezel
    g.add(box([605, -7, 28.6], [56, 9.6, 1.2], { r: 0.4, seg: 1 }), DARK);
    g.add(box([605, -7, 29.4], [50, 3.2, 0.5], { r: 0, seg: 1 }), L.throat);
    for (let k = 0; k < 6; k++) g.add(box([582 + k * 9.2, -7, 30.6], [7.6, 10, 1.1], { r: 0.3, seg: 1, rot: [0, -28, 0] }), TRIM2);
    g.add(PF([[574, -14.5, 3], [636, -14.5, 3], [636, 0.5, 3], [574, 0.5, 3]], { w: 1.2, cw: FLANK + 0.35, bevel: 0.35, bevelSeg: 1, holes: [[[576.6, -12.2, 2], [633.4, -12.2, 2], [633.4, -1.8, 2], [576.6, -1.8, 2]]] }), TRIM);
    for (const s of [578.6, 631.4]) for (const t of [-13.2, -0.8]) g.add(domeRivet([s, t, FLANK + 0.9], 0.75, 'w', 0.5, 8), TRIM);
    // charging handle (left): steel slide in the slot, gold-capped knurled knob
    g.add(box([528, 40.8, -29.6], [88, 3.4, 2], { r: 0.4, seg: 1 }), L.chassis);
    g.add(lax([[0, 0], [0, 2.4], [7, 2.4], [7.6, 3.6], [8.2, 5.2], [12.5, 5.2], [13.4, 4.2], [13.4, 0]], [566, 40.8, -29], '-w', 16), L.chassis);
    g.add(lax([[0, 0], [0, 4.6], [1.6, 4.2], [2.4, 2.6], [2.8, 0]], [566, 40.8, -42.4], '-w', 16), TRIM);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.add(box([566 + Math.cos(a) * 5.15, 40.8 + Math.sin(a) * 5.15, -39.8], [0.9, 0.9, 4.2], { r: 0, rot: [k * 45, 0, 0] }), L.chassis); }
  }

  // ======================================================================== flank vanes: cloisonné feather plate + 羽脈紋
  {
    const F = axisFrame(VA, VB);
    for (const sd of [1, -1]) {
      const wb = FLANK * sd;
      addAll(g, cloisonne({ a: VA, b: VB, hu: VHU, hd: VHD, w0: wb, sd, en: L.en, trim: TRIM, glow: L.vein, lines: 20, main: 2, rows: [0.34, 0.68],
        tipX: 0.86, nx: 18, rachis: 1.3, plate: 1.1, rim: 1.3, plateBevel: 0.4 }));
      // quill cap and tip bead
      g.add(lax([[0, 0], [0, 2.6], [1.2, 2.6], [1.9, 1.8], [1.9, 0]], [...F.P(-0.035, 0), wb], sideAx(sd), 14), TRIM);
      g.add(domeRivet([...F.P(0.99, 0), wb + 1.5 * sd], 1.3, sideAx(sd), 0.8), TRIM);
    }
  }

  // ======================================================================== rear flank roundels (赤文): the crane in two-level relief
  {
    const MC = [293, 16];
    for (const sd of [1, -1]) {
      const wb = FLANK * sd, ax = sideAx(sd);
      g.add(lax([[0, 18.6], [0, 23.4], [1.1, 23.4], [2.1, 22.6], [2.4, 21], [2.1, 19.4], [1.4, 18.6], [0, 18.6]], [MC[0], MC[1], wb], ax, 32), TRIM);
      g.add(lax([[0, 0], [0, 18.8], [1.3, 18.8], [1.3, 0]], [MC[0], MC[1], wb], ax, 32), L.medal);
      const z0 = 1.15;                                  // the medal face
      const P = ([x, y]) => [MC[0] + sd * x * 0.95, MC[1] + y * 0.95 - 0.4];
      const lvl = (pts, z1, holes = []) => PF(pts.map(P), { ...onFace(wb, sd, z0 - 0.2, z0 + z1), bevel: 0.22, bevelSeg: 1, curveSeg: 2, holes: holes.map((h) => h.map(P)) });
      if (L.focus === 'pearl') {
        // level 1 (~0.9 mm): body + tail, S-neck, head (eye pierced), crest plume, beak, leg and three toes; the pieces
        // stand at stepped heights so every joint hides the lower piece's bevel (no CSG union needed)
        const C = CRANE;
        const eye = arcPts(C.head[0] + 0.35, C.head[1] + 0.25, 0.42, 0, 320, 7);
        const pieces = [lvl(smoothClosed(C.body, 3), 0.9), lvl(thickLine(smoothPts([...C.neck.slice(0, -1), [6.7, 13.0]], 9), 2.5, 1.6), 0.84), lvl(arcPts(C.head[0], C.head[1], C.head[2], 0, 340, 14), 0.96, [eye]),
          lvl(thickLine(smoothPts(C.crest, 6), 1.1, 0.25), 0.8), lvl(C.beak, 0.9), lvl(thickLine(C.leg, 1.1, 0.85), 0.84),
          ...C.toes.map((t) => lvl(thickLine(t, 0.8, 0.45), 0.78))];
        g.add(merge(pieces), TRIM);
        // level 2 (1.4 mm): the raised wing, coverts engraved with three feather lines, five separate primaries
        let wing = lvl(smoothClosed(C.wing, 4), 1.4);
        const grooves = [[[-0.2, 4.4], [-4.8, 6.6]], [[0.6, 7.2], [-4.2, 9.6]], [[-1.4, 2.6], [-5.2, 4.0]]].map(([a, b]) => strip(P(a), P(b), wb + sd * (z0 + 1.4), 0.36, 0.9));
        wing = cut(wing, grooves);
        g.add(wing, TRIM);
        const prim = [];
        for (let i = 0; i < 5; i++) {
          const r = [-3.0 - 3.4 * i / 4, 12.0 - 2.8 * i / 4], a = (100 + i * 17) * D2R, len = 6.4 - i * 0.45;
          prim.push(lvl(thickLine([r, [r[0] + Math.cos(a) * len * 0.5, r[1] + Math.sin(a) * len * 0.5], [r[0] + Math.cos(a) * len, r[1] + Math.sin(a) * len]], 1.5, 0.35), 1.4 - i * 0.08));
        }
        g.add(merge(prim), TRIM);
      } else {
        // 鬼車: a plump night bird (forked tail, two short legs) facing forward; nine S-necks rise from its shoulder in
        // a bundle and open into a staggered arc of heads, every head pierced for its eye, its hooked beak turned
        // forward; the folded wing is the second relief level, engraved with three feather lines
        const pieces = [lvl(smoothClosed([[6.5, -4.5], [5.2, -1.9], [2.0, -0.3], [-2.5, -0.7], [-7.5, -2.5], [-14.4, -3.8, 'c'], [-11.9, -6.0, 'c'],
          [-14.2, -8.8, 'c'], [-8.5, -8.4], [-3.0, -9.9], [2.5, -9.4], [5.8, -7.4]], 4), 0.9)];
        // the thin strokes (legs, toes, necks) are rounded beads (a slab with soft walls), the masses keep their bevels
        const bead = (pts, z1) => slab(pts.map(P), wb, sd, z0 - 0.2, z0 + z1, [], true, false, WIRE);
        for (const [leg, toes] of [[[[1.2, -9.2], [1.8, -11.8], [1.2, -13.8]], [[2.9, -14.6], [0.4, -15.3]]], [[[-2.0, -9.6], [-2.4, -12.2], [-3.2, -14.0]], [[-1.6, -14.9], [-4.6, -14.8]]]]) {
          pieces.push(bead(thickLine(leg, 1.1, 0.8), 0.84));
          for (const t of toes) pieces.push(bead(thickLine([leg[2], t], 0.7, 0.4), 0.8));
        }
        let fw = lvl(smoothClosed([[4.0, -4.0], [1.5, -1.7], [-3.5, -1.8], [-9.0, -3.7], [-12.6, -6.4, 'c'], [-7.0, -7.0], [-1.0, -7.6], [3.2, -6.4]], 4), 1.3);
        fw = cut(fw, [[[2.0, -2.8], [-2.8, -6.6]], [[-1.4, -2.4], [-6.0, -6.4]], [[-4.8, -3.0], [-9.2, -6.0]]].map(([a, b]) => strip(P(a), P(b), wb + sd * (z0 + 1.3), 0.34, 0.9)));
        g.add(fw, TRIM);
        const HEADS = [[-11.0, 5.2], [-8.4, 9.8], [-4.4, 13.0], [0.1, 14.3], [4.6, 13.2], [8.6, 10.8], [11.2, 7.2], [12.5, 3.0], [11.8, -1.0]];
        HEADS.forEach(([hx, hy], i) => {
          const big = i === 4, hr = big ? 2.2 : 1.6, b = [-2.0 + 7.4 * i / 8, -0.5 - 1.8 * i / 8];
          // S-neck: out of the shoulder, bowing one way then the other into the back of the head
          const dx = hx - b[0], dy = hy - b[1], l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l, bow = (i % 2 ? 1 : -1) * 1.1;
          const end = [hx - dx / l * hr * 0.7, hy - dy / l * hr * 0.7];
          pieces.push(bead(thickLine(smoothPts([b, [b[0] + dx * 0.3 + nx * bow, b[1] + dy * 0.3 + ny * bow], [b[0] + dx * 0.7 - nx * bow, b[1] + dy * 0.7 - ny * bow], end], 4), 1.5, 0.95), 0.8));
          // head + eye; the beak points out and forward, hooking down at its tip
          const o = [hx - 1, hy - 1.5], ol = Math.hypot(...o), d0 = [o[0] / ol + 1.1, o[1] / ol + 0.2], dl = Math.hypot(...d0), d = [d0[0] / dl, d0[1] / dl];
          const ex = hx + d[0] * hr * 0.25, ey = hy + d[1] * hr * 0.25 + hr * 0.18;
          pieces.push(lvl(arcPts(hx, hy, hr, 0, 340, big ? 12 : 9), 1.05, [arcPts(ex, ey, big ? 0.55 : 0.42, 0, 300, 5)]));
          const nn = [d[1], -d[0]], b0 = [hx + d[0] * hr * 0.6, hy + d[1] * hr * 0.6], k = big ? 1.25 : 1;
          const tip = [b0[0] + (d[0] * 2.6 + nn[0] * 1.3) * k, b0[1] + (d[1] * 2.6 + nn[1] * 1.3) * k];
          pieces.push(bead([[b0[0] - nn[0] * 0.8 * k, b0[1] - nn[1] * 0.8 * k], [b0[0] + (d[0] * 2.4 - nn[0] * 0.2) * k, b0[1] + (d[1] * 2.4 - nn[1] * 0.2) * k], tip,
            [b0[0] + (d[0] * 1.2 + nn[0] * 0.7) * k, b0[1] + (d[1] * 1.2 + nn[1] * 0.7) * k], [b0[0] + nn[0] * 0.8 * k, b0[1] + nn[1] * 0.8 * k]], 0.95));
        });
        g.add(merge(pieces), TRIM);
      }
      // bead ring and four screws in the bezel
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; g.add(lax([[0, 0], [0, 0.75], [0.45, 0.6], [0.7, 0]], [MC[0] + Math.cos(a) * 21, MC[1] + Math.sin(a) * 21, wb + 2.2 * sd], ax, 6), TRIM); }
      for (const a of [45, 135, 225, 315]) g.add(capScrew([MC[0] + Math.cos(a * D2R) * 25.4, MC[1] + Math.sin(a * D2R) * 25.4, wb], 1.2, ax, 0.6), DARK);
      // ruyi-cloud corners: low-relief porcelain heads with a gold edge and a curl, in the panel corners round the roundel
      for (const [cs, ct, rot, sc] of [[251.5, -2.5, 210, 1], [251.5, 22.5, 150, 0.95], [326.5, -1.5, -30, 0.85]]) {
        const R = 7.4 * sc, out = [];
        for (let i = 0; i < 21; i++) {
          const a = (i / 21) * Math.PI * 2, r = R * (0.68 + 0.26 * Math.cos(3 * a) ** 2 * Math.sign(Math.cos(3 * a)) * 0.9 + 0.12 * Math.cos(a));
          const ra = a + rot * D2R;
          out.push([cs + Math.cos(ra) * r, ct + Math.sin(ra) * r]);
        }
        g.add(PF(out, { ...onFace(wb, sd, -0.3, 0.6), bevel: 0.25, bevelSeg: 1 }), BODY);
        g.add(sweep(out.map(([s, t]) => [s, t, wb + sd * 0.62]), 0.32, { seg: 26, radial: 3, closed: true }), TRIM);
        g.add(sweep(scrollPts([cs + Math.cos(rot * D2R) * R * 0.35, ct + Math.sin(rot * D2R) * R * 0.35], R * 0.42, rot + 90, 1.1, 1, wb + sd * 0.64, 10, 0.65), 0.26, { seg: 10, radial: 3 }), TRIM);
      }
    }
    // mantle: cloisonné back-feather scales either side of the top spine, pointing to the tail (gold backing, 朱 edge,
    // 青 heart, rachis and two chevron cloisons)
    const top = projectorT(shellGeo, 61);
    for (const sd of [1, -1]) for (let k = 0; k < 6; k++) {
      const s0 = 494 + k * 18.5, w0 = 9.8 * sd;
      const t0 = top(s0, w0), t1 = top(s0 + 16, w0), tilt = Math.atan2(t1 - t0, 16) / D2R;
      const scale = (f, dw = 0) => [[s0 + 15 * f, -4.6 * sd * f + w0, 1.5], [s0 + 2 * f, -5.6 * sd * f + w0, 4 * f], [s0 - 6 * f + dw, w0, 2.5 * f], [s0 + 2 * f, 5.6 * sd * f + w0, 4 * f], [s0 + 15 * f, 4.6 * sd * f + w0, 1.5]];
      const big = [[s0 + 16.6, -5.6 * sd + w0, 1.5], [s0 + 2, -6.8 * sd + w0, 4.4], [s0 - 7, w0, 2.8], [s0 + 2, 6.8 * sd + w0, 4.4], [s0 + 16.6, 5.6 * sd + w0, 1.5]];
      const tl = (geo) => xform(geo, { rot: [tilt, 0, 0], pivot: [s0, t0, 0] });
      g.add(tl(PL(big, { h: 1.0, ct: t0 + 0.5, bevel: 0.3, bevelSeg: 1, curveSeg: 2 })), TRIM);
      g.add(tl(PL(scale(1), { h: 0.9, ct: t0 + 1.25, bevel: 0, curveSeg: 2 })), L.en[2]);
      g.add(tl(PL(scale(0.62).map(([a, b, r]) => [a + 1.2, b, r]), { h: 0.9, ct: t0 + 1.3, bevel: 0, curveSeg: 2 })), L.en[0]);
      const wires = [strip([s0 - 3, t0 + 1.85], [s0 + 13, t0 + 1.85], w0, 0.4, 0.5)];
      for (const q of [1, -1]) for (const f of [0.35, 0.7]) wires.push(xform(box([s0 + 1 + 9 * f, t0 + 1.85, w0 + q * 2.4 * (1 - f * 0.4)], [0.4, 0.5, 4.6 * (1 - f * 0.5)], { r: 0, rot: [0, q * sd * 38, 0] }), {}));
      g.add(renormal(tl(merge(wires)), WIRE), TRIM);
    }
    // cloud-scroll filigree along the right shoulder (above the vane) and the left one (behind the charging slot)
    g.add(cloudBand(356, 600, 48.4, projector(shellGeo, 1, 0.25, FLANK)), TRIM);
    g.add(cloudBand(356, 470, 48.4, projector(shellGeo, -1, 0.25, -FLANK)), TRIM);
  }

  // ======================================================================== shoulder pods (static) + wing bones (fx_wingRootL / R)
  for (const sd of [1, -1]) {
    // a porcelain bulb grown out of the shoulder; its gold-lipped cup holds the ball joint; filigree ring
    const PW = (HINGE[2] - 4) * sd;
    g.add(lax([[0, 0], [0, 9], [3, 12.6], [12, 14.2], [17, 13.4], [20.6, 11.2], [21.4, 9.6], [21.4, 0]], [HINGE[0], 44, PW], 't', 32), BODY);
    g.add(lax([[0, 8.6], [0, 11.2], [0.7, 11.9], [2.2, 11.9], [2.2, 8.6], [0, 8.6]], [HINGE[0], 64.8, PW], 't', 32), TRIM);
    g.add(lax([[0, 13.9], [0, 14.6], [1.4, 14.6], [1.4, 13.9]], [HINGE[0], 53.4, PW], 't', 32), TRIM);
    for (let k = 0; k < 4; k++) { const a = (k + 0.5) * Math.PI / 2; g.add(capScrew([HINGE[0] + Math.cos(a) * 12.2, 58.3, PW + Math.sin(a) * 12.2], 1.1, 't', 0.5), DARK); }

    const side = sd > 0 ? 'R' : 'L';
    const h = wingHinge(sd);
    const bone = g.part('fx_wingRoot' + side, { pivot: [HINGE[0], HINGE[1], HINGE[2] * sd], extras: {
      open: +h.ang.toFixed(2), hinge: h.sAxis, wing: side, cards: 7, order: sd > 0 ? 1 : 0,
      note: 'wing bone on a ball joint: folded back 10°, open 1 = 69° up and out (compound hinge); wing cards spawn at S_wing' + side } });
    const c10 = Math.cos(10 * D2R), s10 = Math.sin(10 * D2R);
    const P = (u, o) => [HINGE[0] - u * c10 - o * s10, HINGE[1] + u * s10 + o * c10];     // u along the bone (back), o across (up)
    const hw = (u) => 17 - 12 * (u / BONE_L);                                              // half width 17 -> 5
    const W0 = HINGE[2] * sd, ax = sideAx(sd);
    // humerus + forearm: one teardrop-section loft (round leading edge, thinner scalloped trailing edge, an engraved
    // fuller on both faces), swelling into a knuckle at u 96
    const KN = 104, kn = (u) => Math.exp(-(((u - KN) / 6.5) ** 2));
    const hwT = (u) => hw(u) * 0.92 + 1.4 * Math.sin(Math.PI * Math.max(0, Math.min(1, u / BONE_L))) + 1.4 * kn(u);
    const hwB = (u) => hw(u) - 2.2 * Math.abs(Math.sin(Math.PI * u / 30)) * smooth(8, 22, u) * (1 - smooth(BONE_L - 20, BONE_L - 4, u)) * (1 - kn(u)) + 1.2 * kn(u);
    const thk = (u) => (7.6 - 2.2 * Math.max(0, u) / BONE_L) * (1 + 0.16 * kn(u));
    const ful = (u) => smooth(18, 28, u) * (1 - smooth(BONE_L - 28, BONE_L - 16, u)) * (1 - Math.min(1, kn(u) * 2.2));
    const hz = (u, x) => {
      const t2 = thk(u) / 2;
      let z = x >= 0.4 ? t2 * Math.sqrt(Math.max(0, 1 - ((x - 0.4) / 0.6) ** 2)) : t2 * (0.3 + 0.7 * Math.pow((x + 1) / 1.4, 0.7));
      z -= 0.7 * ful(u) * Math.exp(-(((x + 0.22) / 0.13) ** 2));
      return z;
    };
    const XS = [-1, -0.78, -0.5, -0.3, -0.12, 0.14, 0.4, 0.62, 0.8, 0.93, 1];
    const sec = (u, x, f) => { const o = x >= 0 ? x * hwT(u) : x * hwB(u); return [...P(u, o), W0 + f * hz(u, x)]; };
    const rings = [];
    const us = [];
    for (let u = -6; u <= BONE_L + 3; u += 9) us.push(u);
    for (const u of [KN - 8, KN - 4, KN, KN + 4, KN + 8]) us.push(u);
    us.sort((a, b) => a - b);
    for (let i = us.length - 1; i > 0; i--) if (Math.abs(us[i] - us[i - 1]) < 2.5) us.splice(i, 1);
    for (const u of us) {
      const r = XS.map((x) => sec(u, x, 1));
      for (let i = XS.length - 2; i >= 0; i--) r.push(sec(u, XS[i], -1));
      rings.push(r);
    }
    bone.add(loft(rings, { crease: 50 }), TRIM);
    // knuckle: two bronze collar lines round the joint, a domed pin through it on both faces
    for (const u of [KN - 6.5, KN + 6.5]) {
      const r = XS.map((x) => sec(u, x, 1));
      for (let i = XS.length - 2; i >= 1; i--) r.push(sec(u, XS[i], -1));
      bone.add(sweep(r, 0.5, { seg: r.length, radial: 4, closed: true }), TRIM2);
    }
    for (const f of [1, -1]) bone.add(domeRivet([...P(KN, hwT(KN) * 0.2), W0 + f * hz(KN, 0.2)], 2.6, f > 0 ? 'w' : '-w', 1.4, 14), TRIM2);
    // tip finial: gold collar, a lacquer bead, a fluted flame bud with six twisted ribs (畢方's fire at the wing tip)
    {
      const fa = [...P(BONE_L - 2, 0.5), W0], fb = [...P(BONE_L + 30, 0.5), W0];
      const budR = (x) => (x < 8.5 || x > 25.5 ? 0 : 5.2 * Math.pow(Math.sin(Math.PI * Math.min(1, (x - 8.5) / 17 * 0.92 + 0.08)), 0.7) * (1 - 0.55 * (x - 8.5) / 17));
      bone.add(aim(lathe([[0, 3.2], [0, 5.4], [1.2, 5.9], [2.6, 5.9], [3.2, 5.2], [3.2, 3.2], [0, 3.2]], { seg: 20 }), fa, fb), TRIM);
      bone.add(sphere([...P(BONE_L + 3.5, 0.5), W0], 3.3, { seg: 14 }), L.crest);
      const bud = [[8.5, 0]];
      for (let i = 1; i <= 12; i++) { const x = 8.5 + 17 * i / 12; bud.push([x, budR(Math.min(25.45, x))]); }
      bud.push([25.5, 0]);
      bone.add(aim(lathe(bud, { seg: 18 }), fa, fb), TRIM);
      const ribs = [];
      for (let k = 0; k < 6; k++) {
        const pts = [];
        for (let j = 0; j <= 10; j++) { const x = 9.4 + 15 * j / 10, r = budR(x) + 0.32, an = (k * 60 + j * 5.5) * D2R; pts.push([x, r * Math.cos(an), r * Math.sin(an)]); }
        ribs.push(sweep(pts, 0.42, { seg: 12, radial: 4 }));
      }
      bone.add(aim(merge(ribs), fa, fb), TRIM);
    }
    // glow bead along the leading edge on the outer face (lights when ready)
    {
      const pts = [];
      for (let i = 0; i <= 20; i++) { const u = 22 + (BONE_L - 40) * i / 20; pts.push([...P(u, 0.74 * hwT(u)), W0 + sd * (hz(u, 0.74) + 0.05)]); }
      bone.add(sweep(pts, 0.55, { seg: 40, radial: 4 }), L.vein);
    }
    // six flight feathers below the arm (outer face): cambered cloisonné plates staggered outwards, each seated in a
    // gold socket cup pinned to the bone
    for (let k = 0; k < 6; k++) {
      const u0 = 18 + k * 22, len = 44 + k * 6, ang = -(16 - k * 1.2);           // degrees below the bone axis
      const a = P(u0, -hwB(u0) * 0.35);
      const da = (170 - ang) * D2R;                                              // the bone runs back (s-) and 10° up
      const b = [a[0] + Math.cos(da) * len, a[1] + Math.sin(da) * len];
      const lift = 0.5 + (5 - k) * 1.7;
      const w0 = W0 + sd * (hz(u0, -0.35) + lift);
      const fhu = vaneW(6.4, 0.25, 0.55, 0.3), fhd = vaneW(7.6, 0.25, 0.6, 0.3);
      const F = axisFrame(a, b);
      // two-faced: a closed gold plate with cloisonné on both faces (first person the right bone is seen from below /
      // inboard: a one-faced feather showed there as an empty gold wire frame)
      const C = { a, b, hu: fhu, hd: fhd, en: L.en, trim: TRIM, lines: 4, rows: [], tipX: 0.78, nx: 5, rachis: 0.75, enT: 0.4, rim: 1.0, ww: 0.38, wh: 0.24 };
      const list = [...cloisonne({ ...C, w0, sd, plate: 0.5, lift: 0.5, plateBevel: 'closed' }), ...cloisonne({ ...C, w0: w0 - sd * 0.5, sd: -sd, plate: 0, noPlate: true, lines: 2, nx: 4 })];
      addAll(bone, bendFeather(list, F, sd, 2.2 + k * 0.2, 1.4, (m) => (m === TRIM ? WIRE : 40)));
      // socket cup round the quill (opening towards the tip) and its pin back to the bone
      const cA = [...F.P(-0.06, 0), w0 + sd * 0.7], cB = [...F.P(0.2, 0), w0 + sd * 0.7];
      bone.add(aim(lathe([[0, 0], [0, 1.7], [0.7, 2.5], [4.2, 2.4], [4.9, 1.7], [4.4, 0]], { seg: 8 }), cA, cB), TRIM);
      bone.add(lax([[0, 0], [0, 1.0], [lift + 0.4, 1.0], [lift + 0.4, 0]], [...F.P(-0.02, 0), W0 + sd * (hz(u0, -0.35) - 0.3)], ax, 10), TRIM2);
    }
    // 5 Ø4 rivets on the arm's outer face (the wing cards grow from them)
    for (let k = 0; k < 5; k++) { const u = 34 + k * 28; bone.add(domeRivet([...P(u, hw(u) * 0.3), W0 + sd * (hz(u, 0.3 * hw(u) / hwT(u)) - 0.1)], 2, ax, 1.2), TRIM); }
    // ball joint at the hinge: gold ball, porcelain collar with a gold lip
    bone.add(sphere([HINGE[0], HINGE[1], W0], 9.5, { seg: 18 }), TRIM);
    bone.add(lax([[0, 6], [0, 10.5], [1, 11.2], [4.5, 11.2], [5.5, 10], [5.5, 6], [0, 6]], [HINGE[0] - 9, HINGE[1] + 1.6, W0], '-s', 20), BODY);
    bone.add(lax([[0, 10.4], [0, 11.6], [0.9, 11.6], [0.9, 10.4]], [HINGE[0] - 9.4, HINGE[1] + 1.6, W0], '-s', 20), TRIM);
    // where the cards root once the wing is open (the middle rivet); extras.rest = the folded position
    const rv = [...P(90, hw(90) * 0.3), W0 + sd * 6];
    g.socket('wing' + side, openPoint(rv, sd), { rest: rv.map((x) => +x.toFixed(2)), side });
  }

  // ======================================================================== carry handle + rear aperture (s 256-394)
  {
    const HP = [[256, 50, 0], [394, 50, 0], [394, 62, 2], [382, 79, 12], [300, 86.5, 14], [268, 86.5, 6], [256, 72, 4]];
    const hp = PF(HP, { w: 17, bevel: 2.6, bevelSeg: 3, curveSeg: 5, holes: [[[280, 63.5, 5], [362, 63.5, 5], [356, 77, 9], [286, 79, 9]]] });
    g.add(hp, BODY);
    g.add(SC([[-5, 86.2, 0.8], [5, 86.2, 0.8], [3.8, 88.4, 0.8], [-3.8, 88.4, 0.8]], 272, 352, { bevel: 0.5 }), TRIM);
    for (const sd of [1, -1]) {
      for (const s of [266, 386]) g.add(capScrew([s, 62, 8.6 * sd], 1.5, sideAx(sd), 0.6), DARK);
      // gold scroll filigree on the handle's flanks, a rim wire round the window
      g.add(merge([sweep(scrollPts([300, 82, 0], 3.2, 200, 1.1, -1, 8.6 * sd), 0.42, { seg: 20, radial: 4 }),
        sweep(scrollPts([344, 82, 0], 3.2, -20, 1.1, 1, 8.6 * sd), 0.42, { seg: 20, radial: 4 }),
        sweep([[306, 80.6, 8.6 * sd], [322, 82.6, 8.6 * sd], [338, 80.6, 8.6 * sd]], 0.42, { seg: 12, radial: 4 })]), TRIM);
      g.add(sweep([[284, 64.4, 8.62 * sd], [321, 64.4, 8.62 * sd], [358.2, 64.4, 8.62 * sd], [355.6, 70.6, 8.62 * sd], [352.6, 76.8, 8.62 * sd], [321, 78.6, 8.62 * sd], [289.4, 78.6, 8.62 * sd], [286.2, 71.4, 8.62 * sd]], 0.5, { seg: 40, radial: 4, closed: true }), TRIM);
      // gold inlay border (a U round the back, bottom and front edges) and an underglaze scroll band under the window
      g.add(inlayLine([[262, 78], [262, 55.4], [388.4, 55.4], [388.4, 61.4], [381, 72]], 8.5 * sd, sd, 0.6), TRIM);
      g.add(scrollBand(268, 382, 59.6, 8.5 * sd, sd), L.scroll);
    }
    // rear aperture: gold ring on a short post (sight_rear at its centre)
    g.add(box([266, 89, 0], [7, 6, 7], { r: 1.2 }), TRIM);
    g.add(lathe([[263, 1.5], [263, 5.6], [263.6, 6.2], [268.4, 6.2], [269, 5.6], [269, 1.5], [263, 1.5]], { t: SIGHT, seg: 24 }), TRIM);
    g.add(PF([[292, 63.2, 2], [352, 63.2, 2], [348, 66.4, 2], [296, 66.4, 2]], { w: 12, bevel: 0.8 }), 'rubber');
  }

  // ======================================================================== focus: the fire pearl / nine eyes
  if (L.focus === 'pearl') {
    // floating 火珠 (briolette-cut crystal, flame-pointed) over a gold claw cradle: 5 curled prongs, a faint field disc
    const PC = [470, 79];
    g.add(lax([[0, 0], [0, 15], [1.4, 15.6], [3, 15.4], [4.4, 13.2], [6, 9.4], [7.2, 8.4], [7.2, 0]], [PC[0], 60.8, 0], 't', 32), BODY);
    g.add(lax([[0, 14.4], [0, 15.8], [1.2, 15.8], [1.2, 14.4]], [PC[0], 62.4, 0], 't', 36), TRIM);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + 0.31; g.add(sphere([PC[0] + Math.cos(a) * 13.2, 66.3, Math.sin(a) * 13.2], 0.7, { seg: 6 }), TRIM); }
    g.add(lax([[0, 6.6], [0, 9.6], [0.6, 10.2], [2, 10.2], [2, 6.6], [0, 6.6]], [PC[0], 67.4, 0], 't', 28), TRIM);
    g.add(lax([[0, 0], [0, 6.4], [0.45, 6.4], [0.45, 0]], [PC[0], 69.2, 0], 't', 28), 'glow_vermilion');
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3, ca = Math.cos(a), sa = Math.sin(a);
      const R = (r, t) => [PC[0] + ca * r, t, sa * r];
      const pts = [R(8.4, 68.2), R(11.8, 71), R(12.4, 76), R(10.8, 80), R(9.3, 81.6)];
      g.add(sweep(pts, 1.05, { seg: 14, radial: 6 }), TRIM);
      g.add(sphere(pts[4], 1.2, { seg: 8 }), TRIM);
      // a curl springing from the prong (from a point on its centreline) outwards and down
      const c0 = st(new THREE.CatmullRomCurve3(pts.map((p) => V(...p)), false, 'catmullrom', 0.5).getPoint(0.3)), r0 = Math.hypot(c0[0] - PC[0], c0[2]);
      g.add(sweep([R(r0, c0[1]), R(r0 + 1.8, c0[1] - 0.4), R(r0 + 2.8, c0[1] - 2.0), R(r0 + 2.0, c0[1] - 3.4), R(r0 + 1.0, c0[1] - 2.8)], 0.5, { seg: 10, radial: 4 }), TRIM);
    }
    const pearl = g.part('fx_pearl', { pivot: [PC[0], PC[1], 0], extras: { spin: 't', rate: 24, hover: 0.0012, period: 2.6, pv: { gem: 1.5, irid: 0.18, coreTint: '#ffb43a' },
      note: '火珠 focus: a briolette-cut crystal flame-pearl floating over the claw cradle, spins slowly (spinMul up when ready / casting)' } });
    pearl.add(briolette([PC[0], PC[1], 0], [[-7.2, 0], [-6.3, 3.6], [-4.0, 6.3], [-0.9, 7.4], [2.3, 6.8], [5.0, 5.0], [7.0, 2.8], [8.2, 1.0], [8.7, 0]], 12), 'crystal');
    g.socket('pearl', [PC[0], PC[1], 0]);
  } else {
    // 鬼車: a crescent of nine eyes on a black plate: one large (focus), eight at 0.4 brightness behind it; slit pupils,
    // almond lids
    const C = [486, 0];
    const plate = [...arcPts(C[0], 0, 23, 96, 264, 16), ...arcPts(C[0], 0, 10.5, 264, 96, 10)].map(([s, w]) => [s, w, 0]);
    g.add(PL(plate, { h: 5, ct: 62.6, bevel: 1 }), DARK);
    g.add(lax([[0, 0], [0, 12.4], [1.2, 12.8], [3, 12.4], [5, 9.6], [8.6, 8.4], [8.6, 0]], [C[0], 60.8, 0], 't', 28), BODY);
    const big = g.part('fx_eye', { pivot: [C[0], 79, 0], extras: { hover: 0.0012, period: 2.2, pv: { gem: 1.5, irid: 0.1, coreTint: '#b54bff' }, note: 'the large eye (focus)' } });
    addAll(big, slitEye([C[0], 79, 0], 6.6, [-0.6, 0.8], TRIM, L.pupil, 'crystal'));
    g.add(lax([[0, 6.4], [0, 8.6], [0.8, 9.2], [2.4, 9.2], [2.4, 6.4], [0, 6.4]], [C[0], 69.4, 0], 't', 28), TRIM);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; g.add(sweep([[C[0] + Math.cos(a) * 8, 70, Math.sin(a) * 8], [C[0] + Math.cos(a) * 9.6, 76, Math.sin(a) * 9.6], [C[0] + Math.cos(a) * 7.6, 82.4, Math.sin(a) * 7.6]], 0.8, { seg: 10, radial: 5 }), TRIM); }
    const small = g.part('fx_eyes', { extras: { pv: { gem: 0.6, irid: 0.05, coreTint: '#b54bff' }, note: 'eight small eyes (0.4 brightness of the large one)' } });
    for (let k = 0; k < 8; k++) {
      const a = (110 + k * 20) * D2R, p = [C[0] + Math.cos(a) * 16.5, 67.2, Math.sin(a) * 16.5];
      addAll(small, slitEye(p, 2.5, [-0.5, 0.86], TRIM, L.pupil, 'crystal'));
      g.add(lax([[0, 2.3], [0, 3.3], [0.5, 3.7], [1.3, 3.7], [1.3, 2.3], [0, 2.3]], [p[0], 64.9, p[2]], 't', 10), TRIM);
    }
    g.socket('pearl', [C[0], 79, 0]);
  }

  // ======================================================================== stock = tail (s 0-238)
  // a tail, not a box: the whole stock (and everything laid on it) tapers in width from the receiver (46 mm) to the
  // butt (~36 mm), its lower edge splits into three overlapping tail-feather tips (two V notches), a softer bevel
  const gAdd = g.add.bind(g), kf = (sv) => 0.78 + 0.22 * Math.pow(Math.max(0, Math.min(1, sv / 238)), 0.85);
  g.add = (geo, m) => gAdd(taperW(geo, kf), m);
  {
    const SO = [[18, -88, 6], [70, -78, 30], [196, -42, 40], [238, -26, 4], [238, 44, 4], [150, 41, 80], [42, 35, 10], [18, 33, 4]];
    let stock = PF(SO, { w: 46, bevel: 6, bevelSeg: 4, curveSeg: 6 });
    const lowT = (sv) => -78 + (sv - 70) / 126 * 36;
    const notch = (sv) => PF([[sv - 7, lowT(sv) - 12, 0], [sv + 5, lowT(sv) - 12, 0], [sv + 1.5, lowT(sv) + 6.5, 0.8]], { w: 80, bevel: 0, curveSeg: 2 });
    stock = cut(stock, [cutters.slotW(40, 62, -60, 8, 80, 0), notch(104), notch(152)]);      // sling slot through the tail
    g.add(stock, BODY);
    // ribbed rubber butt pad, gold butt-plate frame with screws
    let pad = PF([[18, 35, 2], [8, 36, 8], [0, 30, 6], [0, -84, 6], [8, -92, 8], [18, -90, 2]], { w: 50, bevel: 4, bevelSeg: 1, curveSeg: 3 });
    const ribs = [];
    for (let k = 0; k < 9; k++) ribs.push(cutters.box([0, 20 - k * 12, 0], [3.2, 2.6, 60]));
    pad = cut(pad, ribs);
    g.add(pad, 'rubber');
    g.add(SC([[-23, -90, 2], [23, -90, 2], [23, 35.5, 2], [-23, 35.5, 2]], 17.4, 20.2, { bevel: 0.6 }), TRIM);
    for (const sd of [1, -1]) for (const t of [24, -78]) g.add(capScrew([22, t, 23.2 * sd], 1.4, sideAx(sd), 0.6), DARK);
    // leather cheek pad on the comb, saddle-stitched 1.5 mm inside its top edges
    const padGeo = PF([[56, 34, 3], [196, 41.6, 3], [210, 44.2, 2], [210, 50, 3], [150, 47.6, 20], [56, 41, 4]], { w: 34, bevel: 2.4, bevelSeg: 2 });
    g.add(padGeo, L.wrap);
    {
      const ptop = projectorT(padGeo, 44), stitch = [];
      for (let k = 0; k < 24; k++) {
        const s = 64 + k * 5.8;
        for (const sd of [1, -1]) {
          const w = (17 - 2.4 - 1.5) * sd, t0 = ptop(s - 1.2, w * kf(s - 1.2)), t1 = ptop(s + 1.2, w * kf(s + 1.2));   // (the pad is tapered already)
          stitch.push(box([s, (t0 + t1) / 2 - 0.1, w], [2.6, 0.5, 0.75], { r: 0, rot: [Math.atan2(t1 - t0, 2.4) / D2R, sd * 14, 0] }));
        }
      }
      g.add(renormal(merge(stitch), WIRE), TRIM2);           // (thread: soft-shaded, shared vertices)
    }
    // sling swivel under the tail
    g.add(lax([[0, 0], [0, 4], [3, 4], [3.6, 3.2], [3.6, 0]], [64, -79.6, 0], '-t', 12), DARK);
    g.add(sweep([[56, -85, 0], [56, -92, 0], [64, -96, 0], [72, -92, 0], [72, -85, 0]], 1.6, { seg: 20, radial: 6 }), TRIM);
    // flank decoration: gold inlay border 8 mm inside the outline (inside the 5 mm bevel), rump-feather scallops in low
    // relief behind the tail feathers, an underglaze scroll band under the top edge
    const inner = offsetPoly(dedupe(makeShape(SO).getPoints(4).map((v) => [v.x, v.y])), -8.2);
    const TAILS = [[226, 12, 152, 12, -4], [222, -4, 142, 12.5, 4], [216, -24, 118, 11, 14]];
    const tailF = TAILS.map(([s0, t0, len, wid, tilt]) => ({ F: axisFrame([s0, t0], [s0 - len * Math.cos(tilt * D2R), t0 - len * Math.sin(tilt * D2R)]), wid }));
    const clearOfTails = (s, t, r) => tailF.every(({ F, wid }) => {
      const ds = s - F.a[0], dt = t - F.a[1], u = (ds * F.ux + dt * F.uy) / F.L, o = Math.abs(-ds * F.uy + dt * F.ux);
      return u < -0.02 || u > 1.04 || o > wid + 2.4 + r;
    });
    const insideStock = (s, t, r) => {
      let inside = false;
      for (let i = 0, j = inner.length - 1; i < inner.length; j = i++) {
        const [xi, yi] = inner[i], [xj, yj] = inner[j];
        if ((yi > t) !== (yj > t) && s < (xj - xi) * (t - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (!inside) return false;
      for (let i = 0, j = inner.length - 1; i < inner.length; j = i++) {
        const [x0, y0] = inner[j], [x1, y1] = inner[i], dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
        const q = Math.max(0, Math.min(1, ((s - x0) * dx + (t - y0) * dy) / l2));
        if (Math.hypot(s - x0 - q * dx, t - y0 - q * dy) < r + 1.2) return false;
      }
      return true;
    };
    for (const sd of [1, -1]) {
      const wb = 23 * sd;
      g.add(inlayRing(inner, wb, sd), TRIM);
      // scallops: rows of rounded feather tips pointing back; the more forward a column, the higher it stands
      const sc = [], edges = [];
      for (let c = 0; c < 4; c++) for (let r = 0; r < 8; r++) {
        const cs = 34 + c * 13.5, ct = 19 - r * 12.4 + (c % 2 ? 6.2 : 0);
        if (c === 3 && ct > -50) continue;
        if (!insideStock(cs, ct, 6.4) || !clearOfTails(cs, ct, 6.4)) continue;
        const z1 = 0.45 + 0.22 * c, pts = [[cs + 5.6, ct - 5.8], [cs + 5.6, ct + 5.8]];
        for (let i = 0; i <= 7; i++) { const a = (90 + 180 * i / 7) * D2R; pts.push([cs - 1 + Math.cos(a) * 6.6, ct + Math.sin(a) * 5.8]); }
        sc.push(PF(pts, { ...onFace(wb, sd, -0.3, z1), bevel: 0.12, bevelSeg: 1, curveSeg: 2 }));
        const e = [];
        for (let i = 0; i <= 7; i++) { const a = (90 + 180 * i / 7) * D2R; e.push([cs - 1 + Math.cos(a) * 6.3, ct + Math.sin(a) * 5.5, wb + sd * (z1 + 0.02)]); }
        edges.push(sweep(e, 0.26, { seg: 6, radial: 3 }));
      }
      if (sc.length) { g.add(merge(sc), BODY); g.add(merge(edges), TRIM); }
      // underglaze scroll band along the top of the flank
      const topT = (s) => { let hi = -Infinity; for (let i = 0; i < inner.length; i++) { const p = inner[i], q = inner[(i + 1) % inner.length]; if ((p[0] - s) * (q[0] - s) <= 0 && p[0] !== q[0]) hi = Math.max(hi, p[1] + (q[1] - p[1]) * (s - p[0]) / (q[0] - p[0])); } return hi; };
      g.add(scrollBand(30, 222, (s) => topT(s) - 4.2, wb, sd, { amp: 1.0, r: 1.7 }), L.scroll);
    }
    // tail-feather plates: three stepped cloisonné feathers per side pointing back (each stands on its gold backing)
    for (const sd of [1, -1]) {
      TAILS.forEach(([s0, t0, len, wid], j) => {
        const { F } = tailF[j];
        const hu = vaneW(wid, 0.12, 0.62, 0.3), hd = vaneW(wid * 0.8, 0.12, 0.6, 0.3);
        addAll(g, cloisonne({ a: F.a, b: F.P(1, 0), hu, hd, w0: (23 + j * 1.75) * sd, sd, lift: j * 1.75, en: L.en, trim: TRIM, lines: 7, rows: [0.45],
          tipX: 0.82, nx: 8, rachis: 0.9, plate: 0.9, enT: 0.45, plateBevel: 0 }));
      });
    }
    // stock-to-receiver collar
    g.add(SC([[-24.6, -28, 2], [24.6, -28, 2], [24.6, 45.4, 3], [-24.6, 45.4, 3]], 232, 240, { bevel: 0.8 }), TRIM);
  }
  g.add = gAdd;

  // ======================================================================== lower receiver, magwell, trigger group, grip
  {
    let lower = PF([[252, -23.5, 1], [522, -23.5, 1], [522, -38, 3], [486, -47, 4], [404, -47, 2], [362, -45, 6], [258, -45, 6], [250, -36, 4]], { w: 50, bevel: 1.6, curveSeg: 3 });
    const well = PF([[404, -40, 1], [484, -40, 1], [486, -66, 3], [400, -66, 3]], { w: 42, bevel: 1.8, curveSeg: 3 });
    lower = union(lower, well);
    const lc = [cutters.box([443, -50, 0], [48.5, 46, 30.4]), cutters.box([334, -46, 0], [20, 14, 8])];
    // machined relief pockets on the lower receiver flanks
    for (const sd of [1, -1]) {
      lc.push(cutters.pocketW([[286, -43, 2], [324, -43, 2], [324, -28.5, 2], [286, -28.5, 2]], 24.4 * sd, 4));
      lc.push(cutters.pocketW([[344, -43, 2], [376, -43, 2], [376, -28.5, 2], [344, -28.5, 2]], 24.4 * sd, 4));
    }
    // machined: a parting seam along each flank, under the relief pockets
    for (const sd of [1, -1]) lc.push(cutters.box([388, -45.2, 25 * sd], [262, 0.7, 1.4]));
    lower = cut(lower, lc);
    g.add(lower, 'steel');                      // satin steel: black chrome read as a hole under the white shells
    g.add(PF([[398, -63.5, 2], [488, -63.5, 2], [490, -67.5, 1], [396, -67.5, 1]], { w: 43.6, bevel: 0.6 }), TRIM);
    // aged-bronze magwell front plate
    g.add(PF([[486.4, -42, 1], [489.6, -42, 1], [490.4, -62, 1], [487.2, -62, 1]], { w: 30, bevel: 0.5 }), TRIM2);
    for (const sd of [1, -1]) {
      for (const [s, t] of [[276, -34], [334, -31], [508, -33]]) g.add(pinEnd([s, t, 25 * sd], 1.7, sideAx(sd), 0.5), 'steel');
      g.add(capScrew([392, -40, 25.1 * sd], 2.1, sideAx(sd), 0.9), 'steel_dark');
      for (const sv of [305, 360]) g.add(capScrew([sv, -25.6, 25.05 * sd], 1.0, sideAx(sd), 0.45, 6), 'steel_dark');   // pocket-frame screws
      g.add(capScrew([279, -35, 22.6 * sd], 1.4, sideAx(sd), 0.6), TRIM2);
      g.add(capScrew([383, -35, 22.6 * sd], 1.4, sideAx(sd), 0.6), TRIM2);
    }
    // seal cartouche (right): gold plate, a lacquer field with the two seal glyphs in raised gold, engraved serial
    {
      const cs = 431, ct = -31.4, wb = 25, sd = 1;
      let plate = PF([[cs - 19, ct - 6.4, 1.6], [cs + 19, ct - 6.4, 1.6], [cs + 19, ct + 6.4, 1.6], [cs - 19, ct + 6.4, 1.6]], { ...onFace(wb, sd, -0.3, 0.9), bevel: 0.35, bevelSeg: 1 });
      // (both lines are blackened inlays: a CSG-cut serial on top cost 2.6-4k triangles the inlay already reads as)
      g.add(plate, TRIM);
      g.add(PF([[cs - 17.6, ct - 5.2, 0.6], [cs - 0.6, ct - 5.2, 0.6], [cs - 0.6, ct + 5.2, 0.6], [cs - 17.6, ct + 5.2, 0.6]], { ...onFace(wb, sd, 0.7, 1.05), bevel: 0.1, bevelSeg: 1 }), L.medal);
      const frame = [[cs - 17.0, ct - 4.6], [cs - 1.2, ct - 4.6], [cs - 1.2, ct + 4.6], [cs - 17.0, ct + 4.6]];
      g.add(PF(offsetPoly(frame, 0.32), { holes: [offsetPoly(frame, -0.32)], ...onFace(wb, sd, 0.9, 1.4), bevel: 0 }), TRIM);
      for (let i = 0; i < 2; i++) g.add(sealGlyph(L.seal[i], [cs - 16.3 + i * 7.9, ct - 3.6], 7.2, wb, sd, 0.95, 1.38, 0.95), TRIM);
      g.add(merge([engraveFill(L.name, cs + 9.6, ct + 2.3, 2.2, wb + 0.9, sd, 0.24, 0.1), engraveFill(L.serial, cs + 9.6, ct - 2.6, 2.4, wb + 0.9, sd)]), DARK);
    }
    // a single seal (left)
    {
      const cs = 506, ct = -31, wb = -25, sd = -1;
      g.add(PF([[cs - 5.4, ct - 5.4, 1.2], [cs + 5.4, ct - 5.4, 1.2], [cs + 5.4, ct + 5.4, 1.2], [cs - 5.4, ct + 5.4, 1.2]], { ...onFace(wb, sd, -0.3, 0.8), bevel: 0.3, bevelSeg: 1 }), TRIM);
      g.add(PF([[cs - 4.4, ct - 4.4, 0.5], [cs + 4.4, ct - 4.4, 0.5], [cs + 4.4, ct + 4.4, 0.5], [cs - 4.4, ct + 4.4, 0.5]], { ...onFace(wb, sd, 0.6, 0.95), bevel: 0.1, bevelSeg: 1 }), L.medal);
      g.add(sealGlyph(L.seal[0], [cs + 3.6, ct - 3.6], 7.2, wb, sd, 0.85, 1.28, 0.95), TRIM);
    }
    // trigger guard (one piece) and trigger
    g.add(PF([[300, -44, 1], [372, -44, 1], [374, -50, 2], [366, -64, 10], [318, -66, 6], [300, -56, 3], [306, -56, 2], [322, -60, 4], [360, -59, 6], [366, -50, 2], [306, -50, 1]],
      { w: 9, bevel: 1.2, curveSeg: 3 }), DARK);
    g.add(sweep([[318, -64.6, 4.9], [342, -66.6, 4.9], [366, -62.4, 4.9]], 0.45, { seg: 12, radial: 4 }), TRIM);
    g.add(sweep([[318, -64.6, -4.9], [342, -66.6, -4.9], [366, -62.4, -4.9]], 0.45, { seg: 12, radial: 4 }), TRIM);
    const trig = g.part('trigger', { pivot: [338, -40, 0], extras: { axis: 'x', pullDeg: -12 } });
    trig.add(PF([[333.5, -43, 2], [343, -43, 2], [343.5, -49, 0], [341.4, -53, 4], [342.6, -57, 1.2], [340.4, -58, 1], [336.6, -53, 4], [336, -49, 0]], { w: 6, bevel: 0.9 }), TRIM);
    // selector lever (left) + magazine latch button (right)
    g.add(PF([...arcPts(268, -32, 5, 150, 390, 8), [272, -26.5, 1.2], [276, -22.5, 1.6], [262, -22.5, 1.6], [264, -26.5, 1.2]], { w: 2.2, cw: -26.2, bevel: 0.6 }), TRIM);
    g.add(lax([[0, 0], [0, 4.2], [1.6, 4.2], [2.2, 3.6], [2.2, 0]], [494, -54, 21], 'w', 18), TRIM);

    // pistol grip: a lofted grip (superellipse rings) raked 20°: porcelain ends, pebbled leather middle bound by two
    // flat silk cords (diamond wrap) between gold ferrules, a cross-stitched seam down the back strap, a tassel
    const GT = [302, -44], GB = [278, -122];
    const gax = axisFrame(GT, GB);                  // u 0..1 down the grip, o across (o > 0 = forward edge side)
    const depth = (u) => 24.5 - 2.5 * u + 1.6 * Math.sin(Math.PI * Math.min(1, u * 1.4)) - (u > 0.9 ? (u - 0.9) * 12 : 0);
    const halfW = (u) => 14.6 - 1.4 * u;
    const off = (u) => 1.8 * Math.sin(Math.PI * u);           // palm swell pushes the back
    const ringPts = (u, grow = 0, n = 32) => {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const x = Math.sign(c) * Math.pow(Math.abs(c), 0.5), y = Math.sign(s) * Math.pow(Math.abs(s), 0.5);   // superellipse n = 4
        const [S, T] = gax.P(u, x * (depth(u) + grow) - off(u));
        pts.push([S, T, y * (halfW(u) + grow)]);
      }
      return pts;
    };
    const gripLoft = (ua, ub, rows, grow = 0) => { const rr = []; for (let r = 0; r <= rows; r++) rr.push(ringPts(ua + (ub - ua) * r / rows, grow)); return loft(rr, { crease: 50 }); };
    const nrmAt = (u, p) => { const c = gax.P(u, -off(u)); return [p[0] - c[0], p[1] - c[1], p[2]]; };
    const u0 = 0.14, u1 = 0.84;
    g.add(merge([gripLoft(0, u0 - 0.02, 4), gripLoft(u1 + 0.02, 1, 4)]), BODY);
    g.add(gripLoft(u0 - 0.03, u1 + 0.03, 20, -0.4), L.wrap);
    const turns = 5, nPer = 16;
    for (const dir of [1, -1]) {
      const pts = [], nrm = [];
      for (let i = 0; i <= turns * nPer; i++) {
        const u = u0 + (u1 - u0) * i / (turns * nPer), k = ((dir > 0 ? i : nPer * 4 - i + nPer / 2) % nPer + nPer) % nPer;
        const p = ringPts(u, -0.4, nPer)[k];
        pts.push(p); nrm.push(nrmAt(u, p));
      }
      g.add(bandAlong(pts, nrm, 2.2, 0.75 + (dir > 0 ? 0.25 : 0), 0.15, { flat: true }), L.cord);
    }
    for (const u of [u0 - 0.03, u1 + 0.03]) g.add(seLoop(ringPts(u, 0.9, 24), 1.5), TRIM);
    // back-strap seam: a raised welt with cross stitches
    {
      const welt = [], wn = [], st2 = [];
      for (let i = 0; i <= 24; i++) {
        const u = u0 + 0.01 + (u1 - u0 - 0.02) * i / 24, p = ringPts(u, -0.4, 32)[16];
        welt.push(p); wn.push(nrmAt(u, p));
      }
      g.add(bandAlong(welt, wn, 1.6, 0.6, 0.3), L.wrap);
      for (let i = 0; i < 22; i++) {
        const u = u0 + 0.02 + (u1 - u0 - 0.04) * (i + 0.5) / 22, p = V(...ringPts(u, -0.05, 32)[16]), n = V(...nrmAt(u, ringPts(u, 0, 32)[16])).normalize();
        const T = V(...gax.P(u + 0.01, 0), 0).sub(V(...gax.P(u - 0.01, 0), 0)).normalize(), Wv = new THREE.Vector3(1, 0, 0);
        for (const q of [1, -1]) {
          const d = T.clone().multiplyScalar(Math.cos(40 * D2R)).addScaledVector(Wv, q * Math.sin(40 * D2R)).normalize();
          const geo = new THREE.BoxGeometry(0.55, 0.45, 3.0);            // long axis along z, thin along y (the normal)
          const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(n, d).normalize(), n, d.clone().negate());
          geo.applyMatrix4(m); geo.translate(p.x, p.y, p.z);
          st2.push(geo);
        }
      }
      g.add(renormal(merge(st2), WIRE), TRIM2);
    }
    // tassel: a knot at the back of the lower ferrule, a gold cap and twelve silk strands
    {
      const kp = ringPts(u1 + 0.05, 1.2, 32)[16], kn = V(...nrmAt(u1 + 0.05, kp)).normalize();
      const K = st(V(...kp).addScaledVector(kn, 1.6));
      g.add(sphere(K, 2.4, { seg: 10, scale: [1, 1.15, 0.9] }), L.cord);
      g.add(lax([[0, 0], [0, 1.8], [1.2, 2.2], [3.0, 2.0], [3.6, 1.4], [3.6, 0]], [K[0] - 1, K[1] - 2.0, K[2]], '-t', 14), TRIM);
      const strands = [];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, r = 1.1 + 0.4 * (k % 2);
        const A = [K[0] - 1 + Math.cos(a) * r, K[1] - 5.4, K[2] + Math.sin(a) * r], Bp = [K[0] - 2.4 + Math.cos(a) * r * 1.6, K[1] - 24 - (k % 3), K[2] + Math.sin(a) * r * 1.6];
        strands.push(limb(A, Bp, 0.42, 0.3, 5));
      }
      g.add(merge(strands), L.cord);
    }
    const cap = gax.P(1.0, -off(1));
    g.add(xform(lax([[0, 0], [0, 15.5], [2.2, 15.5], [4.6, 13], [5.2, 0]], [0, 0, 0], '-t', 28), { scale: [1.62, 1, 1], rot: [-17, 0, 0], move: [cap[0] + 1.2, cap[1] + 1.6, 0] }), TRIM2);
    g.add(sweep([[cap[0] - 2, cap[1] - 3.8, 0], [cap[0] - 4, cap[1] - 9, 0], [cap[0] + 2, cap[1] - 11, 0], [cap[0] + 3.4, cap[1] - 5.4, 0]], 1.1, { seg: 16, radial: 6 }), TRIM);
  }

  // ======================================================================== neck (barrel shroud, s 630-826) and head
  {
    const NT = 3;   // neck axis sits 3 mm above the bore
    const NECK = [[630, 15.8], [630, 31], [636, 32], [652, 30.5], [682, 24.5], [716, 22.6], [742, 24.6], [768, 29.4], [794, 31.2], [816, 30.2], [824, 26], [826, 15.8], [630, 15.8]];
    const NR = NECK.slice(1, 11), nr = (s) => { let i = 0; while (i < NR.length - 2 && s > NR[i + 1][0]) i++; const [a, ra] = NR[i], [b, rb] = NR[i + 1]; return ra + (rb - ra) * Math.max(0, Math.min(1, (s - a) / (b - a))); };   // outer radius (the lathe is linear between its points)
    // hollow shroud (the barrel runs inside), three vent slots per side show it
    let neck = lathe(NECK, { t: NT, seg: 48 });
    const vents = [];
    for (const sd of [1, -1]) for (const [a, b] of [[664, 688], [698, 720], [730, 748]]) vents.push(PF([[a, NT - 6.5, 4.5], [b, NT - 6.5, 4.5], [b, NT + 2.5, 4.5], [a, NT + 2.5, 4.5]], { w: 16, cw: 24 * sd, bevel: 0, curveSeg: 3 }));
    neck = cut(neck, vents);
    g.add(neck, BODY);
    // gold neck bands round a red lacquer ring (赤文), a collar at the body and one where the beak seats
    g.add(band(690, 695, 22.6, 25.4, NT, 0.5, 36), TRIM);
    g.add(band(700, 714, 22.4, 23.9, NT, 0.5, 36), L.focus === 'pearl' ? 'lacquer_red' : L.en[1]);
    g.add(band(719, 724, 22.6, 25.2, NT, 0.5, 36), TRIM);
    g.add(band(638, 646, 29, 32.6, NT, 0.6, 36), TRIM);
    g.add(band(818, 823, 26.5, 29.8, NT, 0.5, 36), TRIM);
    // vent frames: gold wire round each slot
    for (const sd of [1, -1]) {
      const proj = projector(neck, sd, 0.2, 26 * sd);
      for (const [a, b] of [[664, 688], [698, 720], [730, 748]]) g.add(sweep(rectLoop([a - 1.3, NT - 7.7], [b + 1.3, NT + 3.7], 3).map(proj), 0.45, { seg: 24, radial: 3, closed: true }), TRIM);
    }
    // throat-feather scales at the collar: 12 porcelain scales round the neck, each carrying a cloisonné heart (青
    // enamel in a closed gold wire, like the mantle scales), all following the scale's own tilt
    {
      const heart = [[651, -3.3, 2], [661, -3.9, 3], [670.6, 0, 0.8], [661, 3.9, 3], [651, 3.3, 2]];
      const loop = offsetPoly(dedupe(makeShape(heart).getPoints(3).map((v) => [v.x, v.y])), 0.3);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * 360 + 15;
        const piv = { rot: [-11.3, 0, 0], pivot: [648, NT + 31.2, 0] }, ring = { rot: [0, 0, a], pivot: [0, NT, 0] };
        const both = (geo) => xform(xform(geo, piv), ring);
        g.add(both(PL([[648, -5.2, 3], [662, -6, 4], [676, 0, 1], [662, 6, 4], [648, 5.2, 3]], { h: 1.6, ct: NT + 31.2, bevel: 0.5, bevelSeg: 1, curveSeg: 2 })), BODY);
        g.add(both(PL(heart, { h: 0.7, ct: NT + 31.95, bevel: 0.12, bevelSeg: 1, curveSeg: 2 })), L.en[0]);
        g.add(both(sweep(loop.map(([x, y]) => [x, NT + 32.22, y]), 0.3, { seg: loop.length, radial: 3, closed: true })), TRIM);
      }
    }
    // eyes in gold bezels, ringed by two rings of small feather scales (the inner one 赤 enamel), a sculpted brow and
    // a lash wire, on the curved head (placed by angle round the neck axis)
    const ES = 792, EA = 23.5;                                      // eye: s, angle above +w (deg)
    const onHead = (s, ang, lift = 0) => { const r = nr(s) + lift, a = ang * D2R; return [s, NT + r * Math.sin(a), r * Math.cos(a)]; };
    for (const sd of [1, -1]) {
      const E = onHead(ES, EA), ew = E[2] * sd;
      g.add(lax([[0, 0], [0, 4.4], [0.8, 4.8], [1.8, 4.6], [1.8, 0]], [ES, E[1], ew - 0.9 * sd], sideAx(sd), 22), TRIM);
      // the eye: a smooth glazed iris ball with a pupil skin looking out and a little forward (round: 畢方, slit: 鬼車)
      const ec = [ES, E[1], ew + 0.4 * sd], look = V(0.22, Math.sin(EA * D2R), Math.cos(EA * D2R) * sd).normalize();
      g.add(sphere(ec, 3.0, { seg: 22 }), L.eye);
      g.add(pupilSkin(ec, 3.0, look, V(0, 1, 0), L.hooked ? 0.62 : 0.4, L.hooked ? 0.13 : 0.4), L.pupil);
      // feather scales: three rings round the eye, every scale pointing back along the head (the ones nearer the beak
      // overlap the ones behind), 赤 next to the eye; built on top of the neck (facing +t), then turned round the axis
      const scales = [[], []];
      for (const [ring, n, R, sz] of [[0, 11, 6.0, 0.8], [1, 14, 8.9, 1.0], [1, 17, 12.0, 1.12]]) for (let i = 0; i < n; i++) {
        const phi = (i + (ring && R < 10 ? 0.5 : 0)) / n * Math.PI * 2, ds = Math.cos(phi) * R, darc = Math.sin(phi) * R * 0.92;
        const s = ES + ds, ang = EA + (darc / nr(s)) / D2R;
        if (s > 805) continue;
        const lobe = [[-1.3, 0], [-0.3, -1.35], [1.0, -1.5], [2.0, -0.9], [2.25, 0], [2.0, 0.9], [1.0, 1.5], [-0.3, 1.35]].map(([x, y]) => [s - x * sz, y * sz, 0]);   // teardrop: narrow root, round tip
        // shingled: the root tucks into the head, the rounded tip lifts ~0.5 mm (each row overlaps the one behind)
        const ct = NT + nr(s) - 0.2, h = 0.62 + 0.012 * (ds + 13);
        const geo = xform(PL(lobe, { h, ct, bevel: ring ? 0 : 0.2, bevelSeg: 1, curveSeg: 1 }), { rot: [R < 7 ? -9 : -13, 0, 0], pivot: [s + 1.1 * sz, ct - h / 2, 0] });
        scales[ring].push(xform(geo, { rot: [0, 0, sd > 0 ? ang - 90 : 90 - ang], pivot: [0, NT, 0] }));
      }
      g.add(merge(scales[0]), L.eyeRing);
      g.add(merge(scales[1]), BODY);
      const brow = [], lash = [];
      for (let i = 0; i <= 10; i++) { const s = ES - 11 + 23 * i / 10; brow.push(onHead(s, EA + (11.5 + 2.4 * Math.sin(Math.PI * i / 10)) / nr(s) / D2R, 0.5).map((v, k) => (k === 2 ? v * sd : v))); }
      for (let i = 0; i <= 8; i++) { const s = ES - 5 - 22 * i / 8; lash.push(onHead(s, EA + (1.2 + 6 * (i / 8) ** 1.4) / nr(s) / D2R, 0.3).map((v, k) => (k === 2 ? v * sd : v))); }
      g.add(sweep(brow, 1.0, { seg: 20, radial: 6 }), TRIM);
      g.add(sweep(lash, 0.45, { seg: 14, radial: 4 }), TRIM);
    }
    // crest = front sight tower: four lens-section plumes (raised rachis, cloisonné rows, gold-edged, curling out)
    // fanned on a gold collar; sight post + ears between them
    // the plumes fan out in w (tips ±8..12 mm) and roll about their spines (outer ones more), so the crest shows
    // faces, not edges, from the front, from above and from the shooter's seat
    const PLUMES = [
      { pts: [[764, 27, -4.2], [765, 50, -5.8], [769.5, 76, -9.0], [773, 99, -12.5]], wid: 6.6, roll: -38 },
      { pts: [[776, 27, -2.3], [779, 50, -3.2], [784, 70, -5.6], [788.5, 86, -8.6]], wid: 6.4, roll: -18 },
      { pts: [[788, 27, 2.3], [793, 48, 3.2], [800, 66, 5.6], [806.5, 79, 8.6]], wid: 6.2, roll: 18 },
      { pts: [[800, 27, 4.2], [806, 42, 5.8], [813, 54, 8.4], [819.5, 63, 11.5]], wid: 5.6, roll: 38 },
    ];
    for (const p of PLUMES) {
      const cv = new THREE.CatmullRomCurve3(p.pts.map((q) => V(...q)));
      const spine = (u) => st(cv.getPoint(u));
      const hu = (u) => p.wid * (0.32 + 0.68 * smooth(0, 0.22, u)) * (u < 0.5 ? 1 : Math.sqrt(Math.max(0, 1 - ((u - 0.5) / 0.5) ** 2)));
      const hd = (u) => hu(u) * 0.86;
      const th = (u) => 3.4 * Math.pow(1 - u, 1.2) + 0.35;
      const roll = (u) => p.roll * D2R * (0.35 + 0.65 * smooth(0, 0.7, u));
      const { list, surf } = featherLoft(spine, hu, hd, th, { nU: 14, nX: 8, rows: [0.4, 0.75], mats: L.crestEn, tipU: 0.84, roll });
      addAll(g, list);
      const wires = [];
      for (const face of [1, -1]) {
        for (let j = 1; j <= 4; j++) for (const sx of [1, -1]) {
          const pts = [];
          for (let i = 0; i <= 3; i++) { const x = 0.16 + 0.8 * i / 3, u = Math.min(0.97, 0.04 + j * 0.18 + x * 0.12); pts.push(surf(u, sx * x, face, 0.08)); }
          wires.push(sweep(pts, 0.24, { seg: 3, radial: 3 }));
        }
        for (const sx of [0.4, -0.4]) { const pts = []; for (let i = 0; i <= 8; i++) pts.push(surf(0.03 + 0.9 * i / 8, sx, face, 0.08)); wires.push(sweep(pts, 0.24, { seg: 9, radial: 3 })); }
      }
      const edge = [];
      for (let i = 0; i <= 16; i++) edge.push(surf(i / 16 * 0.995, -1, 1));
      for (let i = 16; i >= 0; i--) edge.push(surf(i / 16 * 0.995, 1, 1));
      wires.push(sweep(edge, 0.34, { seg: 26, radial: 3 }));
      g.add(merge(wires), TRIM);
    }
    g.add(PF([[752, 22, 1], [821, 22, 1], [821, 31.6, 2], [814, 34, 2], [756, 32.6, 2], [752, 29.4, 1]], { w: 13, bevel: 1.2, bevelSeg: 2 }), TRIM);
    // front sight: a gold crest pin rising between the middle plumes, a flame bead on top level with the rear aperture
    {
      const a = [782, 33.6, 0], b = [795, 88.4, 0];
      g.add(limb(a, b, 0.95, 0.6, 8), TRIM);
      g.add(aim(lathe([[0, 1.0], [0, 1.9], [0.7, 2.2], [1.4, 1.9], [1.4, 1.0], [0, 1.0]], { seg: 12 }), [781.6, 32.4, 0], [782.4, 35.6, 0]), TRIM);
      g.add(aim(lathe([[0, 0], [0, 0.8], [0.7, 1.4], [1.9, 1.5], [3.0, 1.0], [3.7, 0.3], [3.9, 0]], { seg: 12 }), [794.9, 87.9, 0], [795.9, 92.0, 0]), TRIM);
    }
  }

  // ======================================================================== barrel (bore Ø18.6, OD Ø24), ember throat
  {
    const bp = [[650, 9.3], [650, 12]];
    for (let x = 670; x < 858; x += 20) bp.push([x, 12]);
    bp.push([858, 12], [858.6, 11.4], [860, 10.6], [860, 9.3], [650, 9.3]);
    g.add(lathe(bp, { seg: 20 }), 'steel_dark');                    // hidden inside the receiver behind s 650
  }
  g.add(band(859.6, 860.8, 6.8, 9.2, 0, 0.3, 24), L.throat);     // the furnace throat behind the beak
  // compensator inside the gape: three port rings
  for (let k = 0; k < 3; k++) g.add(band(830 + k * 9, 834 + k * 9, 12, 13.6, 0, 0.4, 24), DARK);

  // ======================================================================== beak: lofted mandibles, the lower one hinged (fx_beak)
  {
    const K = beakKit(variant), B = K.B;
    let up = loft(beakStations(806, B.tip - 0.3).map((s) => K.upperRing(s)), { crease: 46 });
    // nostril: a slot cut into the cheek near the base, a dark insert at its floor
    const nost = [];
    for (const sd of [1, -1]) {
      const cwN = K.cheekW(837, 23.4);
      nost.push(PF([[828, 25.0, 0.8], [846, 22.8, 0.8], [846.4, 21.4, 0.8], [828.4, 23.6, 0.8]], { w: 4.5, cw: sd * (cwN + 0.75), bevel: 0 }));
      g.add(box([837.2, 23.2, sd * (cwN - 1.25)], [18, 1.3, 0.5], { r: 0, rot: [-7, 0, 0] }), 'glaze_black');
    }
    up = cut(up, nost);
    g.add(up, BODY);
    // gold wires: in the tomium grooves, along the keel
    for (const sd of [1, -1]) {
      const pts = [];
      for (let s = 834; s <= B.tip - 7; s += 6) { const u = K.up(s); pts.push([s, u.m + 1.5 * u.k, sd * (0.93 * u.w - 0.25 * u.k + 0.32)]); }
      g.add(sweep(pts, 0.5, { seg: 36, radial: 5 }), TRIM);
    }
    { const pts = []; for (let s = 836; s <= B.tip - 6; s += 6) pts.push([s, K.tc(s) + 0.22, 0]); g.add(sweep(pts, 0.62, { seg: 30, radial: 5 }), TRIM); }
    // a cloisonné feather inlaid along each cheek above the tomium, laid onto the curved surface
    for (const sd of [1, -1]) {
      const BA = [852, 18.4], BB = [928, 14.6];
      const list = cloisonne({ a: BA, b: BB, hu: vaneW(3.2, 0.2, 0.55, 0.3), hd: vaneW(2.3, 0.2, 0.55, 0.3), w0: 0, sd, en: L.en, trim: TRIM, lines: 7, rows: [0.5],
        tipX: 0.8, nx: 9, rachis: 0.5, plate: 0.5, enT: 0.32, rim: 0.7, ww: 0.32, wh: 0.18, plateBevel: 0 });
      for (const [geo, m] of list) {
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + sd * (K.cheekW(-p.getZ(i), p.getY(i)) - 0.25));
        g.add(renormal(geo), m);
      }
    }
    // lower mandible: hinged at s 820 / t -6, opens 12° (≈4° per shot)
    const beak = g.part('fx_beak', { pivot: [820, -6, 0], extras: { open: -12, hinge: 'w', note: 'lower mandible: open 1 = 12° down; a shot kicks it to ~0.33 (4°)' } });
    beak.add(loft(beakStations(810, B.ltip - 0.3).map((s) => K.lowerRing(s)), { crease: 46 }), BODY);
    for (const sd of [1, -1]) {
      const pts = [];
      for (let s = 836; s <= B.ltip - 7; s += 6) { const w = K.lW(s), k = Math.min(1, w / 6); pts.push([s, K.ltm(s) - 1.5 * k, sd * (0.93 * w - 0.25 * k + 0.32)]); }
      beak.add(sweep(pts, 0.5, { seg: 30, radial: 5 }), TRIM);
      beak.add(lax([[0, 0], [0, 4.4], [1, 4.4], [1.6, 3.6], [1.6, 0]], [820, -6, 15.2 * sd], sideAx(sd), 20), TRIM);
    }
    { const pts = []; for (let s = 828; s <= B.ltip - 7; s += 6) pts.push([s, K.lg(s) - 0.2, 0]); beak.add(sweep(pts, 0.7, { seg: 24, radial: 5 }), TRIM); }   // gonys ridge
  }

  // ======================================================================== single-leg foregrip (畢方一足)
  {
    const LS = 664;
    g.add(PF([[640, -18, 4], [690, -18, 4], [684, -34, 6], [648, -34, 6]], { w: 30, bevel: 2.2, bevelSeg: 2 }), BODY);         // hip block under the neck
    for (const sd of [1, -1]) g.add(capScrew([666, -26, 15 * sd], 1.5, sideAx(sd), 0.6), DARK);
    g.add(lax([[0, 0], [0, 13], [1, 14], [5, 14], [6, 13], [6, 0]], [LS, -40, 0], 't', 32), TRIM);
    // thigh (porcelain, feathered skirt) -> knee (bronze band, gold joint pins) -> cord-wrapped shin -> scaled ankle
    g.add(lax([[0, 0], [0, 11.4], [2, 11.4], [8, 10.8], [32, 11.4], [40, 12.6], [40, 0]], [LS, -40, 0], '-t', 32), BODY);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      const sk = PF([[0, 0, 0], [2.6, -2, 1], [0, -15, 1], [-2.6, -2, 1]].map(([x, y, r]) => [LS + x, -42 + y, r]), { w: 1.4, cw: 11.9, bevel: 0.4, bevelSeg: 1 });
      xform(sk, { rot: [0, a / D2R, 0], pivot: [LS, 0, 0] });
      g.add(sk, BODY);
      const ed = sweep([[LS - 2.2, -44.2, 12.7], [LS, -56.4, 12.7], [LS + 2.2, -44.2, 12.7]], 0.28, { seg: 8, radial: 3 });
      g.add(xform(ed, { rot: [0, a / D2R, 0], pivot: [LS, 0, 0] }), TRIM);
    }
    g.add(lax([[0, 0], [0, 12.6], [1.2, 14], [8.8, 14], [10, 12.6], [10, 0]], [LS, -80, 0], '-t', 32), L.claw);
    for (const sd of [1, -1]) g.add(lax([[0, 0], [0, 3.4], [1, 3.4], [1.8, 2.4], [1.8, 0]], [LS, -85, 13.6 * sd], sideAx(sd), 14), TRIM);
    g.add(lax([[0, 0], [0, 11.2], [44.5, 11.2], [44.5, 0]], [LS, -90, 0], '-t', 32), L.wrap);
    for (const dir of [1, -1]) {
      const pts = [], nrm = [];
      for (let i = 0; i <= 4 * 16; i++) { const u = i / (4 * 16), a = dir * u * 4 * Math.PI * 2; pts.push([LS + Math.cos(a) * 11.2, -92 - u * 40.5, Math.sin(a) * 11.2]); nrm.push([Math.cos(a), 0, Math.sin(a)]); }
      g.add(bandAlong(pts, nrm, 2.2, 0.75 + (dir > 0 ? 0.25 : 0), 0.15, { flat: true }), L.cord);
    }
    for (const t of [-90.6, -133.6]) g.add(lax([[0, 0], [0, 13.2], [0.6, 13.8], [2.4, 13.8], [3, 13.2], [3, 0]], [LS, t + 1.5, 0], '-t', 32), TRIM);
    for (let k = 0; k < 3; k++) g.add(lax([[0, 10.8], [0, 12.4], [3.2, 11.2], [3.6, 10.4], [3.6, 10]], [LS, -136.4 - k * 3.2, 0], '-t', 28), L.claw);
    // three-toed claw: jointed toes (two front 40 mm spread ±24°, one back 25 mm), knuckle balls, gold talons
    const AT = -146;
    g.add(sphere([LS, AT, 0], 9.5, { seg: 18, scale: [1, 0.75, 1] }), L.claw);
    for (const [ang, len] of [[24, 40], [-24, 40], [180, 25]]) {
      const ca = Math.cos(ang * D2R), sa = -Math.sin(ang * D2R);
      const pt = (d, h) => [LS + ca * d, AT + h, sa * d];
      const segs = len > 30 ? [[4, 16, 5.2, 4.4], [16, 28, 4.4, 3.8], [28, len - 4, 3.8, 3.2]] : [[4, 13, 5, 4.2], [13, len - 4, 4.2, 3.4]];
      for (const [d0, d1, r0, r1] of segs) {
        g.add(limb(pt(d0, -1.4), pt(d1, -2.2), r0, r1, 12), L.claw);
        g.add(sphere(pt(d1, -2.2), r1 + 0.6, { seg: 10 }), L.claw);
        g.add(aim(lathe([[0, r1 + 0.3], [0, r1 + 1], [1.1, r1 + 1], [1.1, r1 + 0.3], [0, r1 + 0.3]], { seg: 14 }), pt(d1 - 2.4, -2.1), pt(d1, -2.2)), TRIM);
      }
      // talon: a curved gold claw hooking down
      const tip0 = pt(len - 4, -2.4), tipA = pt(len + 2, -3.6), tipB = pt(len + 6.4, -7.8), tipC = pt(len + 7.4, -12);
      g.add(merge([limb(tip0, tipA, 3.1, 2.4, 10), limb(tipA, tipB, 2.4, 1.4, 10), limb(tipB, tipC, 1.4, 0.35, 8)]), L.toe);
    }
    // the ankle spur (back)
    g.add(limb([LS - 9, -128, 0], [LS - 16, -124, 0], 2.4, 0.4, 8), L.toe);
    g.socket('grip_l', [LS, -114, 0]);
  }

  // ======================================================================== feather energy magazine + side gate
  {
    const MS = 443, MT = -42;
    const mag = g.part('mag', { pivot: [MS, MT, 0], extras: { drop: true, pv: { ...L.mag }, note: 'feather energy cell: double glass wall over a pv_core interior (obsidian key) with a glowing rachis / barbs' } });
    // feather silhouette: straight in the well, curving forward to an asymmetric tip swept forward; three barb notches
    // in the trailing edge
    const sc = (u) => MS + 26 * u * u, tt = (u) => MT + 2 - u * 146, hwm = (u) => 23 * (1 - 0.55 * u * u * u);
    const outline = (e = 0, u0 = 0, notch = true) => {
      const pts = [], N = 18;
      for (let i = 0; i <= N; i++) { const u = u0 + (1 - u0) * i / N; pts.push([sc(u) + hwm(u) - e, tt(u), i === N ? 5 : 0]); }
      pts.push([sc(1) + 9 - e * 0.8, tt(1) - 9 + e * 0.6, 2.2]);
      for (let i = N; i >= 0; i--) {
        const u = u0 + (1 - u0) * i / N, du = (1 - u0) / N;
        pts.push([sc(u) - hwm(u) + e, tt(u), i === N ? 7 : 0]);
        if (notch) for (const nu of [0.44, 0.62, 0.79]) if (nu < u && nu >= u - du) {
          const s0 = sc(nu) - hwm(nu) + e, t0 = tt(nu);
          pts.push([s0 - 0.2, t0 + 1.6, 0.4], [s0 + 2.8, t0 + 0.4, 0.5], [s0 + 0.2, t0 - 1.4, 0.4]);
        }
      }
      return pts;
    };
    mag.add(PF(outline(0), { w: 28, bevel: 3, bevelSeg: 3, curveSeg: 3 }), 'glass_clear');
    mag.add(PF(outline(1.6), { w: 24.6, bevel: 2.4, bevelSeg: 2, curveSeg: 3 }), 'glass_clear');          // inner face of the wall
    mag.add(PF(outline(5.2, 0.08, false), { w: 16.4, bevel: 2.6, bevelSeg: 2, curveSeg: 3 }), 'obsidian');
    // the cell's 羽脈紋: a glowing rachis down the core and barbs running towards the tip, on both faces
    {
      const gl = [];
      for (const f of [1, -1]) {
        const w = f * 8.25;
        for (let i = 0; i < 12; i++) { const u = 0.12 + 0.8 * i / 12, v = u + 0.8 / 12; gl.push(strip([sc(u), tt(u)], [sc(v), tt(v)], w, 1.4, 0.3)); }
        for (let i = 0; i < 8; i++) {
          const u = 0.16 + i * 0.095, c = [sc(u), tt(u)], hl = (hwm(u) - 7.5) * 0.9;
          if (hl < 3) continue;
          for (const q of [1, -1]) gl.push(strip(c, [c[0] + q * hl, c[1] - hl * 0.9], w, 0.7, 0.3));
        }
      }
      mag.add(merge(gl), L.vein);
    }
    // gold rachis spine along the front edge (a ball at the tip), a frame bar on the upper back edge
    const spine = [], back = [];
    for (let i = 0; i <= 14; i++) { const u = 0.04 + 0.94 * i / 14; spine.push([sc(u) + hwm(u) + 0.6, tt(u), 0]); }
    for (let i = 0; i <= 6; i++) { const u = 0.04 + 0.34 * i / 6; back.push([sc(u) - hwm(u) - 0.5, tt(u), 0]); }
    mag.add(sweep(spine, 2.2, { seg: 28, radial: 7 }), L.trim);
    mag.add(sweep(back, 1.6, { seg: 12, radial: 6 }), L.trim);
    mag.add(sphere([sc(1) + 10, tt(1) - 10, 0], 2.6, { seg: 12 }), L.trim);
    // three straps hugging the glass (rounded like its edges), screw bosses on both faces
    for (const u of [0.3, 0.55, 0.76]) {
      const s0 = sc(u), t0 = tt(u), hwU = hwm(u), ang = Math.atan2(52 * u, 146) / D2R;
      const ring = PL([[-hwU - 1.4, -15.4, 4.2], [hwU + 1.4, -15.4, 4.2], [hwU + 1.4, 15.4, 4.2], [-hwU - 1.4, 15.4, 4.2]], { h: 3.2, ct: 0, bevel: 0.5, bevelSeg: 1,
        holes: [[[-hwU + 0.05, -13.95, 2.9], [hwU - 0.05, -13.95, 2.9], [hwU - 0.05, 13.95, 2.9], [-hwU + 0.05, 13.95, 2.9]]] });
      mag.add(xform(ring, { rot: [-ang, 0, 0], move: [s0, t0, 0] }), L.trim2);
      for (const sd of [1, -1]) {
        mag.add(xform(lax([[0, 0], [0, 2.4], [1.2, 2.4], [1.6, 2.0], [1.6, 0]], [0, 0, 15.3 * sd], sideAx(sd), 14), { rot: [-ang, 0, 0], move: [s0, t0, 0] }), L.trim2);
        mag.add(xform(capScrew([0, 0, 16.9 * sd], 1.2, sideAx(sd), 0.5), { rot: [-ang, 0, 0], move: [s0, t0, 0] }), DARK);
      }
    }
    // latch: a gold lever on a pin at the front spine, its hook over the feed collar
    {
      const u = 0.17, s0 = sc(u) + hwm(u) + 2.2, t0 = tt(u);
      mag.add(PF([[s0 - 1.2, t0 - 6, 1], [s0 + 2.6, t0 - 4, 1], [s0 + 3.0, t0 + 9, 1], [s0 + 0.8, t0 + 11.5, 0.6], [s0 - 1.6, t0 + 10.8, 0.6], [s0 + 0.6, t0 + 8.6, 0.8], [s0 + 0.4, t0 - 2, 1]], { w: 5, bevel: 0.6, bevelSeg: 1 }), L.trim);
      mag.add(lax([[0, 0], [0, 1.2], [7.4, 1.2], [7.4, 0]], [s0 + 0.8, t0 + 1, -3.7], 'w', 12), DARK);
    }
    // feed collar (dark) + gold band + 4 screws, contact rail on top (all inside the well)
    mag.add(SC([[-15, MT - 2, 2], [15, MT - 2, 2], [15, MT + 6, 2], [-15, MT + 6, 2]], MS - 24, MS + 24, { bevel: 1 }), DARK);
    mag.add(SC([[-14.6, MT - 10, 2], [14.6, MT - 10, 2], [14.6, MT - 2, 1], [-14.6, MT - 2, 1]], MS - 25, MS + 25, { bevel: 0.8 }), L.trim);
    for (const sd of [1, -1]) for (const s of [MS - 18, MS + 18]) mag.add(capScrew([s, MT - 6, 14.9 * sd], 1.4, sideAx(sd), 0.6), DARK);
    mag.add(SC([[-6, MT + 6, 1], [6, MT + 6, 1], [5, MT + 14, 1], [-5, MT + 14, 1]], MS - 16, MS + 16, { bevel: 0.5 }), 'steel_bright');
    // side gate on the left of the well: hinged on its bottom edge, swings down / out to free the cell
    const gate = g.part('fx_cover', { pivot: [MS, -66, -21.6], extras: { open: -100, hinge: 's', note: 'magazine gate (left): open 1 = swung 100° down / out' } });
    gate.add(PF([[MS - 36, -66, 2], [MS + 36, -66, 2], [MS + 36, -42, 4], [MS - 36, -42, 4]], { w: 2.2, cw: -22.4, bevel: 0.6,
      holes: [[[MS - 22, -62, 3], [MS + 22, -62, 3], [MS + 22, -48, 3], [MS - 22, -48, 3]]] }), DARK);
    gate.add(PF([[MS - 22.6, -62.6, 3], [MS + 22.6, -62.6, 3], [MS + 22.6, -47.4, 3], [MS - 22.6, -47.4, 3]], { w: 0.8, cw: -22.2, bevel: 0.2 }), 'glass_clear');
    gate.add(sweep(rectLoop([MS - 23.4, -63.4], [MS + 23.4, -46.6]).map(([s, t]) => [s, t, -23.6]), 0.55, { seg: 40, radial: 4, closed: true }), TRIM);
    gate.add(box([MS + 33, -54, -24.2], [5, 10, 3.4], { r: 1.2 }), TRIM);
    gate.add(cyl(MS - 37, MS + 37, 1.8, { t: -66, w: -21.6, seg: 10 }), TRIM);
    for (const s of [MS - 30, MS + 26]) for (const t of [-60, -48]) gate.add(domeRivet([s, t, -23.5], 0.9, '-w', 0.6, 8), TRIM);
    g.socket('magwell', [MS, -96, 0]);
  }

  // ======================================================================== sockets & meta
  g.socket('muzzle', [866, 0, 0]);
  g.socket('crest', [1022, 0, 0]);                 // 冠羽扇 fan centre, 60 mm past the beak tip
  g.socket('beak', [958, 2, 0]);
  g.socket('grip_r', [293, -86, 0], { rot: [0, 0, -20] });
  g.socket('sight_rear', [266, SIGHT, 0]);
  g.socket('sight_front', [796, SIGHT, 0]);
  {
    const F = axisFrame(VA, VB);
    for (const sd of [1, -1]) {
      const k = sd > 0 ? 'r' : 'l';
      g.socket('vein0_' + k, [...F.P(0.0, 0), (FLANK + 1.4) * sd]);
      g.socket('vein1_' + k, [...F.P(0.95, 0), (FLANK + 1.4) * sd]);
    }
  }
  g.socket('back', [300, 40, 0]);                  // ready motes / cocoon centre
  g.meta({
    grip: 'heavy', support: 'vertical', reload: 'mag', variant: L.id,
    notes: 'Crane-form scatter cannon. fx_wingRootL/R: wing bones on ball joints, extras open/hinge (compound axis, open 1 = spread); '
      + 'cards spawn at runtime at S_wingL/R (open pose; extras.rest = folded pose). fx_beak: lower jaw (open -12 about w). '
      + 'fx_cover: magazine gate (left). fx_pearl (畢方) or fx_eye + fx_eyes (鬼車): the focus. Cloisonné enamel = glaze_* row keys (geometry cells, no SHARD).',
  });
  // bake: every mesh pre-tessellated to 12 mm with up to 14 split rounds (no long earcut / CSG slivers left to smear
  // the per-vertex AO), a short AO reach (contact shadows within ~2 cm), then m4's post-bake: buried vertices under
  // plates refilled from their visible neighbours, wear rescaled per material, flat faces kept unworn
  const build = g.build.bind(g);
  g.build = (o = {}) => {
    const root = build({ ...o, bake: false });
    if (o.bake !== false) {
      const meshes = [];
      root.traverse((m) => { if (m.isMesh) meshes.push(m); });
      const tess = (o.tessellate ?? TESS) * 0.001;
      for (const m of meshes) {
        let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
        // glossy dielectrics show AO smudges most: the fine grid; metal, enamel and glass read fine on a coarser one
        m.geometry = tessellateFat(geo, /^(porcelain|lacquer_|leather|rubber)/.test(m.userData.mat) ? tess : tess * TESS_K, 0.0016);
      }
      if (o.tessOnly) return root;                       // (dev: triangle budget without the bake)
      // the big glazed / leather / steel surfaces ignore low relief (inlays, wires, cloisonné plates, scallops up to
      // 3 mm): on their 12 mm vertex grid a contact shadow only smears into dark wedges round every plate
      const relief = (m) => (/^(porcelain|lacquer_|leather|rubber)/.test(m.userData.mat) ? 0.003 : /^steel/.test(m.userData.mat) ? 0.002 : 0);
      bakeMeshes(meshes, { tessellate: 0, aoDist: 0.018, rays: 32, log: true, minHeight: relief });          // already tessellated above
      postBake(root, {}, WEAR);
    }
    return root;
  };
  return g;
}

// bake grid (mm): glossy dielectrics / everything else x TESS_K. 12 / 1.75 put the twin over the 160k / 5 MB
// budget (194k / 6.3 MB); the lofted shells are already dense along s, the grid only splits their long flats
const TESS = 26, TESS_K = 2.4;
/** per-material wear [curvature (1/m) mapped to full wear, cap]: glossy glaze barely chips, gold rubs on its edges */
const WEAR = {
  '*:porcelain': [1 / 700, 0.45], '*:lacquer_black': [1 / 700, 0.45], '*:lacquer_red': [1 / 700, 0.4], '*:gold': [1 / 450, 0.7], '*:silver_aged': [1 / 450, 0.7],
  '*:bronze_aged': [1 / 450, 0.7], '*:steel_dark': [1 / 1000, 0.6], '*:steel': [1 / 800, 0.7], '*:steel_bright': [1 / 500, 0.8], '*:black_chrome': [1 / 900, 0.5],
  '*:glaze_teal': [0, 0], '*:glaze_turquoise': [0, 0], '*:glaze_vermilion': [0, 0], '*:glaze_inkteal': [0, 0], '*:glaze_coldteal': [0, 0], '*:glaze_aubergine': [0, 0],
  '*:glaze_cobalt': [0, 0], '*:glaze_black': [0, 0], '*:rubber': [1 / 450, 0.5],
};

/** briolette: rings [z, r] (bottom pole -> flame tip) of n facets, alternate rings turned half a facet (triangular facets) */
function briolette(c, rows, n = 12) {
  const P = [], I = [];
  rows.forEach(([z, r], k) => {
    for (let i = 0; i < n; i++) {
      const a = ((i + (k % 2) * 0.5) / n) * Math.PI * 2;
      P.push(c[0] + Math.cos(a) * r, c[1] + z, c[2] + Math.sin(a) * r);
    }
  });
  for (let k = 0; k + 1 < rows.length; k++) for (let i = 0; i < n; i++) {
    const a = k * n + i, b = k * n + (i + 1) % n, c2 = (k + 1) * n + i, d = (k + 1) * n + (i + 1) % n;
    if (k % 2 === 0) I.push(a, c2, b, b, c2, d); else I.push(a, c2, d, a, d, b);
  }
  return mesh(P, I, { crease: 1, closed: true });
}
/**
 * slit-pupil eye: a crystal ball (iris, lit by pv_crystal), a dark lens-shaped slit pupil skin on the side it looks
 * at (`look` = [s, t] direction), almond lids (two arcs of wire) round the opening when `lid` is given.
 */
function slitEye(c, R, look, lid, pupil, iris) {
  const out = [[sphere(c, R, { seg: R > 4 ? 28 : 10 }), iris]];          // the small eyes: 10 segments (pv_crystal facets them anyway)
  const d = V(look[0], look[1], 0).normalize(), side = new THREE.Vector3(1, 0, 0), up = new THREE.Vector3().crossVectors(d, side).normalize();
  const C = V(...c);
  const onBall = (al, be, r) => C.clone().addScaledVector(d.clone().multiplyScalar(Math.cos(al)).addScaledVector(up, Math.sin(al)).multiplyScalar(Math.cos(be)).addScaledVector(side, Math.sin(be)), r);
  // pupil skin: alpha along the slit (in the look / up plane), beta across it (towards w); lens-shaped width
  const P = [], I = [], NA = R > 4 ? 12 : 8, NB = R > 4 ? 4 : 2;
  for (let i = 0; i <= NA; i++) for (let j = 0; j <= NB; j++) {
    const al = (-0.66 + 1.32 * i / NA), wdt = 0.26 * Math.cos((i / NA - 0.5) * Math.PI) + 0.03, be = (-1 + 2 * j / NB) * wdt;
    const v = onBall(al, be, R * 1.012);
    P.push(-v.z, v.y, v.x);
  }
  for (let i = 0; i < NA; i++) for (let j = 0; j < NB; j++) { const a = i * (NB + 1) + j, b = a + 1, e = a + NB + 1, f = e + 1; I.push(a, e, b, b, e, f); }
  // wind outward: check the first triangle against the ball normal
  const tri = [0, 1, 2].map((k) => V(P[I[k] * 3], P[I[k] * 3 + 1], P[I[k] * 3 + 2]));
  const n = tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0]));
  if (n.dot(tri[0].clone().sub(C)) < 0) for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
  out.push([mesh(P, I, { closed: false, crease: 60 }), pupil]);
  if (lid) {
    const arcs = [];
    for (const q of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= 14; i++) { const al = -1.0 + 2.0 * i / 14, be = q * 0.62 * Math.cos((i / 14 - 0.5) * Math.PI) ** 0.8; const v = onBall(al, be, R * 1.06); pts.push([-v.z, v.y, v.x]); }
      arcs.push(sweep(pts, R * 0.11, { seg: R > 4 ? 22 : 9, radial: R > 4 ? 6 : 3 }));
    }
    out.push([merge(arcs), lid]);
  }
  return out;
}
/**
 * pupil skin on an eyeball (centre c [s,t,w], radius R): a lens / disc patch 1.2 % proud of the ball round the three
 * direction `dir`, aLen radians long along `up` (orthogonalised), aWid radians half-wide at its middle
 */
function pupilSkin(c, R, dir, up, aLen, aWid, NA = 10, NB = 4) {
  const d = dir.clone().normalize(), u = up.clone().addScaledVector(d, -up.dot(d)).normalize(), side = new THREE.Vector3().crossVectors(d, u);
  const C = V(...c), P = [], I = [];
  for (let i = 0; i <= NA; i++) for (let j = 0; j <= NB; j++) {
    const al = -aLen + 2 * aLen * i / NA, wdt = aWid * Math.sqrt(Math.max(0, 1 - (al / aLen) ** 2)) + 0.015, be = (-1 + 2 * j / NB) * wdt;
    const v = C.clone().addScaledVector(d.clone().multiplyScalar(Math.cos(al)).addScaledVector(u, Math.sin(al)).multiplyScalar(Math.cos(be)).addScaledVector(side, Math.sin(be)), R * 1.012);
    P.push(-v.z, v.y, v.x);
  }
  for (let i = 0; i < NA; i++) for (let j = 0; j < NB; j++) { const a = i * (NB + 1) + j, b = a + 1, e = a + NB + 1, f = e + 1; I.push(a, e, b, b, e, f); }
  const tri = [0, 1, 2].map((k) => V(P[I[k] * 3], P[I[k] * 3 + 1], P[I[k] * 3 + 2]));
  const n = tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0]));
  if (n.dot(tri[0].clone().sub(C)) < 0) for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
  return mesh(P, I, { closed: false, crease: 60 });
}
/** underglaze scroll band: a flat running wave (flush inlay) with a curl at every crest, baseline t0 (number or fn of s) */
function scrollBand(s0, s1, t0, w0, sd, { step = 16, amp = 1.3, wd = 0.75, r: rc = 2.3 } = {}) {
  const base = typeof t0 === 'function' ? t0 : () => t0;
  const n = Math.max(1, Math.round((s1 - s0) / step)), parts = [], wave = [];
  for (let i = 0; i <= n * 7; i++) { const s = s0 + (s1 - s0) * i / (n * 7); wave.push([s, base(s) + Math.sin((s - s0) / step * Math.PI * 2) * amp]); }
  parts.push(inlayLine(wave, w0, sd, wd, 0.06));
  for (let k = 0; k < n; k++) {
    const upc = k % 2 === 0, s = s0 + (k + (upc ? 0.25 : 0.75)) * step, tc = base(s) + (upc ? amp : -amp), r = rc;
    const c = [s, tc + (upc ? r : -r)];
    const pts = scrollPts(c, r, upc ? 270 : 90, 0.8, upc ? 1 : -1, 0, 7, 0.55).map(([a, b]) => [a, b]);
    parts.push(inlayLine(pts, w0, sd, wd * 0.85, 0.06));
  }
  return merge(parts);
}
/** dark fill in the engraved serial's grooves (the V-groove floors read black, like a blackened roll mark) */
function engraveFill(str, sc, tc, h, w0, sd, wd = 0.16, proud = -0.13) {
  const k = h / 6, adv = 5.4 * k, out = [];
  const width = str.length * adv - 1.4 * k;
  let x = -width / 2;
  for (const ch of str) {
    for (const line of FONT[ch] || []) for (let i = 0; i + 1 < line.length; i++) {
      const P = (p) => [sc + sd * (x + p[0] * k), tc - h / 2 + p[1] * k];
      out.push(strip(P(line[i]), P(line[i + 1]), w0 + sd * (proud - 0.04), wd, 0.08));
    }
    x += adv;
  }
  return merge(out);
}

export default function build() { return buildPyrewing('bifang'); }
