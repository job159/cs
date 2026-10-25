// Stand-in models: an archetype whose own GLB fails to load (every type has its own model since release 0.2 -
// brute, spitter, bloater, crawler, screamer, riot, runner, the bosses - so this is only the safety net for a missing /
// broken download) is made from a real zombie model with a distinct read instead of
// the grey mannequin: root scale, bone proportions (uniform net scales, limb/neck lengths), a skinned-vertex
// sculpt (per-bone bulk, belly swelling) baked into cloned geometry, a per-role albedo grade (tint / desaturate),
// glowing eyes, extra pose offsets and optional rigid gear on bones. Animation clips, hitboxes, part damage and
// dismemberment keep working: the skeleton (bone names, rest rotations) is untouched, hitbox radii follow the
// bone scales and the sculpt. A real <id>.glb always wins: stand-ins are only built for ids whose GLB failed.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Recipe fields (all optional except base):
//   base     model ids to build from, first that loaded wins
//   scale    root scale of every instance (bosses use def.fallbackScale instead)
//   height   absolute height for the game (crawler: prone); else derived from the base and the bone changes
//   scales   net uniform scale per bone relative to the base ('upperarm' = both sides); unlisted bones inherit
//   lengths  multiplies a bone's offset from its parent (lengthens the parent segment: necks, forearms)
//   bulk     metres pushed out radially from each listed bone's segment, by skin weight (negative = gaunt)
//   bulges   [{ bone, at: [x,y,z] centre offset (character axes), from: [x,y,z] push origin offset, amp, r, front }]
//   grade    per material role: { floor: linear luminance dark texels are lifted to (boost: max factor, default 2),
//            desat: 0..1, tint: [r,g,b] (linear multiply), rough: roughness factor, glow: [r,g,b] eye emissive }
//   pose     extra per-frame local rotation offsets (degrees XYZ; + X bends a spine bone forward)
//   hb       extra hitbox radius per hitbox name (metres, before scale)
//   stumps   bones scaled away on purpose: gore caps at their joints, pre-marked severed for the gore code
//   gear     'riot_helmet'
export const STANDINS = {
  // 重裝屠夫: a hulking, hunched heavy - big shoulders, long thick arms, small head, ruddy dark skin, red eyes
  brute: {
    base: ['walker_b', 'walker_a', 'walker_c', 'runner'], scale: 1.3,
    scales: { spine_03: 1.08, clavicle: 1.3, upperarm: 1.16, neck_01: 1.12, head: 0.84, thigh: 1.06 },
    bulk: { upperarm: 0.03, lowerarm: 0.026, clavicle: 0.03, spine_03: 0.035, spine_02: 0.02, neck_01: 0.035, thigh: 0.018, calf: 0.014, hand: 0.008 },
    grade: { skin: { tint: [1.0, 0.84, 0.78], desat: 0.1 }, cloth: { floor: 0.1, boost: 3, tint: [1.08, 1.0, 0.94], desat: 0.45 }, hair: { tint: [0.5, 0.45, 0.42] }, eye: { glow: [2.2, 0.25, 0.08] } },
    pose: { spine_02: [12, 0, 0], spine_03: [8, 0, 0], neck_01: [-10, 0, 0], head: [-8, 0, 0], clavicle_l: [0, 0, -6], clavicle_r: [0, 0, 6] },
    hb: { neck: -0.035 },   // the thick neck sits in front of the hunched chest: keep centre-mass shots off the head part
  },
  // 爆裂者: swollen, sickly yellow-green, wet skin; the belly is the bomb
  bloater: {
    base: ['walker_b', 'walker_a', 'walker_c', 'runner'], scale: 1.04,
    bulk: { spine_01: 0.045, spine_02: 0.05, spine_03: 0.03, pelvis: 0.03, neck_01: 0.035, upperarm: 0.022, lowerarm: 0.012, thigh: 0.02, calf: 0.01, head: 0.006 },
    bulges: [{ bone: 'spine_01', at: [0, 0.02, 0.16], from: [0, 0.04, -0.05], amp: 0.13, r: 0.2, front: true }],
    grade: { skin: { tint: [0.9, 1.0, 0.6], desat: 0.35, rough: 0.6 }, cloth: { floor: 0.085, boost: 2.6, tint: [1.0, 1.06, 0.74], desat: 0.3 }, hair: { tint: [0.7, 0.75, 0.55] }, eye: { glow: [1.4, 1.8, 0.2] } },
    pose: { spine_01: [-4, 0, 0], neck_01: [6, 0, 0] },
    hb: { spine: 0.04 },
  },
  // 酸液噴吐者: hunched, swollen acid throat, green-tinged pallor, green glowing eyes
  spitter: {
    base: ['walker_c', 'walker_a', 'walker_b', 'runner'], scale: 1.0,
    bulk: { neck_01: 0.035, spine_03: 0.008, upperarm: -0.004, lowerarm: -0.004 },
    bulges: [{ bone: 'neck_01', at: [0, 0.0, 0.05], from: [0, 0.02, -0.02], amp: 0.035, r: 0.06, front: true }],
    grade: { skin: { tint: [0.78, 0.98, 0.56], desat: 0.3, rough: 0.7 }, cloth: { tint: [0.62, 0.78, 0.42], desat: 0.55 }, hair: { tint: [0.45, 0.55, 0.32], desat: 0.3 }, eye: { glow: [0.7, 2.4, 0.15] } },
    pose: { spine_02: [10, 0, 0], spine_03: [5, 0, 0], neck_01: [-14, 0, 0], head: [-12, 0, 6] },
    hb: { neck: 0.03 },
  },
  // 尖嘯者: tall, gaunt, long neck and arms, corpse-white skin, ashen clothes, violet eyes
  screamer: {
    base: ['walker_c', 'walker_a', 'walker_b', 'runner'], scale: 1.08,
    lengths: { head: 1.45, lowerarm: 1.08, hand: 1.1 },
    bulk: { upperarm: -0.007, lowerarm: -0.006, thigh: -0.012, calf: -0.006, spine_01: -0.01 },
    grade: { skin: { tint: [0.92, 0.94, 1.08], desat: 0.75 }, cloth: { tint: [0.95, 0.9, 1.08], desat: 0.85 }, hair: { tint: [2.6, 2.6, 2.75], desat: 1 }, eye: { glow: [1.4, 0.5, 2.6] } },
    pose: { neck_01: [6, 0, 0], head: [-14, 0, 8], clavicle_l: [0, 0, 6], clavicle_r: [0, 0, -6] },
  },
  // 防暴屍: a broad, armoured riot cop - dark navy uniform, grey skin, riot helmet with visor
  riot: {
    base: ['walker_a', 'walker_b', 'walker_c', 'runner'], scale: 1.05,
    scales: { clavicle: 1.12 },
    bulk: { spine_03: 0.04, spine_02: 0.035, spine_01: 0.025, clavicle: 0.025, upperarm: 0.012, pelvis: 0.01 },
    grade: { skin: { tint: [0.88, 0.9, 0.92], desat: 0.45 }, cloth: { tint: [0.5, 0.56, 0.72], desat: 0.85 }, hair: { tint: [0.55, 0.55, 0.55] } },
    gear: 'riot_helmet',
    hb: { head: 0.02 },   // the helmet
  },
  // 爬牆者: a legless, grey-green torso dragging itself on its arms (the crawl clips are made for it)
  crawler: {
    base: ['walker_a', 'walker_c', 'walker_b', 'runner'], scale: 0.97, height: 0.8,
    scales: { calf: 0.0001 }, stumps: ['calf_l', 'calf_r'],
    hb: { chest: -0.06 },   // prone: a round chest sphere at the neck would cover the face
    bulk: { upperarm: -0.004, thigh: -0.01 },
    grade: { skin: { tint: [0.84, 0.92, 0.8], desat: 0.4 }, cloth: { tint: [0.66, 0.62, 0.56], desat: 0.45 }, hair: { tint: [0.6, 0.6, 0.6] }, eye: { glow: [1.6, 1.0, 0.2] } },
  },
  // contingency: only if runner.glb is missing
  runner: {
    base: ['walker_c', 'walker_a', 'walker_b'], scale: 1.02,
    bulk: { upperarm: -0.008, lowerarm: -0.006, thigh: -0.01, calf: -0.006, spine_01: -0.012 },
    grade: { skin: { tint: [0.95, 0.92, 0.86], desat: 0.4 }, cloth: { tint: [0.75, 0.75, 0.78], desat: 0.6 }, eye: { glow: [2.2, 0.8, 0.1] } },
    pose: { spine_03: [6, 0, 0], head: [-12, 0, 0] },
  },
  // contingency: only if boss_colossus.glb is missing (the boss def scales it to fallbackScale)
  boss_colossus: {
    base: ['walker_b', 'walker_a', 'walker_c'], scale: 1,
    scales: { spine_03: 1.12, clavicle: 1.45, upperarm: 1.22, neck_01: 1.15, head: 0.72, thigh: 1.1 },
    bulk: { upperarm: 0.04, lowerarm: 0.035, clavicle: 0.04, spine_03: 0.05, spine_02: 0.04, spine_01: 0.03, neck_01: 0.045, thigh: 0.025, calf: 0.02, hand: 0.012 },
    grade: { skin: { tint: [0.8, 0.9, 0.72], desat: 0.5, rough: 0.7 }, cloth: { floor: 0.07, boost: 2.5, tint: [0.82, 0.8, 0.76], desat: 0.6 }, eye: { glow: [1.2, 2.6, 0.3] } },
    pose: { spine_02: [14, 0, 0], spine_03: [10, 0, 0], neck_01: [-12, 0, 0], head: [-10, 0, 0] },
  },
};

