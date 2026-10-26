// 斬數計 — original StatTrak-style kill counter (docs/PREMIUM_WEAPONS.md §3.6).
// A 38 x 14 x 9 mm metal module (bezel + 2 screws) with a VFD-style teal 6-digit display drawn in the
// hard-surface shader (KILLCOUNTER define): slanted 7-segment SDF digits with faint unlit segments and the
// VFD grid, an 80 ms flip when the number changes, HDR 6 -> 3 flash over 120 ms on a kill, a dot-matrix 「魁」
// boss icon on the left, and 「他人」 alternating with the number when someone else holds the weapon.
// Mounted on the playside (-X) at the model's S_counter socket, or auto-placed on a flat spot of the
// handguard / receiver side when the model has none.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { addTicker, removeTicker } from './premium.js';

// original dot-matrix glyphs, 10 x 10 ('#' = dot): 魁 (boss), 他, 人
const GLYPHS = [
  ['..#....#..', '.#####.#.#', '.#.#.#.#..', '.#####.#.#', '.#.#.#.#..', '.#####.###', '..#.#..#..', '.#..#..#..', '#...#.##..', '...######.'],
  ['..#.......', '..#...#...', '.#..#.#.#.', '.#..#####.', '##.##.#.#.', '.#..#.#.#.', '.#..#.###.', '.#..#.....', '.#..#....#', '.#...#####'],
  ['....#.....', '....#.....', '....#.....', '....#.....', '...#.#....', '...#.#....', '..#...#...', '.#.....#..', '#.......#.', '..........'],
];
const GLYPH_INTS = GLYPHS.flat().map((row) => [...row].reduce((a, ch, i) => a | (ch === '#' ? 1 << (9 - i) : 0), 0));

export const KC_SIZE = { w: 0.038, h: 0.014, d: 0.009, faceW: 0.032, faceH: 0.009 };

/** GLSL (fragment pars) — 7-segment SDF + dot-matrix glyphs. */
export const COUNTER_PARS = /* glsl */`
#ifdef KILLCOUNTER
uniform float kcKills, kcPrev, kcFlip, kcGlow, kcBoss, kcBossFlash, kcOther;
uniform vec2 kcSize;
const int KC_SEG[10] = int[10](63, 6, 91, 79, 102, 109, 125, 7, 127, 111);
const vec4 KC_S[7] = vec4[7](vec4(0.22, 0.9, 0.78, 0.9), vec4(0.82, 0.86, 0.82, 0.54), vec4(0.82, 0.46, 0.82, 0.14),
  vec4(0.22, 0.1, 0.78, 0.1), vec4(0.18, 0.46, 0.18, 0.14), vec4(0.18, 0.86, 0.18, 0.54), vec4(0.22, 0.5, 0.78, 0.5));
const int KC_G[30] = int[30](${GLYPH_INTS.join(', ')});
float kcSegD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length((pa - ba * h) * vec2(0.62, 1.0)); }
// (lit, all segments) for digit d in a cell; p: x 0..1, y 0..1
vec2 kcDigit(vec2 p, int d, float aa) {
  if (p.y < 0.0 || p.y > 1.0) return vec2(0.0);
  p.x -= (p.y - 0.5) * 0.12;                          // VFD italic slant
  int bits = KC_SEG[d];
  float lit = 0.0, all = 0.0;
  for (int s = 0; s < 7; s++) {
    float m = 1.0 - smoothstep(0.055, 0.055 + aa, kcSegD(p, KC_S[s].xy, KC_S[s].zw));
    all = max(all, m);
    if (((bits >> s) & 1) == 1) lit = max(lit, m);
  }
  return vec2(lit, all);
}
float kcGlyph(vec2 p, int g, float aa) {           // p 0..1 over the 10 x 10 dot grid
  if (p.x < 0.0 || p.x >= 1.0 || p.y < 0.0 || p.y >= 1.0) return 0.0;
  vec2 c = p * 10.0;
  int col = int(c.x), row = 9 - int(c.y);
  float on = float((KC_G[g * 10 + row] >> (9 - col)) & 1);
  return on * (1.0 - smoothstep(0.34, 0.34 + aa * 10.0, length(fract(c) - 0.5)));
}
int kcDigitOf(float n, int i) { return int(mod(floor(n / pow(10.0, float(i)) + 0.0001), 10.0)); }
#endif
`;

