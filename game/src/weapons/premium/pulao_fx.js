// 蒲牢．鐘吼 presentation pieces that are geometry rather than particles (premium/pulao.js drives them):
//   bellSpirit({ dragon })  the summoned bronze bell (§1.7.3 ④, ghost shader of fx/summons.js): a 朝鐘 temple-bell profile
//                           (domed crown, slightly tapering waist, a flared 八波 lip of eight waves), three raised bands, four
//                           乳釘 boss panels, a belt of cloud scrolls painted in the glaze (aTint), and, with dragon = true,
//                           the 蒲牢 knob: a dragon arched over the crown with its feet on it, its head raised (own mesh,
//                           so it can roar). One unit = the bell's height (lip at y 0, crown at y 1); it faces -z.
//                           ~3k triangles with the dragon, ~1.7k without (§1.7.3 <= 3k). The glaze is aged cast bronze:
//                           gilt only on the lip, the bands and the bosses; the cloud belt is cast relief (dark lines,
//                           verdigris in the recesses), never a pale porcelain body.
//   bellParts(h)            after ghost(): the dragon head mesh pair, setRoar(a) lifts it (rad)
//   bellChunks()            百八鐘 ⑤: the bell body pre-cut along jagged break lines into 16 cast slabs (6 + 6 + 4), each
//                           centred on its centroid: a lit bronze face (vertex-coloured: gilt bands, verdigris) and the
//                           broken edge walls as a second group (hot gilt that cools); ~2.9k triangles in all
//   soundDome()             警世: a translucent bronze sound-wave dome (horizontal wave bands climbing it), additive;
//                           scale it from the caster's feet, set uniforms.uT (0..1) / uA
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// glaze tints (linear, the ghost shader's body colours; weight < 1 lets the inner light show through): gilt for the lip,
// bands and bosses; the cloud relief as dark cast lines and a lighter worn bronze on the curls' crowns
const GOLD = [0.9, 0.56, 0.14, 0.92], GOLD2 = [0.34, 0.21, 0.08, 0.55], VERD = [0.03, 0.09, 0.07, 0.9];
const DRG = [0.44, 0.26, 0.08, 0.92];   // the 蒲牢 knob: cast bronze a value over the bell body, its spines gilt
const TAU = Math.PI * 2;
/** non-indexed, position + normal only (mergeGeometries needs matching attributes) */
const nz = (g) => { const o = g.index ? g.toNonIndexed() : g; if (o.attributes.uv) o.deleteAttribute('uv'); return o; };

/** per-vertex glaze: tint(x, y, z, nx, ny, nz) -> [r, g, b, weight] or a constant (summons.js aTint) */
function glaze(g, tint) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, a = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) a.set(typeof tint === 'function' ? tint(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)) : tint, i * 4);
  g.setAttribute('aTint', new THREE.BufferAttribute(a, 4));
  return g;
}

/** tube along points [x, y, z] (CatmullRom), radius r(u), closed at both ends by the taper */
function tube(pts, r, { seg = 16, radial = 7 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false), p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, c);
    const rr = typeof r === 'function' ? r(i / seg) : r;
    for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(rr).add(c); p.setXYZ(k, v.x, v.y, v.z); }
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

// the bell profile [r, y] lip -> crown; three raised bands
const BANDS = [0.17, 0.56, 0.86];
const PROF = (() => {
  // a temple bell: a flared lip (r 0.46), a waist tapering to 0.31, a rounded shoulder into the crown
  const out = [];
  for (let i = 0; i <= 24; i++) {
    const y = (i / 24) * 0.88, flare = 0.15 * Math.exp(-y / 0.075), base = 0.31 + 0.012 * (0.88 - y) / 0.88 + flare;
    const band = BANDS.reduce((a, b) => a + 0.014 * Math.exp(-(((y - b) / 0.014) ** 4)), 0);
    out.push([base + band, y]);
  }
  for (const [r, y] of [[0.3, 0.915], [0.27, 0.948], [0.21, 0.975], [0.12, 0.993], [0.0, 1.0]]) out.push([r, y]);
  return out;
})();
/** cloud belt (y 0.22..0.52) as glaze: scrolls of gold on bronze, from the angle and height */
function cloudTint(x, y, z) {
  const a = Math.atan2(z, x), b = BANDS.findIndex((v) => Math.abs(y - v) < 0.02);
  if (b >= 0) return GOLD;
  if (y > 0.23 && y < 0.51) {
    // 8 curls round the belt: a spiral of gold in each cell
    const cell = (a / TAU + 0.5) * 8, cx = (cell % 1) - 0.5, cy = (y - 0.37) / 0.13;
    const r = Math.hypot(cx * 1.6, cy), th = Math.atan2(cy, cx * 1.6) + r * 7.5 * ((Math.floor(cell) % 2) * 2 - 1);
    const line = Math.abs(Math.sin(th * 1.0 + r * 3)) < 0.32 && r < 0.95 && r > 0.12;
    return line ? VERD : r < 1.05 && Math.abs(Math.sin(th + r * 3)) < 0.5 ? GOLD2 : [0, 0, 0, 0];
  }
  if (y < 0.035) return GOLD;                        // gilt lip
  if (y > 0.6 && y < 0.82 && Math.abs(Math.sin(a * 2)) < 0.06) return VERD;   // panel seams pick up verdigris
  return [0, 0, 0, 0];
}