// main child per bone (segment = bone -> child) for radial bulk; anything else uses its own +Y axis
const CHILD = {
  pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'head',
  clavicle_l: 'upperarm_l', upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', hand_l: 'middle_01_l',
  clavicle_r: 'upperarm_r', upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r', hand_r: 'middle_01_r',
  thigh_l: 'calf_l', calf_l: 'foot_l', thigh_r: 'calf_r', calf_r: 'foot_r', foot_l: 'ball_l', foot_r: 'ball_r',
};

/** Expands side-less keys ('upperarm' -> upperarm_l, upperarm_r). */
function sided(map) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    if (/_[lr]$/.test(k) || /^(pelvis|spine_0\d|neck_01|head|Root)$/.test(k)) out[k] = v;
    else { out[k + '_l'] = v; out[k + '_r'] = v; }
  }
  return out;
}

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();

const STUMP = { geo: null, mat: null };   // knee caps of the legless crawler (shared)

/** Rest (bind) world matrix per bone name, in the space bindMatrix maps mesh vertices into. */
function restFrames(mesh) {
  const out = {};
  mesh.skeleton.bones.forEach((b, j) => { out[b.name] = new THREE.Matrix4().copy(mesh.skeleton.boneInverses[j]).invert(); });
  return out;
}

function closestOnSegment(p, a, b, out) {
  _d.subVectors(b, a);
  const l2 = _d.lengthSq();
  const t = l2 > 1e-10 ? Math.max(0, Math.min(1, _s.subVectors(p, a).dot(_d) / l2)) : 0;
  return out.copy(a).addScaledVector(_d, t);
}