/** Emissive stage: replaces the face's emission with the display. */
export const COUNTER_EMIT = /* glsl */`
#ifdef KILLCOUNTER
{
  vec2 uv = vec2(vObjPos.z / kcSize.x + 0.5, vObjPos.y / kcSize.y + 0.5);
  float aa = fwidth(uv.y) * 1.5 + 1e-4;
  vec3 vfd = totalEmissiveRadiance;                    // the face's own emissive colour x HDR 3
  float lit = 0.0, ghost = 0.0;
  // boss icon: left 18 %
  float icon = kcGlyph(vec2(uv.x / 0.18 * 0.9 + 0.05, (uv.y - 0.05) / 0.9), 0, aa);
  ghost = icon * 0.5;
  lit = icon * (kcBoss > 0.5 ? 0.55 + 0.45 * kcBossFlash : 0.0);
  // six digits (or 他人 when someone else holds it)
  float dx = (uv.x - 0.2) / 0.8;
  bool other = kcOther > 0.5 && fract(time / 1.6) > 0.5;
  if (dx >= 0.0 && dx < 1.0) {
    if (other) {
      lit = max(lit, kcGlyph(vec2(dx * 2.0 - 0.25, (uv.y - 0.06) / 0.88) * vec2(1.6, 1.0) - vec2(0.15, 0.0), 1, aa));
      lit = max(lit, kcGlyph(vec2(dx * 2.0 - 1.05, (uv.y - 0.06) / 0.88) * vec2(1.6, 1.0) - vec2(0.15, 0.0), 2, aa));
    } else {
      float cell = dx * 6.0;
      int i = 5 - int(floor(cell));
      vec2 p = vec2(fract(cell) * 1.2 - 0.1, (uv.y - 0.08) / 0.84);
      int dn = kcDigitOf(kcKills, i), dp = kcDigitOf(kcPrev, i);
      vec2 a;
      if (dn != dp && kcFlip < 1.0) {
        // 80 ms flip: the old digit rolls up and out, the new one rolls in from below
        vec2 o = kcDigit(p - vec2(0.0, kcFlip * 1.1), dp, aa), n = kcDigit(p + vec2(0.0, (1.0 - kcFlip) * 1.1), dn, aa);
        a = vec2(max(o.x, n.x), max(o.y, n.y));
      } else a = kcDigit(p, dn, aa);
      lit = max(lit, a.x); ghost = max(ghost, a.y);
    }
  }
  // VFD control grid in front of the segments
  float grid = 0.82 + 0.18 * step(0.25, fract(vObjPos.z * 1400.0)) * step(0.25, fract(vObjPos.y * 1400.0));
  totalEmissiveRadiance = vfd * (lit * kcGlow * grid + ghost * 0.035);
}
#endif
`;

const _v = new THREE.Vector3();
let nextId = 1;
/** Neutral `_bake` (no AO, no edges) for the runtime-built module geometry. */
function bake(geo) {
  const n = geo.attributes.position.count, b = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) { b[i * 4] = 235; b[i * 4 + 1] = 40; b[i * 4 + 2] = 30; b[i * 4 + 3] = 128; }
  geo.setAttribute('_bake', new THREE.BufferAttribute(b, 4, true));
  return geo;
}