const cache = {};
const KS = 1.8;   // the knob drawn large: it is the bell's name
/** the summoned bell (an Object3D of glazed meshes; the head is its own mesh when dragon) */
export function bellSpirit({ dragon = true } = {}) {
  const key = dragon ? 'd' : 'p';
  if (cache[key]) return cache[key];
  const root = new THREE.Group(), ud = root.userData;
  // body: own lathe so the lip can wave (八波: the rim dips between eight lobes)
  const M = 40, pos = [], idx = [];
  PROF.forEach(([r, y], i) => {
    for (let j = 0; j <= M; j++) {
      const a = (j / M) * TAU, lip = i === 0 ? 0.03 * (1 - Math.abs(Math.cos(a * 4))) : i === 1 ? 0.012 * (1 - Math.abs(Math.cos(a * 4))) : 0;
      pos.push(Math.cos(a) * r, y + lip, Math.sin(a) * r);
    }
  });
  for (let i = 0; i < PROF.length - 1; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  let body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setIndex(idx);
  body.computeVertexNormals();
  body = glaze(body, cloudTint);
  // 乳釘 bosses: four panels of 2 x 3 between the upper bands
  const bosses = [];
  for (let p = 0; p < 4; p++) for (let i = 0; i < 2; i++) for (let k = 0; k < 3; k++) {
    const a = (p / 4 + 0.125) * TAU + (i - 0.5) * 0.2, y = 0.62 + k * 0.08, r = 0.316 - 0.02 * (y - 0.6);
    const b = new THREE.IcosahedronGeometry(0.022, 0).scale(1, 1, 0.7);
    b.lookAt(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    b.translate(Math.cos(a) * r, y, Math.sin(a) * r);
    bosses.push(nz(b));
  }
  const parts = [body, glaze(mergeGeometries(bosses), GOLD)];
  // the crown loop: the 蒲牢 arched over it (body, legs, tail tuft); the head separate
  let head = null;
  if (dragon) {
    // the 蒲牢 knob, read side-on from the caster: a low arched back over the crown, four clawed legs gripping it, a tail
    // curling up into a flame tuft, the neck rising at the front to a raised head (own mesh: it roars) with an open jaw,
    // swept-back horns, a mane and whiskers
    const spine = [[-0.16, 1.0, 0], [-0.12, 1.09, 0.02], [-0.04, 1.15, -0.02], [0.05, 1.13, 0.02], [0.12, 1.07, 0], [0.175, 1.1, 0], [0.2, 1.16, 0]];
    const body2 = tube(spine, (u) => (u < 0.55 ? 0.02 + 0.05 * Math.sin(Math.PI * Math.min(1, u / 0.55) * 0.5 + 0.5) : 0.044 - 0.016 * (u - 0.55) / 0.45), { seg: 22, radial: 9 });
    const legs = [];
    for (const [x, z] of [[0.11, 0.055], [0.11, -0.055], [-0.11, 0.055], [-0.11, -0.055]]) {
      legs.push(tube([[x * 0.92, 1.08, z * 0.35], [x * 1.12, 1.03, z * 0.9], [x * 1.05, 0.99, z * 1.25]], (u) => 0.022 - 0.008 * u, { seg: 5, radial: 6 }));
      for (const c of [-1, 0, 1]) { const cl = new THREE.ConeGeometry(0.008, 0.035, 4).rotateZ(-Math.PI / 2 * Math.sign(x)).translate(x * 1.05 + Math.sign(x) * 0.02, 0.985, z * 1.25 + c * 0.012); legs.push(nz(cl)); }
    }
    const tail = tube([[-0.16, 1.0, 0], [-0.22, 1.04, 0.02], [-0.25, 1.12, 0], [-0.21, 1.18, -0.02]], (u) => 0.022 * (1 - u * 0.7), { seg: 10, radial: 6 });
    // flames: dorsal spines along the back, the tail tuft
    const fins = [];
    const sc = new THREE.CatmullRomCurve3(spine.map((p) => new THREE.Vector3(...p)));
    for (let i = 1; i < 7; i++) {
      const u = 0.08 + i * 0.09, c = sc.getPointAt(u);
      const f = new THREE.ConeGeometry(0.016, 0.075, 4).translate(0, 0.037, 0);
      f.rotateZ(0.5 + (u - 0.4) * 0.8);
      f.translate(c.x, c.y + 0.03, c.z);
      fins.push(nz(f));
    }
    for (const [r, z] of [[0.3, 0], [0.9, 0.02], [-0.3, -0.02]]) fins.push(nz(new THREE.ConeGeometry(0.016, 0.08, 4).translate(0, 0.04, 0).rotateZ(r).translate(-0.21, 1.17, z)));
    parts.push(glaze(mergeGeometries([nz(body2), ...legs.map(nz), nz(tail)]), DRG), glaze(mergeGeometries(fins), GOLD));
    // head (pivot at the top of the neck): skull, a long snout with a curled lip, the lower jaw open, horns, mane, whiskers
    const hp = [];
    hp.push(nz(new THREE.SphereGeometry(0.056, 12, 8).scale(1.2, 0.85, 0.9).translate(0.035, 0.02, 0)));
    hp.push(nz(new THREE.SphereGeometry(0.04, 10, 6).scale(1.75, 0.62, 0.78).translate(0.115, 0.005, 0)));
    hp.push(nz(new THREE.SphereGeometry(0.02, 8, 5).scale(1.2, 1.0, 1.4).translate(0.175, 0.022, 0)));                 // 如意 nose pad
    hp.push(nz(new THREE.SphereGeometry(0.034, 8, 6).scale(1.75, 0.42, 0.7).rotateZ(-0.55).translate(0.095, -0.05, 0))); // the open jaw
    for (const sd of [-1, 1]) {
      hp.push(nz(tube([[0.01, 0.06, sd * 0.025], [-0.04, 0.12, sd * 0.05], [-0.1, 0.16, sd * 0.065], [-0.14, 0.15, sd * 0.07]], (u) => 0.015 * (1 - u * 0.8), { seg: 8, radial: 5 })));   // horn
      hp.push(nz(tube([[0.17, 0.0, sd * 0.02], [0.22, -0.02, sd * 0.05], [0.25, -0.07, sd * 0.06]], (u) => 0.005 * (1 - u * 0.7), { seg: 5, radial: 4 })));                      // whisker
      for (let m = 0; m < 3; m++) hp.push(nz(new THREE.ConeGeometry(0.014, 0.07, 4).translate(0, 0.035, 0).rotateZ(1.9 + m * 0.35).translate(-0.01, 0.03 - m * 0.02, sd * 0.035)));   // mane
      for (let t = 0; t < 3; t++) hp.push(nz(new THREE.ConeGeometry(0.005, 0.02, 3).rotateZ(Math.PI).translate(0.08 + t * 0.03, -0.012, sd * 0.022)));   // fangs
    }
    const eyes = [];
    for (const s2 of [-1, 1]) eyes.push(nz(new THREE.SphereGeometry(0.013, 6, 4).translate(0.075, 0.04, s2 * 0.038)));
    const hg = mergeGeometries([glaze(mergeGeometries(hp), DRG), glaze(mergeGeometries(eyes), [1.6, 1.2, 0.4, 1])]);
    head = new THREE.Mesh(hg);
    head.position.set(0.2, 1.16, 0);
    ud.headGeo = hg; ud.neck = head.position.clone();
  }
  const KN = new THREE.Matrix4().makeTranslation(0, 0.97, 0).multiply(new THREE.Matrix4().makeScale(KS, KS, KS)).multiply(new THREE.Matrix4().makeTranslation(0, -0.97, 0));
  if (dragon) for (let i = 2; i < parts.length; i++) parts[i] = parts[i].applyMatrix4(KN);
  if (head) { head.position.applyMatrix4(KN); head.scale.setScalar(KS); ud.neck = head.position.clone(); }
  const g = mergeGeometries(parts.map((x) => (x.index ? x.toNonIndexed() : x)));
  g.computeBoundingBox();
  root.add(new THREE.Mesh(g));
  if (head) root.add(head);
  root.rotation.y = 0;
  cache[key] = root;
  return root;
}

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _s = new THREE.Matrix4();
/** after ghost({ mesh: bellSpirit() }): the head mesh pair of the handle; setRoar(a) lifts the head (rad) */
export function bellParts(h) {
  const sp = bellSpirit({ dragon: true }), ud = sp.userData, heads = [];
  h.obj.traverse((o) => { if (o.isMesh && o.geometry === ud.headGeo) heads.push(o); });
  return {
    setRoar(a) { _m.makeTranslation(ud.neck.x, ud.neck.y, ud.neck.z).multiply(_r.makeRotationZ(a)).multiply(_s.makeScale(KS, KS, KS)); for (const o of heads) o.matrix.copy(_m); },
  };
}

// ------------------------------------------------------------------------------------------ 百八鐘 ⑤ debris
/** outer radius and its slope at height y (the bell profile, unit space) */
function profAt(y) {
  y = Math.min(1, Math.max(0, y));
  let i = 0;
  while (i < PROF.length - 2 && PROF[i + 1][1] < y) i++;
  const [r0, y0] = PROF[i], [r1, y1] = PROF[i + 1], u = (y - y0) / Math.max(1e-6, y1 - y0);
  return [r0 + (r1 - r0) * u, (r1 - r0) / Math.max(1e-6, y1 - y0)];
}
/** a smooth deterministic wiggle (-1..1) for the break lines */
const jag = (k, x) => 0.5 * Math.sin(x * 7.3 + k * 1.7) + 0.3 * Math.sin(x * 13.1 + k * 3.1) + 0.2 * Math.sin(x * 23.7 + k * 5.3);
// albedo (linear): aged bronze, gilt bands / lip, verdigris crust, the dark inside
const C_BZ = [0.2, 0.12, 0.05], C_GOLD = [0.78, 0.52, 0.17], C_VERD = [0.07, 0.14, 0.11], C_IN = [0.05, 0.035, 0.018];
let chunkCache = null;
export function bellChunks() {
  if (chunkCache) return chunkCache;
  const BANDS_Y = [0, 0.31, 0.63, 1.0], NS = [6, 6, 4], OFF = [0, 0.5, 0.25], NU = 7, NV = 6;
  const out = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < NS[j]; i++) {
    const A = (k, y) => ((k + OFF[j]) / NS[j]) * TAU + 0.075 * jag(j * 31 + (k % NS[j]), y * 6);
    const Y = (k, a) => (k === 0 || k === 3 ? BANDS_Y[k] : BANDS_Y[k] + 0.035 * jag(k * 17, a * 3));
    // grid of outer / inner points and their analytic normals
    const O = [], I = [], NO = [];
    for (let v = 0; v <= NV; v++) for (let u = 0; u <= NU; u++) {
      const ab = ((i + OFF[j] + u / NU) / NS[j]) * TAU;
      const y = Y(j, ab) + (Y(j + 1, ab) - Y(j, ab)) * (v / NV);
      const a = A(i, y) + (A(i + 1, y) - A(i, y)) * (u / NU);
      const [r, dr] = profAt(y), nl = Math.hypot(1, dr), nr = 1 / nl, ny = -dr / nl;
      const th = 0.03 + 0.03 * Math.exp(-y / 0.08);
      O.push([Math.cos(a) * r, y, Math.sin(a) * r]);
      I.push([Math.cos(a) * Math.max(0, r - th * nr), y - th * ny, Math.sin(a) * Math.max(0, r - th * nr)]);
      NO.push([Math.cos(a) * nr, ny, Math.sin(a) * nr]);
    }
    const id = (u, v) => v * (NU + 1) + u;
    // centroid (of the outer face)
    const c = [0, 0, 0];
    for (const p of O) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    c[0] /= O.length; c[1] /= O.length; c[2] /= O.length;
    const pos = [], nrm = [], col = [], wpos = [], wnrm = [];
    const colAt = (p) => {
      const y = p[1], a = Math.atan2(p[2], p[0]);
      if (y < 0.035 || BANDS.some((b) => Math.abs(y - b) < 0.02)) return C_GOLD;
      const n = 0.5 + 0.5 * Math.sin(a * 5 + y * 11) * Math.sin(a * 3 - y * 7);
      return n > 0.78 ? C_VERD : C_BZ;
    };
    const tri = (P, N, C, a, b, d) => { for (const k of [a, b, d]) { pos.push(...P[k]); nrm.push(...N[k]); col.push(...C[k]); } };
    const NI = NO.map((n) => [-n[0], -n[1], -n[2]]), CO = O.map(colAt), CI = I.map(() => C_IN);
    for (let v = 0; v < NV; v++) for (let u = 0; u < NU; u++) {
      const a = id(u, v), b = id(u + 1, v), d = id(u, v + 1), e = id(u + 1, v + 1);
      tri(O, NO, CO, a, d, b); tri(O, NO, CO, b, d, e);          // outer (counter-clockwise seen from outside)
      tri(I, NI, CI, a, b, d); tri(I, NI, CI, b, e, d);          // inner
    }
    // broken edge walls round the rim of the slab (flat normals, oriented away from the centroid)
    const rim = [];
    for (let u = 0; u < NU; u++) rim.push(id(u, 0));
    for (let v = 0; v < NV; v++) rim.push(id(NU, v));
    for (let u = NU; u > 0; u--) rim.push(id(u, NV));
    for (let v = NV; v > 0; v--) rim.push(id(0, v));
    const wall = (p, q, r) => {
      const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const m = (p[0] + q[0] + r[0]) / 3 - c[0], m1 = (p[1] + q[1] + r[1]) / 3 - c[1], m2 = (p[2] + q[2] + r[2]) / 3 - c[2];
      let flip = n[0] * m + n[1] * m1 + n[2] * m2 < 0;
      const L = Math.hypot(...n) || 1;
      n = n.map((x) => (flip ? -x : x) / L);
      for (const k of flip ? [p, r, q] : [p, q, r]) { wpos.push(...k); wnrm.push(...n); }
    };
    for (let k = 0; k < rim.length; k++) {
      const a = rim[k], b = rim[(k + 1) % rim.length];
      wall(O[a], O[b], I[b]); wall(O[a], I[b], I[a]);
    }
    const g = new THREE.BufferGeometry();
    const P = new Float32Array([...pos, ...wpos]);
    for (let k = 0; k < P.length; k += 3) { P[k] -= c[0]; P[k + 1] -= c[1]; P[k + 2] -= c[2]; }
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([...nrm, ...wnrm]), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([...col, ...new Array(wpos.length).fill(1)]), 3));
    g.addGroup(0, pos.length / 3, 0);
    g.addGroup(pos.length / 3, wpos.length / 3, 1);
    g.computeBoundingSphere();
    // how big the slab is (unit space) and its band (the crown pieces fly higher)
    let rad = 0;
    for (const p of O) rad = Math.max(rad, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
    out.push({ geo: g, c: new THREE.Vector3(...c), rad, band: j });
  }
  chunkCache = out;
  return out;
}
/** the slab materials: lit cast bronze (vertex colours) and the hot broken edges (their own copy per burst: they cool) */
let bronzeMat = null;
export function chunkMats() {
  bronzeMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.48, envMapIntensity: 1.0, emissive: new THREE.Color(0.06, 0.035, 0.012) });
  const edge = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.0, 0.6) });
  return [bronzeMat, edge];
}

