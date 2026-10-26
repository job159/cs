// 蒲牢．鐘吼 presentation pieces that are geometry rather than particles (premium/pulao.js drives them):
//   bellSpirit({ dragon })  the summoned bronze bell (§1.7.3 ④, ghost shader of fx/summons.js): a 朝鐘 temple-bell profile
//                           (domed crown, slightly tapering waist, a flared 八波 lip of eight waves), three raised bands, four
//                           乳釘 boss panels, a belt of cloud scrolls painted in the glaze (aTint), and, with dragon = true,
//                           the 蒲牢 knob: a dragon arched over the crown with its feet on it, its head raised (own mesh,
//                           so it can roar). One unit = the bell's height (lip at y 0, crown at y 1); it faces -z.
//                           ~2.6k triangles with the dragon, ~1.7k without (§1.7.3 <= 3k)
//   bellParts(h)            after ghost(): the dragon head mesh pair, setRoar(a) lifts it (rad)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// glaze tints (linear, the ghost shader's body colours; weight < 1 lets the inner light show through)
const GOLD = [1.0, 0.62, 0.16, 0.9], GOLD2 = [0.95, 0.6, 0.2, 0.45], VERD = [0.05, 0.16, 0.12, 0.9];
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
    const arch = [[0.17, 0.99, 0.02], [0.13, 1.08, -0.02], [0.05, 1.14, 0.03], [-0.04, 1.13, -0.02], [-0.11, 1.07, 0.02], [-0.15, 1.0, 0]];
    const body2 = tube(arch, (u) => 0.035 * (0.75 + 0.45 * Math.sin(Math.PI * u)), { seg: 18, radial: 8 });
    const legs = [];
    for (const [x, z] of [[0.12, 0.05], [0.12, -0.05], [-0.1, 0.05], [-0.1, -0.05]]) legs.push(tube([[x * 0.95, 1.06, z * 0.4], [x * 1.05, 1.02, z], [x * 1.1, 0.985, z * 1.3]], 0.016, { seg: 4, radial: 5 }));
    // dorsal flames along the arch
    const fins = [];
    for (let i = 1; i < 6; i++) {
      const u = i / 6, c = new THREE.CatmullRomCurve3(arch.map((p) => new THREE.Vector3(...p))).getPointAt(u);
      const f = new THREE.ConeGeometry(0.014, 0.06, 4).translate(0, 0.03, 0);
      f.rotateZ((u - 0.5) * 1.6);
      f.translate(c.x, c.y + 0.03, c.z);
      fins.push(nz(f));
    }
    const tail = tube([[-0.15, 1.0, 0], [-0.2, 1.05, 0.03], [-0.22, 1.12, 0], [-0.18, 1.15, -0.02]], (u) => 0.02 * (1 - u * 0.8), { seg: 8, radial: 6 });
    parts.push(glaze(mergeGeometries([nz(body2), ...legs.map(nz), nz(tail)]), [0.62, 0.38, 0.12, 0.92]), glaze(mergeGeometries(fins), GOLD));
    // head: skull, snout, open jaw, two antlers, gilt eyes; pivot at the neck (0.17, 0.99)
    const hp = [];
    hp.push(nz(new THREE.SphereGeometry(0.05, 10, 8).scale(1.1, 0.85, 0.9).translate(0.04, 0.035, 0)));
    hp.push(nz(new THREE.SphereGeometry(0.035, 8, 6).scale(1.6, 0.7, 0.8).translate(0.1, 0.028, 0)));
    hp.push(nz(new THREE.SphereGeometry(0.03, 8, 6).scale(1.5, 0.45, 0.7).rotateZ(-0.45).translate(0.09, -0.012, 0)));
    for (const s of [-1, 1]) hp.push(nz(tube([[0.02, 0.07, s * 0.025], [-0.02, 0.12, s * 0.05], [-0.07, 0.15, s * 0.055]], (u) => 0.012 * (1 - u * 0.75), { seg: 6, radial: 5 })));
    const eyes = [];
    for (const s of [-1, 1]) eyes.push(nz(new THREE.SphereGeometry(0.012, 6, 4).translate(0.075, 0.055, s * 0.035)));
    const hg = mergeGeometries([glaze(mergeGeometries(hp), [0.62, 0.38, 0.12, 0.92]), glaze(mergeGeometries(eyes), [1.6, 1.2, 0.4, 1])]);
    head = new THREE.Mesh(hg);
    head.position.set(0.17, 0.99, 0);
    ud.headGeo = hg; ud.neck = head.position.clone();
  }
  const KN = new THREE.Matrix4().makeTranslation(0, 0.97, 0).multiply(new THREE.Matrix4().makeScale(1.7, 1.7, 1.7)).multiply(new THREE.Matrix4().makeTranslation(0, -0.97, 0));
  if (dragon) for (let i = 2; i < parts.length; i++) parts[i] = parts[i].applyMatrix4(KN);
  if (head) { head.position.applyMatrix4(KN); head.scale.setScalar(1.7); ud.neck = head.position.clone(); }
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
    setRoar(a) { _m.makeTranslation(ud.neck.x, ud.neck.y, ud.neck.z).multiply(_r.makeRotationZ(a)).multiply(_s.makeScale(1.7, 1.7, 1.7)); for (const o of heads) o.matrix.copy(_m); },
  };
}