/** Bakes the recipe's sculpt (bulk + bulges) into a clone of a skinned mesh's geometry (bind space). */
function sculpt(mesh, R, bulk, frames) {
  const bulges = R.bulges || [];
  if (!Object.keys(bulk).length && !bulges.length) return mesh.geometry;
  const g = mesh.geometry.clone();
  const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  if (!pos || !si || !sw) return mesh.geometry;
  const names = mesh.skeleton.bones.map((b) => b.name);
  // segments for the bulked bones
  const seg = {};
  for (const n of Object.keys(bulk)) {
    const F = frames[n];
    if (!F) continue;
    const a = new THREE.Vector3().setFromMatrixPosition(F);
    const c = CHILD[n] && frames[CHILD[n]];
    const b = c ? new THREE.Vector3().setFromMatrixPosition(c) : a.clone().add(new THREE.Vector3().setFromMatrixColumn(F, 1).normalize().multiplyScalar(n === 'head' ? 0.12 : 0.08));
    if (n === 'head') a.addScaledVector(_v.subVectors(b, a), 0.4);  // the skull's centre, not the neck joint
    seg[n] = [a, b];
  }
  const bl = bulges.map((B) => {
    const F = frames[B.bone];
    if (!F) return null;
    const o = new THREE.Vector3().setFromMatrixPosition(F);
    return { C: o.clone().add(new THREE.Vector3(...B.at)), O: o.clone().add(new THREE.Vector3(...(B.from || [0, 0, 0]))), amp: B.amp, r2: B.r * B.r, front: B.front };
  }).filter(Boolean);
  const bind = mesh.bindMatrix, bindInv = mesh.bindMatrixInverse;
  const W = [0, 0, 0, 0], J = [0, 0, 0, 0];
  const disp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i).applyMatrix4(bind);
    disp.set(0, 0, 0);
    J[0] = si.getX(i); J[1] = si.getY(i); J[2] = si.getZ(i); J[3] = si.getW(i);
    W[0] = sw.getX(i); W[1] = sw.getY(i); W[2] = sw.getZ(i); W[3] = sw.getW(i);
    for (let k = 0; k < 4; k++) {
      if (!(W[k] > 0)) continue;
      const n = names[J[k]], amt = bulk[n], s = seg[n];
      if (!amt || !s) continue;
      closestOnSegment(_p, s[0], s[1], _v);
      _v.subVectors(_p, _v);
      const l = _v.length();
      if (l > 1e-4) disp.addScaledVector(_v, (W[k] * amt) / l);
    }
    for (const B of bl) {
      const f = B.amp * Math.exp(-_p.distanceToSquared(B.C) / B.r2);
      if (f < 1e-4) continue;
      _v.subVectors(_p, B.O).normalize();
      const k = B.front ? THREE.MathUtils.smoothstep(_v.z, -0.35, 0.55) : 1;
      disp.addScaledVector(_v, f * k);
    }
    _p.add(disp).applyMatrix4(bindInv);
    pos.setXYZ(i, _p.x, _p.y, _p.z);
  }
  pos.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// albedo floor (dark texels lifted toward `floor` linear luminance, at most x`boost`: a dark shirt stops reading as