export class KillCounter {
  /** { kills, boss, other, viewmodel } — material factory injected to avoid a materials.js import cycle. */
  constructor({ kills = 0, boss = 0, other = false, viewmodel = false } = {}, makeMaterial) {
    this.id = nextId++;
    this.kills = kills; this.boss = boss;
    const f = (v) => ({ value: v });
    this.u = { kcKills: f(Math.min(999999, kills)), kcPrev: f(Math.min(999999, kills)), kcFlip: f(1), kcGlow: f(1), kcBoss: f(boss > 0 ? 1 : 0),
      kcBossFlash: f(0), kcOther: f(other ? 1 : 0), kcSize: f(new THREE.Vector2(KC_SIZE.faceW, KC_SIZE.faceH)) };
    const S = KC_SIZE;
    const g = this.object = new THREE.Group();
    g.name = 'killcounter';
    // body: the display faces -X (playside); the module's back sits at x = 0
    const frame = new THREE.Mesh(bake(new RoundedBoxGeometry(S.d, S.h, S.w, 2, 0.0012)), makeMaterial('steel_dark', { viewmodel }));
    frame.position.x = -S.d / 2; frame.name = 'kc_frame:steel_dark';
    const glass = new THREE.Mesh(bake(new THREE.PlaneGeometry(S.faceW, S.faceH).rotateY(-Math.PI / 2)), makeMaterial('glow_vfd', { viewmodel, counter: this }));
    glass.position.x = -S.d - 0.0002; glass.name = 'kc_face:glow_vfd';
    this.face = glass;   // its material is this counter's own (uncached: the display uniforms)
    const screwGeo = bake(new THREE.CylinderGeometry(0.0011, 0.0011, 0.0008, 12).rotateZ(Math.PI / 2));
    for (const z of [-S.w / 2 + 0.0018, S.w / 2 - 0.0018]) {
      const s = new THREE.Mesh(screwGeo, makeMaterial('steel_bright', { viewmodel }));
      s.position.set(-S.d - 0.0001, 0, z); s.name = 'kc_screw:steel_bright';
      g.add(s);
    }
    g.add(frame, glass);
    for (const m of [frame, glass, ...g.children]) { m.castShadow = !viewmodel; m.receiveShadow = true; if (viewmodel) m.frustumCulled = false; }
    this.flipT = 1; this.glowT = 1; this.bossT = 1;
    addTicker(this);
  }

  /** Sets the count without animation (equip / ownership change). */
  set(kills, boss = this.boss) { this.kills = kills; this.boss = boss; this.u.kcKills.value = this.u.kcPrev.value = Math.min(999999, kills); this.u.kcBoss.value = boss > 0 ? 1 : 0; }
  /** A kill by the owner: number flips (80 ms) and the display flashes HDR 6 -> 3 (120 ms). */
  kill({ boss = false } = {}) {
    this.u.kcPrev.value = this.u.kcKills.value;
    this.kills++;
    this.u.kcKills.value = Math.min(999999, this.kills);   // display caps at 999999, the real count is kept
    this.flipT = 0; this.glowT = 0;
    if (boss) { this.boss++; this.u.kcBoss.value = 1; this.bossT = 0; }
  }
  /** Held by someone else: number and 「他人」 alternate, nothing is counted (caller's rule). */
  setOther(on) { this.u.kcOther.value = on ? 1 : 0; }
  update(dt) {
    if (this.flipT < 1) { this.flipT = Math.min(1, this.flipT + dt / 0.08); this.u.kcFlip.value = this.flipT; }
    if (this.glowT < 1) this.glowT = Math.min(1, this.glowT + dt / 0.12);
    this.u.kcGlow.value = 1 + (1 - this.glowT) * (1 - this.glowT);   // x1 = HDR 3 (material), x2 = HDR 6
    if (this.bossT < 1) this.bossT = Math.min(1, this.bossT + dt / 0.6);
    this.u.kcBossFlash.value = 1 - this.bossT;
  }
  /** Stops ticking and frees what the module owns: its geometry (frame / face / screws) and the face material. */
  dispose() { removeTicker(this); this.object.removeFromParent(); this.object.traverse((o) => o.geometry?.dispose()); this.face.material.dispose(); }
}

