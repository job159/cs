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
  dispose() { removeTicker(this); this.object.removeFromParent(); }
}

const mountCache = new Map();
const _ray = new THREE.Raycaster();

/**
 * Mounts the counter on a weapon root (rest pose): at S_counter when the model has one, else on a flat
 * playside spot of the front body found by raycasting (cached per weapon id).
 */
export function mountKillCounter(root, counter, box = null) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  let sock = null;
  root.traverse((o) => { if (o.name === 'S_counter') sock = o; });
  const id = root.userData.weapon || root.children[0]?.userData?.weapon || root.name;
  let place = null;
  if (sock) {
    const m = new THREE.Matrix4().multiplyMatrices(inv, sock.matrixWorld);
    place = { pos: new THREE.Vector3().setFromMatrixPosition(m), quat: new THREE.Quaternion().setFromRotationMatrix(m) };
  } else if (mountCache.has(id)) place = mountCache.get(id);
  else {
    const meshes = [];
    root.traverse((o) => { if (o.isMesh && !o.name.startsWith('kc_')) { let p = o.parent; while (p && !p.userData?.part) p = p.parent; if (!p || p.name === 'body') meshes.push(o); } });
    if (!box) { box = new THREE.Box3(); for (const o of meshes) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } }
    const len = box.max.z - box.min.z;
    let best = null;
    // candidates: front half of the body (handguard first, then the receiver side), around the bore height
    search: for (const fz of [0.36, 0.42, 0.3, 0.48, 0.55, 0.62]) for (const fy of [0.62, 0.55, 0.7, 0.48]) {
      const z = box.min.z + len * fz, y = box.min.y + (box.max.y - box.min.y) * fy;
      const o = _v.set(box.min.x - 0.1, y, z).applyMatrix4(root.matrixWorld);
      _ray.set(o, new THREE.Vector3(1, 0, 0).transformDirection(root.matrixWorld));
      const hits = _ray.intersectObjects(meshes, false);
      const h = hits[0];
      if (!h || !h.face) continue;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).transformDirection(inv);
      if (n.x > -0.9) continue;
      // the module needs ~4 cm of flat side: probe both ends
      let flat = true;
      for (const dz of [-0.016, 0.016]) for (const dy of [-0.005, 0.005]) {
        const o2 = _v.set(box.min.x - 0.1, y + dy, z + dz).applyMatrix4(root.matrixWorld);
        _ray.set(o2, new THREE.Vector3(1, 0, 0).transformDirection(root.matrixWorld));
        const h2 = _ray.intersectObjects(meshes, false)[0];
        if (!h2 || Math.abs(h2.distance - h.distance) > 0.004) flat = false;
      }
      if (!flat) continue;
      const p = h.point.clone().applyMatrix4(inv);
      best = { pos: p, quat: new THREE.Quaternion() };
      break search;
    }
    place = best || { pos: new THREE.Vector3(box.min.x, (box.min.y + box.max.y) * 0.5, box.min.z + len * 0.4), quat: new THREE.Quaternion() };
    mountCache.set(id, place);
  }
  counter.object.position.copy(place.pos);
  counter.object.quaternion.copy(place.quat);
  root.add(counter.object);
  return counter;
}