// a black hole in shade while lighter fabric on the same texture keeps its value), then desaturate, then tint
const GRADE_FRAG = `#include <map_fragment>
{ const vec3 sdW = vec3(0.2126, 0.7152, 0.0722);
  diffuseColor.rgb *= clamp(uSdFloor.x / max(dot(diffuseColor.rgb, sdW), 1e-4), 1.0, uSdFloor.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, sdW)), uSdDesat) * uSdTint; }`;

/** Per-role albedo grade on a material clone (chains whatever onBeforeCompile the source carries). */
function grade(m, spec) {
  if (!spec || !m) return m;
  const c = m.clone();
  c.name = m.name;
  c.userData = { ...m.userData, standin: true };
  if (spec.rough && c.roughness !== undefined) c.roughness = Math.min(1, c.roughness * spec.rough);
  if (spec.glow && c.emissive) { c.emissive.setRGB(...spec.glow); c.emissiveIntensity = 1; }
  if (spec.tint || spec.desat || spec.floor) {
    const U = {
      uSdTint: { value: new THREE.Color().setRGB(...(spec.tint || [1, 1, 1])) }, uSdDesat: { value: spec.desat || 0 },
      uSdFloor: { value: new THREE.Vector2(spec.floor || 0, spec.boost || 2) },
    };
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey();
    c.onBeforeCompile = (sh, r) => {
      prev.call(c, sh, r);
      sh.uniforms.uSdTint = U.uSdTint; sh.uniforms.uSdDesat = U.uSdDesat; sh.uniforms.uSdFloor = U.uSdFloor;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSdTint;\nuniform float uSdDesat;\nuniform vec2 uSdFloor;')
        .replace('#include <map_fragment>', GRADE_FRAG);
    };
    c.customProgramCacheKey = () => 'standin|' + prevKey;
  }
  return c;
}

function roleOf(m) { return m?.userData?.role || m?.name || ''; }

/**
 * Skull fit in bind space from the LOD0 meshes: vertices whose strongest influence is the head bone (skin, hair,
 * ears; eyes / teeth excluded) above eye level, and the eye height. null if the model has no usable head.
 */