const mountCache = new Map();   // weapon id -> { list: mount spots, pick } (the first-person check may move pick on)
const _ray = new THREE.Raycaster();
_ray.layers.enableAll();
const partOf = (o) => { let p = o.parent; while (p && !p.userData?.part) p = p.parent; return p; };

/**
 * Mount spots of a weapon, best first: { part, pos, quat } with pos / quat in that part's space (part null: the
 * root). S_counter when the model has one; on a handgun with a slide the slide's rear playside (it rides the slide:
 * the frame in front of the trigger guard is under the support hand's thumb in first person); then flat playside
 * spots of the front body (handguard first, then the receiver side) found by raycasting from -X; a last resort.
 */
function mountSpots(root, box) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const toPart = (part, pos, quat = new THREE.Quaternion()) => {
    if (!part) return { part: null, pos, quat };
    const m = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().copy(part.matrixWorld).invert(), root.matrixWorld);
    const q = new THREE.Quaternion().setFromRotationMatrix(m).multiply(quat);
    return { part: part.name, pos: pos.clone().applyMatrix4(m), quat: q };
  };
  const list = [];
  let sock = null;
  root.traverse((o) => { if (o.name === 'S_counter') sock = o; });
  if (sock) {
    const m = new THREE.Matrix4().multiplyMatrices(inv, sock.matrixWorld);
    list.push({ part: null, pos: new THREE.Vector3().setFromMatrixPosition(m), quat: new THREE.Quaternion().setFromRotationMatrix(m) });
  }
  const all = [], body = [];
  let slide = null;
  root.traverse((o) => {
    if (!o.isMesh || o.name.startsWith('kc_')) return;
    const p = partOf(o);
    all.push(o);
    if (!p || p.name === 'body') body.push(o);
    if (p?.name === 'slide') slide = p;
  });
  const boxOf = (meshes) => { const b = new THREE.Box3(); for (const o of meshes) { o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } return b; };
  if (!box) box = boxOf(body);
  const dir = new THREE.Vector3(1, 0, 0).transformDirection(root.matrixWorld);
  const hitAt = (meshes, y, z) => { _ray.set(_v.set(box.min.x - 0.1, y, z).applyMatrix4(root.matrixWorld), dir); return _ray.intersectObjects(meshes, false)[0]; };
  // a flat playside face at (y, z) of `meshes` with ~4 cm of it around (probes at both ends), first hit from -X on it
  const spot = (meshes, y, z) => {
    const h = hitAt(all, y, z);
    if (!h?.face || !meshes.includes(h.object)) return null;
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).transformDirection(inv);
    if (n.x > -0.9) return null;
    for (const dz of [-0.016, 0.016]) for (const dy of [-0.005, 0.005]) {
      const h2 = hitAt(all, y + dy, z + dz);
      if (!h2 || !meshes.includes(h2.object) || Math.abs(h2.distance - h.distance) > 0.004) return null;
    }
    return h.point.clone().applyMatrix4(inv);
  };
  const len = box.max.z - box.min.z;
  if (slide && len < 0.34) {
    const sm = all.filter((o) => partOf(o) === slide), sb = boxOf(sm), sl = sb.max.z - sb.min.z;
    let n = 0;
    // (fz from the muzzle end: the rear of the slide, clear of the hands and the front sight)
    for (const fz of [0.76, 0.7, 0.82, 0.64, 0.58]) for (const fy of [0.48, 0.4, 0.56]) {
      if (n >= 2) break;
      const p = spot(sm, sb.min.y + (sb.max.y - sb.min.y) * fy, sb.min.z + sl * fz);
      if (p && !list.some((s) => s.part === 'slide' && Math.abs(s.z - p.z) < 0.02)) { const s = toPart(slide, p); s.z = p.z; list.push(s); n++; }
    }
  }
  let n = 0;
  for (const fz of [0.36, 0.42, 0.3, 0.48, 0.55, 0.62]) for (const fy of [0.62, 0.55, 0.7, 0.48]) {
    if (n >= 3) break;
    const p = spot(body, box.min.y + (box.max.y - box.min.y) * fy, box.min.z + len * fz);
    if (p && !list.some((s) => !s.part && s.pos.distanceTo(p) < 0.03)) { list.push(toPart(null, p)); n++; }
  }
  if (!list.length) list.push({ part: null, pos: new THREE.Vector3(box.min.x, (box.min.y + box.max.y) * 0.5, box.min.z + len * 0.4), quat: new THREE.Quaternion() });
  return list;
}

