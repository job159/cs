// 螭吻．吞潮 presentation pieces that are geometry rather than particles (premium/chiwen.js drives them):
//   chiwenSpirit()   the 吞潮 summon (§1.7.3 ④): a translucent water-dragon 螭吻 glazed like 交趾陶 rising out of the
//                    vortex -- one smooth S-curved body running up into a heavy head (brow, eyes, upturned snout,
//                    branching horns, flame mane, gill fins, whiskers) whose lower jaw is its own mesh (opens for the
//                    roar, the bite, the spit), and the fish tail breaching behind it (its own mesh: it sways and
//                    slaps). Per-vertex glaze (summons.js aTint): cobalt scale rows down the back, a white water
//                    belly, jade crest / horns / fins, gold whisker tips, rays and eyes. One unit = the spirit's
//                    height (fx.summons.ghost({ mesh, size }) scales it); it faces -z. ~2.9k triangles (§1.7.3 <= 3k).
//   spiritParts(h)   after ghost(): the jaw / tail mesh pairs of the handle, to pose them (setJaw / setTail)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const D = Math.PI / 180;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// glaze palette (linear, the ghost shader's body colours): weights < 1 keep the water showing through
const COBALT = [0.07, 0.19, 0.7], COBALT2 = [0.12, 0.3, 0.9], WHITE = [0.85, 0.93, 1.0], JADE = [0.1, 0.55, 0.26], GOLD = [1.0, 0.68, 0.22];