function headFit(scene) {
  const box = new THREE.Box3(), eyeBox = new THREE.Box3(), p = new THREE.Vector3();
  const pts = [];
  scene.traverse((o) => {
    if (!o.isSkinnedMesh || /_lod1$/.test(o.name)) return;
    const role = roleOf(o.material);
    const names = o.skeleton.bones.map((b) => b.name);
    const pos = o.geometry.attributes.position, si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    if (!pos || !si || !sw) return;
    for (let i = 0; i < pos.count; i++) {
      let best = -1, bw = 0;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      if (names[best] !== 'head') continue;
      p.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix);
      if (role === 'eye') eyeBox.expandByPoint(p);
      else if (role !== 'teeth' && role !== 'gore') pts.push(p.clone());
    }
  });
  if (eyeBox.isEmpty() || pts.length < 20) return null;
  const eyeY = (eyeBox.min.y + eyeBox.max.y) / 2;
  for (const q of pts) if (q.y > eyeY - 0.01) box.expandByPoint(q);
  return { eyeY, top: box.max.y, min: box.min, max: box.max };
}

/**
 * Rigid riot helmet parented to the head bone, fitted to the skull: a tilted shell (rim at the brow in front, down
 * to the nape behind) with a rolled lip, a raised face shield folded up on the brow and side pivots.
 */
function riotHelmet(headBone, frames, fit) {
  const H = frames.head;
  if (!H || !fit) return null;
  const clr = 0.016;
  const rx = (fit.max.x - fit.min.x) / 2 + clr, rz = (fit.max.z - fit.min.z) / 2 + clr;
  const brow = fit.eyeY + 0.03;
  const ry = fit.top - brow + clr * 1.4;
  const C = new THREE.Vector3((fit.max.x + fit.min.x) / 2, brow, (fit.max.z + fit.min.z) / 2 - 0.004);
  const grp = new THREE.Group();
  grp.name = 'riot_helmet';
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x434c57, roughness: 0.4, metalness: 0.12 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.75, metalness: 0.02 });
  const shieldMat = new THREE.MeshStandardMaterial({ color: 0x5d6a74, roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  // shell: unit lathe profile from the crown down 25 deg past the equator, rolled lip at the rim
  const prof = [];
  const end = Math.PI / 2 + 0.44;
  for (let i = 0; i <= 18; i++) { const a = (i / 18) * end; prof.push(new THREE.Vector2(Math.max(1e-3, Math.sin(a)), Math.cos(a))); }
  const last = prof.at(-1);
  prof.push(new THREE.Vector2(last.x + 0.07, last.y - 0.02), new THREE.Vector2(last.x + 0.06, last.y + 0.05));
  const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), shellMat);
  shell.scale.set(rx, ry, rz);
  grp.add(shell);
  // folded-up face shield: a curved band riding on the front of the shell above the brow
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.02, 1, 24, 1, true, -Math.PI * 0.4, Math.PI * 0.8), shieldMat);
  shield.scale.set(rx + 0.012, ry * 0.42, rz + 0.012);
  shield.position.set(0, ry * 0.3, 0);
  shield.rotation.x = -0.18;
  grp.add(shield);
  // shield pivots on both sides
  const piv = new THREE.CylinderGeometry(0.016, 0.016, 0.012, 12);
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(piv, trimMat);
    m.rotation.z = Math.PI / 2;
    m.position.set(sx * (rx + 0.004), ry * 0.12, rz * 0.12);
    grp.add(m);
  }
  grp.traverse((m) => { if (m.isMesh) { m.castShadow = m.material !== shieldMat; m.receiveShadow = true; } });
  // tilt: the rim rises in front (above the eyes) and drops behind (over the nape)
  grp.position.copy(C);
  grp.rotation.set(-0.36, 0, 0);
  grp.updateMatrix();
  const local = new THREE.Matrix4().copy(H).invert().multiply(grp.matrix);
  local.decompose(grp.position, grp.quaternion, grp.scale);
  headBone.add(grp);
  return grp;
}

/**
 * Builds a stand-in model entry from a loaded real entry (same shape as ZombieManager._loadModel's entries).
 * @param {string} id     the model id it stands in for
 * @param {object} R      recipe from STANDINS
 * @param {object} base   the real entry ({ scene, lod1, hitboxes, height, poseQ, ... })
 * @param {string} baseId
 */