function place(root, counter, s) {
  let parent = root;
  if (s.part) root.traverse((o) => { if (o.name === s.part && o.userData?.part) parent = o; });
  counter.object.position.copy(s.pos);
  counter.object.quaternion.copy(s.quat);
  parent.add(counter.object);
  counter.mount = s;
}

const mountId = (root) => root.userData.weapon || root.children[0]?.userData?.weapon || root.name;

/**
 * Mounts the counter on a weapon root (rest pose) at the weapon's current mount spot (mountSpots, cached per weapon
 * id; a slide-mounted one rides the slide part).
 */
export function mountKillCounter(root, counter, box = null) {
  const id = mountId(root);
  let m = mountCache.get(id);
  if (!m) { m = { list: mountSpots(root, box), pick: 0 }; mountCache.set(id, m); }
  place(root, counter, m.list[Math.min(m.pick, m.list.length - 1)]);
  return counter;
}

/**
 * First person (game.js, once per gun resting in the idle pose): the display must face the camera unhidden -- no
 * hand, arm or part of the gun in front of most of it. A hidden one moves to the weapon's next mount spot (for the
 * session, the armory and other players' copies included). Returns true when the counter is visible where it ends.
 */
export function fitCounterView(counter, root, occluders, camera) {
  const m = mountCache.get(mountId(root));
  if (!counter?.face || !m) return true;
  const objs = [root, ...(occluders ? [occluders] : [])];
  for (let tries = 0; tries <= m.list.length; tries++) {
    if (!counterHidden(counter, objs, camera)) return true;
    if (m.pick >= m.list.length - 1) return false;
    m.pick++;
    counter.object.removeFromParent();
    place(root, counter, m.list[m.pick]);
  }
  return false;
}

const _eye = new THREE.Vector3(), _pt = new THREE.Vector3(), _fwd = new THREE.Vector3();
const shown = (o) => { for (; o; o = o.parent) if (o.visible === false) return false; return true; };
/** True when most of the display (its centre and corners) is behind something else or turned away from the camera. */
function counterHidden(counter, objs, camera) {
  camera.updateMatrixWorld(true);
  for (const o of objs) o.updateMatrixWorld(true);
  for (const o of objs) o.traverse((m) => { if (m.isSkinnedMesh) m.computeBoundingSphere(); });
  const face = counter.face, S = KC_SIZE;
  camera.getWorldPosition(_eye);
  // facing: the display's normal (-X of the module) towards the eye
  _fwd.set(-1, 0, 0).transformDirection(face.matrixWorld);
  face.getWorldPosition(_pt);
  if (_fwd.dot(_eye.clone().sub(_pt).normalize()) < 0.12) return true;
  let hidden = 0;
  const pts = [[0, 0], [-0.4, -0.35], [0.4, -0.35], [-0.4, 0.35], [0.4, 0.35]];
  for (const [fz, fy] of pts) {
    _pt.set(-0.0005, fy * S.faceH, fz * S.faceW).applyMatrix4(face.matrixWorld);
    const d = _pt.distanceTo(_eye);
    _ray.set(_eye, _pt.clone().sub(_eye).normalize());
    _ray.far = d - 0.0015;
    const hit = _ray.intersectObjects(objs, true).find((h) => !h.object.name.startsWith('kc_') && shown(h.object));
    if (hit) hidden++;
  }
  _ray.far = Infinity;
  return hidden >= 2;
}