/** per-vertex glaze: tint(x, y, z, nx, ny, nz) -> [r, g, b, weight] or a constant [r, g, b, weight] */
function glaze(g, tint) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, a = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const t = typeof tint === 'function' ? tint(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)) : tint;
    a.set(t, i * 4);
  }
  g.setAttribute('aTint', new THREE.BufferAttribute(a, 4));
  return g;
}
/** aAnim for the ghost body wave: weight w(x, y, z), along-body z(x, y, z) (aTint kept) */
function anim(g, w, along) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'aTint') g.deleteAttribute(k);
  const p = g.attributes.position, a = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); a[i * 4 + 1] = w(x, y, z); a[i * 4 + 2] = along(x, y, z); }
  g.setAttribute('aAnim', new THREE.BufferAttribute(a, 4));
  return g;
}
/** tube along a curve, radius r(u) (u 0 -> 1 along the curve); closed at the thin end */
function tubeAlong(curve, seg, radial, r) {
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position, n = radial + 1, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, rr = r(u);
    curve.getPointAt(u, c);
    for (let j = 0; j < n; j++) { const k = i * n + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(rr).add(c); p.setXYZ(k, v.x, v.y, v.z); }
  }
  g.computeVertexNormals();
  return g;
}
const ell = (rx, ry, rz, at, ws = 12, hs = 8) => new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz).translate(at.x, at.y, at.z);
/** cone from `a` pointing to `b` */
function spike(a, b, r, seg = 5) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.ConeGeometry(r, L, seg, 1).translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  return g.translate(a.x, a.y, a.z);
}
/** flat fan (fin) in a plane: root at `o`, ribs to the points `tips` (in order), thin */
function fan(o, tips) {
  const pos = [];
  for (let i = 1; i < tips.length; i++) pos.push(o.x, o.y, o.z, tips[i - 1].x, tips[i - 1].y, tips[i - 1].z, tips[i].x, tips[i].y, tips[i].z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

let _spirit = null;
/** The 螭吻 spirit (cached; the ghost re-skins it, so one copy serves every cast). */
export function chiwenSpirit() {
  if (_spirit) return _spirit;
  const root = new THREE.Group();
  root.name = 'chiwen_spirit';
  // ---- body: out of the water (y < 0) up through one smooth S into the back of the skull, leaning towards the
  // caster (-z). The tube runs on into the cranium (no bead of a neck joint), its radius easing into the head's
  const H = V(0, 0.79, -0.15);
  const curve = new THREE.CatmullRomCurve3([V(0, 0.775, -0.13), V(0, 0.7, -0.075), V(0.02, 0.58, -0.01), V(0.035, 0.44, 0.07), V(0.01, 0.3, 0.11), V(-0.04, 0.16, 0.06), V(-0.01, 0.02, 0.0), V(0, -0.12, -0.02)], false, 'centripetal');
  const bodyR = (u) => (u < 0.08 ? 0.072 + 0.01 * (1 - u / 0.08) : 0.05 + 0.028 * Math.sin(Math.min(1, (u - 0.04) * 1.6) * Math.PI * 0.5));
  const along = (x, y) => Math.max(0, Math.min(1, 1 - (y + 0.12) / 0.82));
  const sway = (x, y) => Math.max(0, Math.min(1, (y - 0.02) / 0.68)) * 0.9;
  // cobalt scale rows (alternating shade bands) over the back and the flanks, a white water belly stripe down the
  // front (the side the caster faces)
  const bodyTint = (x, y, z, nx, ny, nz) => {
    const back = sstep(-0.95, -0.6, nz), row = Math.floor((0.8 - y) * 34) % 2;
    const c = mixc(WHITE, row ? COBALT : COBALT2, back);
    return [...c, 0.55 + 0.33 * back];
  };
  const parts = [anim(glaze(tubeAlong(curve, 46, 14, bodyR), bodyTint), sway, along)];
  // dorsal crest: jade flame spikes along the back (+z side of the S), gold tipped
  for (let i = 0; i < 11; i++) {
    const u = 0.1 + i * 0.072, P = curve.getPointAt(u), T = curve.getTangentAt(u);
    const back = new THREE.Vector3(0, 0, 1).addScaledVector(T, -T.z).normalize();
    const r = bodyR(u), base = P.clone().addScaledVector(back, r * 0.8), tip = P.clone().addScaledVector(back, r + 0.06 * (1 - u * 0.5)).addScaledVector(T, 0.035);
    const L = tip.distanceTo(base);
    parts.push(anim(glaze(spike(base, tip, 0.016 * (1 - u * 0.4), 4), (x, y, z) => { const k = new THREE.Vector3(x, y, z).distanceTo(base) / L; return [...mixc(JADE, GOLD, sstep(0.6, 0.95, k)), 0.92]; }), sway, along));
  }
  // jade side fins at the shoulders
  for (const s of [-1, 1]) {
    const o = V(s * 0.06, 0.52, 0.0);
    parts.push(anim(glaze(fan(o, [V(s * 0.13, 0.56, 0.04), V(s * 0.2, 0.5, 0.09), V(s * 0.19, 0.43, 0.1), V(s * 0.12, 0.44, 0.06)]), [...JADE, 0.85]), sway, along));
  }
  const body = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial());
  body.name = 'body';
  root.add(body);

  // ---- head, authored nose -z then pitched 22° down at the neck top
  const tilt = new THREE.Matrix4().makeTranslation(H.x, H.y, H.z).multiply(new THREE.Matrix4().makeRotationX(-22 * D));
  const hp = [];
  const L = (g, t) => { hp.push(glaze(g, t)); return g; };
  // white face, cobalt crown and brow plates (the glaze runs over the top of the head)
  const crown = (x, y, z, nx, ny) => [...mixc(WHITE, COBALT, sstep(0.25, 0.75, ny)), 0.6 + 0.3 * sstep(0.25, 0.75, ny)];
  L(ell(0.115, 0.1, 0.13, V(0, 0.015, 0.02), 14, 9), crown);                     // cranium
  L(ell(0.085, 0.052, 0.15, V(0, -0.01, -0.13), 12, 6), crown);                  // upper jaw / snout
  L(ell(0.07, 0.05, 0.055, V(0, 0.022, -0.235), 10, 7), crown);                  // nose bulb (upturned)
  for (const s of [-1, 1]) {
    L(ell(0.04, 0.012, 0.06, V(s * 0.05, 0.088, -0.03), 8, 4), crown);                  // low brow ridge (no goggle bulge)
    L(ell(0.017, 0.015, 0.012, V(s * 0.078, 0.052, -0.06), 8, 6), [...GOLD, 1]);        // eye (set in, gold)
    L(ell(0.03, 0.018, 0.03, V(s * 0.05, 0.05, -0.245), 6, 4), [...WHITE, 0.6]);         // nostril flare
    // branching jade horns: back and up, a forward tine, curling tips
    const horn = new THREE.CatmullRomCurve3([V(s * 0.045, 0.085, 0.03), V(s * 0.07, 0.15, 0.1), V(s * 0.1, 0.2, 0.2), V(s * 0.115, 0.215, 0.29), V(s * 0.11, 0.19, 0.33)]);
    L(tubeAlong(horn, 10, 5, (u) => 0.024 * (1 - u * 0.75)), [...JADE, 0.95]);
    const tine = new THREE.CatmullRomCurve3([V(s * 0.08, 0.17, 0.14), V(s * 0.1, 0.25, 0.12), V(s * 0.1, 0.29, 0.09)]);
    L(tubeAlong(tine, 8, 5, (u) => 0.013 * (1 - u * 0.8)), [...JADE, 0.95]);
    // long whiskers from the snout sides, trailing back and down: white roots, gold tips
    const wh = new THREE.CatmullRomCurve3([V(s * 0.06, 0.0, -0.2), V(s * 0.14, -0.03, -0.17), V(s * 0.22, -0.02, -0.06), V(s * 0.27, -0.07, 0.06), V(s * 0.25, -0.12, 0.14)]);
    L(tubeAlong(wh, 12, 4, (u) => 0.0075 * (1 - u * 0.7)), (x) => [...mixc(WHITE, GOLD, sstep(0.12, 0.24, Math.abs(x))), 0.95]);
    // gill fin fanning back off the cheek (cobalt)
    L(fan(V(s * 0.095, -0.0, 0.06), [V(s * 0.12, 0.09, 0.14), V(s * 0.17, 0.05, 0.2), V(s * 0.18, -0.02, 0.19), V(s * 0.15, -0.07, 0.13), V(s * 0.11, -0.06, 0.08)]), [...COBALT2, 0.85]);
    // upper fangs
    for (const z of [-0.2, -0.13]) L(spike(V(s * 0.055, -0.04, z), V(s * 0.05, -0.085 + (z < -0.15 ? -0.01 : 0), z), 0.011, 4), [...WHITE, 0.7]);
  }
  // flame mane round the back of the skull: cobalt locks streaming back, jade at the tips
  for (let i = 0; i < 9; i++) {
    const a = (-80 + i * 20) * D;
    const o = V(Math.sin(a) * 0.1, 0.04 + Math.cos(a) * 0.08, 0.1);
    L(spike(o, V(Math.sin(a) * 0.19, 0.06 + Math.cos(a) * 0.15, 0.3 + 0.03 * Math.cos(a)), 0.03, 5), (x, y, z) => [...mixc(COBALT, JADE, sstep(0.18, 0.28, z)), 0.88]);
  }
  const headGeo = mergeGeometries(hp);
  headGeo.applyMatrix4(tilt);
  const head = new THREE.Mesh(anim(headGeo, () => 0.9, () => 0), new THREE.MeshBasicMaterial());
  head.name = 'head';
  root.add(head);
  // ---- lower jaw (its own mesh: hinge at the back of the mouth): white, gold barbel knot
  const jp = [glaze(ell(0.07, 0.03, 0.14, V(0, -0.055, -0.115), 10, 6), [...WHITE, 0.62])];
  for (const s of [-1, 1]) for (const z of [-0.19, -0.11]) jp.push(glaze(spike(V(s * 0.045, -0.035, z), V(s * 0.042, 0.004, z), 0.009, 4), [...WHITE, 0.7]));
  jp.push(glaze(ell(0.022, 0.03, 0.03, V(0, -0.085, -0.03), 6, 4), [...GOLD, 0.95]));
  const jawGeo = mergeGeometries(jp);
  jawGeo.applyMatrix4(tilt);
  // re-centre on the hinge so the pair's matrix can rotate it (rest matrix = translation to the hinge)
  const hinge = V(0, -0.035, 0.03).applyMatrix4(tilt);
  jawGeo.translate(-hinge.x, -hinge.y, -hinge.z);
  const jaw = new THREE.Mesh(anim(jawGeo, () => 0.9, () => 0), new THREE.MeshBasicMaterial());
  jaw.name = 'jaw';
  jaw.position.copy(hinge);
  root.add(jaw);

  // ---- the fish tail breaching behind (its own mesh: pivot at the waterline): cobalt lobes, gold rays
  const tp = [];
  const stem = new THREE.CatmullRomCurve3([V(0, -0.08, 0), V(0, 0.08, 0.02), V(0, 0.2, 0.0)]);
  tp.push(glaze(tubeAlong(stem, 8, 8, (u) => 0.04 * (1 - u * 0.55)), (x, y, z, nx, ny, nz) => [...mixc(WHITE, COBALT, sstep(-0.2, 0.5, nz)), 0.7]));
  // forked caudal fin: two lobes, a notch between them, rays as raised ribs
  // (the fin spans x: the caster, looking along +z, sees it broadside)
  tp.push(glaze(fan(V(0, 0.19, 0), [V(0.04, 0.2, 0), V(0.14, 0.3, 0), V(0.2, 0.42, 0), V(0.1, 0.36, 0), V(0.02, 0.3, 0), V(-0.06, 0.36, 0), V(-0.16, 0.42, 0), V(-0.12, 0.3, 0), V(-0.04, 0.2, 0)]),
    (x, y) => [...mixc(COBALT2, COBALT, sstep(0.25, 0.4, y)), 0.85]));
  for (const x of [0.18, 0.08, -0.06, -0.14]) tp.push(glaze(spike(V(0, 0.2, 0.004), V(x * 1.02, 0.4, 0.004), 0.008, 3), [...GOLD, 0.95]));
  const tailGeo = mergeGeometries(tp);
  const tail = new THREE.Mesh(anim(tailGeo, () => 0, () => 0), new THREE.MeshBasicMaterial());
  tail.name = 'tail';
  tail.position.set(0.05, -0.02, 0.62);
  root.add(tail);
  // one dissolve box for every piece (the ghost shader dissolves each mesh through its own bounding box: the head
  // and jaw would otherwise appear before the body and vanish after it)
  root.updateMatrixWorld(true);
  const all = new THREE.Box3().setFromObject(root);
  for (const m of [body, head, jaw, tail]) m.geometry.boundingBox = all.clone().translate(m.position.clone().negate());
  root.userData = { jawGeo: jaw.geometry, tailGeo: tail.geometry, hinge: hinge.clone(), tailAt: tail.position.clone(), headAt: V(0, 0.71, -0.36) };
  _spirit = root;
  return root;
}

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4();
/** The jaw / tail mesh pairs (depth + colour) of a ghost() made from chiwenSpirit(), with posers. */
export function spiritParts(h) {
  const sp = chiwenSpirit(), ud = sp.userData;
  const jaw = [], tail = [];
  h.obj.traverse((o) => { if (o.isMesh) { if (o.geometry === ud.jawGeo) jaw.push(o); else if (o.geometry === ud.tailGeo) tail.push(o); } });
  return {
    /** jaw open angle (rad, positive = open) */
    setJaw(a) { _m.makeTranslation(ud.hinge.x, ud.hinge.y, ud.hinge.z).multiply(_r.makeRotationX(-a)); for (const o of jaw) o.matrix.copy(_m); },
    /** tail: rise 0..1 out of the water, sway (rad about the vertical), slap (rad, bending forward) */
    setTail(rise, sway = 0, slap = 0) {
      _m.makeTranslation(ud.tailAt.x, ud.tailAt.y - (1 - rise) * 0.5, ud.tailAt.z).multiply(_r.makeRotationY(sway)).multiply(new THREE.Matrix4().makeRotationX(-slap));
      for (const o of tail) o.matrix.copy(_m);
    },
  };
}