// ------------------------------------------------------------------------------------------ 警世 sound dome
const DOME_VERT = /* glsl */`
varying vec3 vP;
varying vec3 vN;
varying vec3 vV;
void main() {
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const DOME_FRAG = /* glsl */`
uniform float uT, uA;
uniform vec3 uCol, uCol2;
varying vec3 vP;
varying vec3 vN;
varying vec3 vV;
void main() {
  float h = clamp(vP.y, 0.0, 1.0);
  // horizontal sound-wave bands climbing the dome, densest at the ground front
  float w = pow(0.5 + 0.5 * sin(h * 26.0 - uT * 30.0), 5.0);
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  float a = (0.1 + 0.9 * w) * (1.0 - smoothstep(0.1, 0.9, h)) * (0.5 + 0.5 * fres) * uA;
  vec3 c = mix(uCol, uCol2, w * 0.6);
  gl_FragColor = vec4(c * a, a);
}`;
let domeGeo = null;
export function soundDome() {
  domeGeo ||= new THREE.SphereGeometry(1, 48, 10, 0, TAU, 0, Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uT: { value: 0 }, uA: { value: 1 }, uCol: { value: new THREE.Vector3(0.9, 0.55, 0.16) }, uCol2: { value: new THREE.Vector3(1.6, 1.0, 0.3) } },
  });
  const m = new THREE.Mesh(domeGeo, mat);
  m.frustumCulled = false; m.renderOrder = 23;
  return m;
}