export function buildStandin(id, R, base, baseId) {
  const scene = cloneSkinned(base.scene);
  scene.userData = { ...base.scene.userData, type: id, standin: baseId };
  const bones = {};
  scene.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const bulk = sided(R.bulk);
  let frames = null;
  const matCache = new Map();
  const regrade = (m) => {
    if (!m) return m;
    if (Array.isArray(m)) return m.map(regrade);
    if (!matCache.has(m)) matCache.set(m, grade(m, R.grade?.[roleOf(m)]));
    return matCache.get(m);
  };
  const fit = R.gear ? headFit(scene) : null;   // before the sculpt moves anything
  const treat = (root) => root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const fr = restFrames(o);
    frames = frames || fr;
    o.geometry = sculpt(o, R, bulk, fr);
    o.material = regrade(o.material);
  });
  treat(scene);
  let lod1 = null;
  if (base.lod1) { lod1 = cloneSkinned(base.lod1); treat(lod1); }
  frames = frames || {};
  // bone proportions: net uniform scales (children compensated so unlisted bones inherit their parent's net scale)
  const net = sided(R.scales);
  const netOf = (b) => { let s = 1; for (let p = b; p && p.isBone; p = p.parent) if (net[p.name] !== undefined) { s = net[p.name]; break; } return s; };
  const restHeadY = frames.head ? new THREE.Vector3().setFromMatrixPosition(frames.head).y : null;
  for (const [n, s] of Object.entries(net)) {
    const b = bones[n];
    if (!b) continue;
    const parentNet = b.parent?.isBone ? netOf(b.parent) : 1;
    b.scale.setScalar(s / parentNet);
  }
  for (const [n, k] of Object.entries(sided(R.lengths))) if (bones[n]) bones[n].position.multiplyScalar(k);
  // gore stumps where whole limbs were scaled away (legless crawler)
  for (const n of R.stumps || []) {
    const b = bones[n];
    if (!b?.parent) continue;
    const cap = new THREE.Mesh(STUMP.geo || (STUMP.geo = new THREE.SphereGeometry(0.058, 12, 9)), STUMP.mat || (STUMP.mat = new THREE.MeshStandardMaterial({ color: 0x2c0604, roughness: 0.55, metalness: 0 })));
    cap.position.copy(b.position);
    cap.scale.set(1, 0.55, 1);
    cap.castShadow = true;
    b.parent.add(cap);
  }
  if (R.gear === 'riot_helmet' && bones.head) riotHelmet(bones.head, frames, fit);
  // hitboxes: radius x the bone's net scale, + bulk, + recipe extras
  scene.updateMatrixWorld(true);
  const hitboxes = {};
  for (const [name, spec] of Object.entries(base.hitboxes || {})) {
    const [bone, r, to] = spec;
    const b = bones[bone];
    const s = b ? b.getWorldScale(_s) : null;
    const k = s ? (s.x + s.z) / 2 : 1;
    // bulk widens limbs / belly / hips; not the chest, neck or head boxes: their spheres sit at the neck and head
    // joints, and a fatter chest sphere there would swallow the face (no more headshots from the front)
    const grow = /^(chest|neck|head)$/.test(name) ? 0 : Math.max(0, bulk[bone] || 0) * k;
    let rr = Math.max(0.02, r * k + grow + (R.hb?.[name] || 0));
    if (s && s.y < 0.01) rr = r * 0.2;   // scaled-away limbs keep a token box at the stump
    hitboxes[name] = to ? [bone, rr, to] : [bone, rr];
  }
  // height: head joint moved by the bone changes, the skull above it scales with the head
  let height = base.height || 1.75;
  if (restHeadY !== null && bones.head) {
    const hy = bones.head.getWorldPosition(_v).y;
    const hs = bones.head.getWorldScale(_s).y;
    height = hy + (height - restHeadY) * hs;
  }
  height *= R.scale || 1;
  if (R.height) height = R.height;
  // pose offsets: the base model's own (hunches etc.) then the recipe's
  const poseQ = [...(base.poseQ || [])];
  for (const [bn, e] of Object.entries(R.pose || {})) poseQ.push([bn, new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0] * Math.PI / 180, e[1] * Math.PI / 180, e[2] * Math.PI / 180))]);
  return {
    scene, lod1, hitboxes, boneCaps: base.boneCaps, height, scale: R.scale || 1, clips: base.clips, poseOffsets: null, poseQ: poseQ.length ? poseQ : null,
    standin: true, standinOf: baseId, severed: (R.stumps || []).filter((n) => bones[n]),
  };
}

/** Model ids a recipe can be built from, in preference order. */
export function standinBases(id) { return STANDINS[id]?.base || []; }
