// 刑天．舞戚 Xingtian Wardancer — 神兵 X05 great axe (docs/PREMIUM_WEAPONS.md §2.32; def in defs.js, model
// tools/assets/weapons/greataxe.mjs, FX pieces greataxe_fx.js). A premium melee: the special drives its own attacks
// (Arsenal._melee -> special.melee), the skills run on the specials v2 engine.
//   LMB tap   開山三劈: 斜劈 (right-high -> left-low 150) -> 回掄 (rising backhand 150) -> 開山 (an overhead chop into the
//             street 225 within 2.3 m of the bite, a molten fissure running 4 m on, 50 each); every target in the arc
//             is hit; a blow that connects: 70-120 ms hit-stop, shake, camera punch, bronze sparks + blood + bone chips,
//             the trail's tail turns molten (§1.17), heavy kills sever (SEVER) and the bodies are hurled
//   LMB hold  天墜: the axe goes up overhead, the mask's jaw opens a stage at a time (0.55 / 1.1 s), a crimson reticle
//             marks where the axe will bite (the crosshair's street point, a zombie it rests on, else the densest
//             cluster in a 30° cone; 5 / 8 / 11 m); release = a leap that lands the feet 1.8 m short of it (a real
//             ballistic arc, invulnerable through the fall) and, on the touchdown frame, a smash 220 -> 450 (r 3 -> 4)
//             at the bite with three shockwave rings (60 -> 100 each, out to 8 m), cracks, a dust wall, rubble
//   RMB held  狂旋 (戰意 ≥ 20, 16/s): the axe whirls round the player once every 0.28 s (a blade ring of light at
//             waist height in step with it, the view rolling ±1.5°): 60 to everything within 3.4 m a turn, zombies
//             within 7 m dragged in on ember streaks; let go after 0.8 s = an outward burst 120
//   Q tap     迴戚 (35 戰意): the real axe thrown spinning (a crimson whirl round it) 16 m through the horde (180 each,
//             pierces all), it hangs, curves back 3 m wide (140 each) into the hands (a catch beat); Q again recalls
//   Q held    猛志 (ult, 6,000 damage): 5 beats -- the axe raised, the mask roars a column of fire, a 雲雷紋 war sigil,
//             a 7.5-14 m headless war spirit (chest eyes in pectoral plates, a fanged navel mouth, a Shang 干 shield)
//             rises behind the mark (the crosshair's, else the densest cluster within 15 m, else 10 m ahead), sweeps
//             the street low (450 in 11 m / 200°, a white-hot band in the head's wake), chops diagonally onto the mark
//             (900 in 7 m + three rings of 80: a flash column, a rubble blast, a dust wall) and breaks into bronze
//             and embers; 戰鼓: +12 % team damage within 8 m for 6 s
//   kill      KE_CLEAVE: a molten cut across the body, embers + bronze sparks rising, a crimson rim (≤ 3 at a time);
//             the wave's last kill: a spirit axe falls on it (KE_FINAL)
//   crisis    干盾 (crisis.js, counter): a glazed bronze shield flashes up and bursts into shards
// Sound cues (§1.12, produced later): see SFX; a missing cue falls back to an existing sample or stays silent.
import * as THREE from 'three';
import { registerSpecial, registerSkill, startSkill, endSkill, meterAdd, canCast, addAura } from '../specials.js';
import { registerClip } from '../../player/clips.js';
import { registerCrosshair } from '../../ui/crosshairs.js';
import { registerKillMark } from '../../ui/killmarks.js';
import { SKINS } from '../../ui/dmgnums.js';
import { FRAME, DECAL, DECAL_TINT } from '../../fx/fx.js';
import { applyHardSurface } from '../../gfx/materials.js';
import { instanceGLB } from '../../engine/assets.js';
import { WEAPONS } from '../defs.js';
import { clipComfort, haptic } from '../arsenal.js';
import { sweepBand, fissureGeo, fissureMat, fissureMesh, cleaveMesh, markerMesh, vortexMesh, bladeRing, discMesh, spiritGeometry, spiritArmGeometry, shieldGeometry, RSHOULDER, SPIRIT_H, ARM_HEAD } from './greataxe_fx.js';

const ID = 'greataxe';
const WHITE = [6.0, 4.4, 3.0];      // white-hot
const CRIM = [3.2, 0.42, 0.16];     // molten crimson (#ff3a2a body)
const EMBER = [3.0, 1.35, 0.4];     // #ffb070 embers
const SPARK = [3.6, 2.5, 0.9];      // bronze sparks #ffd27a
const DEEP = [1.1, 0.1, 0.04];
const UP = new THREE.Vector3(0, 1, 0);
const V3 = () => new THREE.Vector3();
const _a = V3(), _b = V3(), _c = V3(), _d = V3(), _e = V3(), _f = V3(), _q = new THREE.Quaternion();
const R = Math.random;
const G_PLAYER = 15.2;
const _mk = new THREE.Vector3();              // controller gravity (player/controller.js MOVE.gravity)
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const shake = (g, a) => { if (clipComfort.shake) g.addShake?.(a); };
const stop = (g, s) => { if (clipComfort.hitstop) g.hitStop?.(s); };
// sound cues: name -> fallback (existing sample) | null
const SFX = {
  greataxe_draw: 'draw', greataxe_draw_first: 'drawHeavy', greataxe_first_sting: null, greataxe_roar: null, greataxe_idle: null,
  greataxe_swing: 'swingHeavy', greataxe_swing_heavy: 'swingHeavy', greataxe_hit: 'melee_heavy_hit', greataxe_hit_flesh: 'knife_hit_flesh',
  greataxe_hit_wall: 'knife_hit_wall', greataxe_kill: null, greataxe_sever: 'gib', greataxe_chop_ground: 'explosion_small',
  greataxe_charge: null, greataxe_charge_stage: 'xh_node', greataxe_charge_full: null, greataxe_leap: 'land_heavy', greataxe_land: 'explosion_small',
  greataxe_quake: 'explosion_far', greataxe_spin_start: 'swingHeavy', greataxe_spin: null, greataxe_spin_hit: 'knife_hit_flesh', greataxe_spin_end: 'explosion_small',
  greataxe_throw: 'swingHeavy', greataxe_fly: null, greataxe_return: 'swing', greataxe_catch: 'impact_metal',
  greataxe_ult_roar: null, greataxe_ult_sigil: 'bifang_bell', greataxe_ult_rise: null, greataxe_ult_sweep: 'swingHeavy', greataxe_ult_chop: 'swingHeavy',
  greataxe_ult_impact: 'explosion_large', greataxe_ult_shatter: 'impact_glass', greataxe_ult_bed: null, ready_greataxe: null,
  greataxe_inspect: 'cloth', greataxe_jaw: 'impact_metal', greataxe_recover: 'cloth', greataxe_crisis: 'impact_glass', greataxe_final: 'explosion_far',
};
function sfx(g, name, o = {}) {
  const au = g.audio;
  if (!au) return null;
  if (au.has?.(name)) return au.play(name, o);
  const fb = SFX[name];
  return fb ? au.play(fb, { ...o, volume: (o.volume ?? 1) * 0.7 }) : null;
}
const psOf = (vm, name) => vm.partState[name] || (vm.partState[name] = { v: 0 });

// ------------------------------------------------------------------------------------------ per-weapon state
function ssOf(ws) {
  return ws.sp.ga || (ws.sp.ga = {
    mode: 'idle', t: 0, cur: null, step: -1, hit: false, chainT: 0, buf: 0, pressing: false, pressT: 0, fresh: true,
    ct: 0, stage: 0, lockT: 0, combos: 0, leap: null, leapCd: 0, spin: null, throwK: null, q: [], view: { w: null },
    hum: null, chargeSnd: null, readyN: false, readyT: 0, finalWave: -1, mark: null,
  });
}
function later(ws, sec, fn) { ssOf(ws).q.push([sec, fn]); }
function runQueue(ss, dt) { const q = ss.q; for (let i = q.length - 1; i >= 0; i--) if ((q[i][0] -= dt) <= 0) { const f = q[i][1]; q.splice(i, 1); f(); } }
const held = (g, ws) => g.arsenal?.current === ws;
function eyeFwd(g, eye = _a, fwd = _b) {
  const cam = g.camera;
  eye.copy(cam.position);
  cam.getWorldDirection(fwd); fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  return fwd.normalize();
}
const floorAt = (g, p) => { const y = g.world?.collision?.floorBelow?.(_f.set(p.x, p.y + 0.6, p.z), 0.2, 30); return Number.isFinite(y) ? y : p.y; };

// ------------------------------------------------------------------------------------------ world system (per game)
// swept bands, molten cracks, kill cuts, the leap marker, the world axe prototype
function sys(g) {
  if (g._ga) return g._ga;
  const S = g._ga = { arcs: [], cracks: [], cuts: [], cutPool: [], fpool: [], ck: [], kf: 0, marker: null, axe: null, update: (dt) => sysUpdate(g, S, dt) };
  for (let i = 0; i < 3; i++) { const m = cleaveMesh(); m.visible = false; g.scene.add(m); S.cutPool.push(m); }
  S.marker = markerMesh(); g.scene.add(S.marker);
  g.systems.push(S);
  // the real axe for 迴戚 flights (world materials, third-person premium look); loaded once per game
  instanceGLB(`weapons/${WEAPONS[ID]?.model || ID}.glb`).then((root) => {
    root.traverse((o) => { if (o.userData?.restHidden) o.visible = false; });
    applyHardSurface(root, { premium: WEAPONS[ID]?.premium, premiumKey: `p3:${ID}:throw`, world: true });
    S.axe = root;
  }).catch((e) => console.warn('[greataxe] world axe', e));
  return S;
}
/** a swept band (spin bursts, the ult sweep): head 0 -> 1 between t0 and t1, then the wake drains */
function sweepArc(g, pos, yaw, o, { t0 = 0, t1 = 0.3, span = 0.35, fade = 0.25, amt = 0.7 } = {}) {
  const S = sys(g), mesh = sweepBand(o);
  mesh.position.copy(pos); mesh.rotation.y = yaw;
  mesh.material.uniforms.uSpan.value = span;
  g.scene.add(mesh);
  const a = { mesh, t: 0, t0, t1, fade, amt, dur: t1 + fade + span * (t1 - t0) };
  S.arcs.push(a);
  return a;
}
/** a molten fissure on the ground from p along dir (lit as its front runs out at `speed`); meshes are recycled and
 *  the jagged geometry is cached by size (four shapes a size) */
const _fgeo = new Map();
const fgeo = (key, L, width, thick) => {
  if (!_fgeo.has(key)) { let sd = [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) >>> 0; _fgeo.set(key, fissureGeo(() => ((sd = (sd * 16807) % 2147483647) / 2147483647), L, width, thick)); }
  return _fgeo.get(key);
};
// the sizes the blows use, built a few a frame while the axe idles (a landing that built ~10 fresh cracks hitched)
const FWARM = [];
for (let v = 0; v < 4; v++) {
  for (let L = 2; L <= 5.5; L += 0.5) FWARM.push([L, 0.9, 0.8, v]);
  for (let L = 4; L <= 8; L += 0.5) FWARM.push([L, 1.1, 1, v]);
  FWARM.push([4, 1.3, 1, v], [2.5, 1.2, 1, v]);
}
function fissure(g, p, dir, len, { width = 1.2, thick = 1, life = 3, speed = 26, rng = R } = {}) {
  const S = sys(g), L = Math.round(len * 2) / 2, key = `${L}|${width}|${thick}|${(rng() * 4) | 0}`;
  fgeo(key, L, width, thick);
  const m = S.fpool.pop() || new THREE.Mesh(undefined, fissureMat());
  m.geometry = _fgeo.get(key); m.frustumCulled = false; m.renderOrder = 6;
  m.material.uniforms.uFront.value = 0; m.material.uniforms.uFade.value = 1;
  len = L;
  m.position.set(p.x, p.y + 0.03, p.z);
  m.lookAt(_f.set(p.x - dir.x, p.y + 0.03, p.z - dir.z));
  g.scene.add(m);
  S.cracks.push({ mesh: m, t: 0, life, len, speed });
}
function sysUpdate(g, S, dt) {
  for (let i = 0; i < 3 && FWARM.length; i++) { const [L, w, th, v] = FWARM.pop(); fgeo(`${L}|${w}|${th}|${v}`, L, w, th); }
  S.kf = 0;                                                             // kills this frame (KE_CLEAVE thins out on multi-kills)
  for (let i = S.ck.length - 1; i >= 0; i--) if ((S.ck[i].t -= dt) <= 0) S.ck.splice(i, 1);
  for (let i = S.arcs.length - 1; i >= 0; i--) {
    const a = S.arcs[i], u = a.mesh.material.uniforms;
    a.t += dt;
    const k = clamp((a.t - a.t0) / (a.t1 - a.t0), 0, 1);
    u.uHead.value = k * (1 + u.uSpan.value);
    u.uAmt.value = a.amt * (a.t < a.t0 ? 0 : a.t > a.t1 ? Math.max(0, 1 - (a.t - a.t1) / a.fade) : 1);
    if (a.t >= a.dur) { a.mesh.removeFromParent(); a.mesh.geometry.dispose(); a.mesh.material.dispose(); S.arcs.splice(i, 1); }
  }
  for (let i = S.cracks.length - 1; i >= 0; i--) {
    const c = S.cracks[i], u = c.mesh.material.uniforms;
    c.t += dt;
    u.uFront.value = Math.min(c.len + 2, c.t * c.speed);
    u.uFade.value = c.t < c.life - 1.2 ? 1 : Math.max(0, (c.life - c.t) / 1.2);
    if (c.t >= c.life) { c.mesh.removeFromParent(); S.fpool.push(c.mesh); S.cracks.splice(i, 1); }
  }
  for (let i = S.cuts.length - 1; i >= 0; i--) {
    const c = S.cuts[i], u = c.mesh.material.uniforms;
    c.t += dt;
    u.uT.value = Math.min(1, c.t / 0.08);
    u.uFade.value = c.t < 0.16 ? 1 : Math.max(0, 1 - (c.t - 0.16) / 0.22);
    if (c.z) c.mesh.position.copy(c.z.pos).add(c.off);
    if (c.t >= 0.38) { c.mesh.visible = false; S.cuts.splice(i, 1); }
  }
}

// ------------------------------------------------------------------------------------------ hits
const SEVER_HI = ['neck', 'neck', 'upperarm_l', 'upperarm_r'], SEVER_ANY = ['neck', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'], SEVER_ARM = ['upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'];
/**
 * One blow on a zombie (local player): damage + HUD + meters. `skill` tags a skill's own hits (the axe skin, no 戰意
 * refund: the meter is earned by the axe strokes); `fury` adds its own refund instead (天墜 +2 per target).
 */
function strike(ws, g, z, dmg, dir, { knock = 3.5, stagger = 0.7, sever = null, point = null, tag = 'cleave', head = false, skill = null, light = false, fury = null, explosive = false, blood = 1 } = {}) {
  const ar = g.arsenal;
  const p = point || z.center(V3());
  const amount = dmg * (ar?.dmgMul ?? 1) * (head ? ws.def.head ?? 1.5 : 1), hp0 = z.hp ?? 0;
  let box = sever && amount >= hp0 * 0.98 ? (head ? 'neck' : sever[(R() * sever.length) | 0]) : sever && amount > (z.maxHp ?? 999) * 0.45 && R() < 0.35 ? SEVER_ARM[(R() * 4) | 0] : undefined;
  if (!box && head && amount >= hp0) box = 'neck';
  if (!box && light && hp0 > 0 && amount >= hp0 * 1.6) box = SEVER_ARM[(R() * 4) | 0];
  const info = { amount, part: head ? 'head' : 'body', headshot: head, point: p, normal: dir.clone().negate(), dir: dir.clone(), knock: knock * (ar?.knockMul ?? 1), stagger,
    weapon: ID, shooter: g.localId, melee: true, box, ss: tag, explosive, blood };
  if (skill) info.skill = skill;
  const f0 = skill || fury != null ? ws.sp?.m?.fury : undefined;
  const res = z.damage(info);
  g.hud?.onHit?.(info, res, z);
  ar?._special?.(ws, 'onHit', info, res, z);
  if (f0 !== undefined && ws.sp.m.fury > f0) ws.sp.m.fury = f0;
  if (fury && res && (res.damage > 0 || res.killed)) meterAdd(ws, 'fury', fury);
  if (res?.killed) {
    if (box) { z.sever?.(box, dir); sfx(g, 'greataxe_sever', { pos: p, volume: 0.75 }); }
    launch(z, dir, tag);
  }
  return res;
}
/**
 * Great-axe kill weight: the body is thrown along the blow (the overhead chop slams it down and it bounces), the
 * death clip skips its upright first beat and plays fast (no corpse left standing after a hit like that).
 */
function launch(z, dir, tag) {
  if (!z.kvel || z.def?.boss) return;
  const k = { cleave: [4.2, 3.2], backhand: [4.2, 3.6], mountain: [2.2, 1.6], fissure: [2.5, 3.5], leap: [5.5, 5.2], ring: [4.5, 3.2], spin: [5, 3.4], throw: [6, 3.6], ult: [8, 6.5] }[tag] || [4, 3.5];
  z.kvel.x += dir.x * k[0]; z.kvel.z += dir.z * k[0];
  z.kvel.y = Math.max(z.kvel.y || 0, k[1] * (0.85 + R() * 0.3));
  const a = z.action, d = a?.getClip?.().duration;
  if (d) { a.time = Math.min(d * 0.3, 0.32); a.timeScale = Math.max(a.timeScale, 1.6); }
}
/** zombies inside a horizontal sector round the eye (arc 360 = all round), not behind a wall */
function inSector(g, eye, fwd, r, arc, { dy = 2.4 } = {}) {
  const out = [];
  for (const z of g.zombies?.list || []) {
    if (!z.alive) continue;
    const zc = z.center(V3());
    const dx = zc.x - eye.x, dz = zc.z - eye.z, d = Math.hypot(dx, dz);
    if (d > r + (z.radius ?? 0.4) || Math.abs(zc.y - eye.y) > dy + (z.def?.boss ? 3 : 0)) continue;
    const ang = d < 1e-3 ? 0 : Math.acos(clamp((dx * fwd.x + dz * fwd.z) / d, -1, 1)) * 180 / Math.PI;
    if (arc < 360 && ang > arc / 2 + (d < 1.2 ? 35 : 6)) continue;
    const dir = _c.copy(zc).sub(eye), dl = dir.length();
    dir.multiplyScalar(1 / Math.max(1e-3, dl));
    const wh = g.world?.collision?.raycast(eye, dir, dl);
    if (wh && wh.dist < dl - 0.6) continue;
    const side = (fwd.x * dz - fwd.z * dx) < 0 ? 1 : -1;   // + = right of the view
    out.push({ z, d, ang, side, zc });
  }
  return out;
}
// where the axe head crosses each target relative to the eye: [height at the eye, rise per side (+ = higher on the
// right)]; at or above the neck it is a head hit (head damage, the decapitation, the headshot kill feedback)
const BLADE_Y = { cleave: [-0.3, 0.42], backhand: [-0.34, 0.4] };
/** a combo swing connecting: everything in the arc; one swing sound, a flesh layer per body, a kill per kill */
function sweep(ws, g, c, sweepDir) {
  const eye = _d.copy(g.camera.position), fwd = eyeFwd(g, _e, V3());
  const list = inSector(g, eye, fwd, c.r, c.arc);
  const look = g.camera.getWorldDirection(V3()), tanP = Math.tan(Math.asin(clamp(look.y, -0.95, 0.95))), [by, rise] = BLADE_Y[c.id] || [-0.3, 0];
  let kills = 0, n = 0, heads = 0, first = null;
  list.sort((a, b) => a.ang - b.ang);
  for (const { z, zc, side, d } of list) {
    const dir = V3().subVectors(zc, eye).setY(0).normalize();
    dir.addScaledVector(_c.crossVectors(UP, dir), 0.65 * sweepDir).normalize();   // carried along the sweep
    const bladeY = eye.y + by + tanP * d + rise * side * Math.min(1, d / 2.2);
    const head = !z.def?.boss && bladeY >= z.pos.y + (z.height ?? 1.8) * 0.8;
    const res = strike(ws, g, z, c.dmg, dir, { knock: c.knock, stagger: c.stagger, sever: SEVER_HI, tag: c.id, head, light: true, blood: n < 3 ? 1 : 0.3 });
    n++; if (head) heads++;
    if (res?.killed) kills++;
    if (!first) first = zc.clone();
    hitBurst(g, zc, dir, n <= 3 ? 1 : 0.45, n <= 1 ? 1 : n <= 3 ? 0.5 : 0);
    if (n <= 3) sfx(g, 'greataxe_hit_flesh', { pos: zc, volume: 0.8 - n * 0.1, pitch: 0.88 + R() * 0.2, delay: (n - 1) * 0.015 });
    if (res?.killed && kills <= 2) sfx(g, 'greataxe_kill', { pos: zc, volume: 0.65, delay: (kills - 1) * 0.04 });
  }
  if (n) {
    g.arsenal?._trailHit?.();                              // §1.17 the rest of the swing burns molten
    arcSparks(g, 14 + Math.min(10, n * 3));
    stop(g, kills >= 2 || (heads && kills) ? 0.12 : 0.075);
    shake(g, 0.16 + Math.min(0.2, n * 0.04));
    g.punch?.impulse?.(-1.3 * 0.0175, sweepDir * 1.1 * 0.0175, sweepDir * 1.6 * 0.0175);
    g.vm?.kick?.({ back: 0.03, up: 2.6, side: 1.6 * sweepDir, roll: 2.4 });
    g.arsenal?.fovKick?.(-1.2, 0.16);
    sfx(g, 'greataxe_hit', { pos: first, volume: 1 });
    haptic(28);
  } else wallClang(ws, g, eye, fwd, c.r);
  return n;
}
/** a swing that met no zombie but a wall within reach: sparks and a clang */
function wallClang(ws, g, eye, fwd, r) {
  const d = _c.copy(fwd); d.y = -0.15; d.normalize();
  const wh = g.world?.collision?.raycast(eye, d, r * 0.85);
  if (!wh) return;
  g.fx?.impact?.(wh.surf, wh.point, wh.normal, d, { big: 1 });
  g.fx?.sparkBurst?.(wh.point, { color: WHITE, color1: CRIM, count: 18, speed: 6, glow: 0.5, normal: wh.normal });
  sfx(g, 'greataxe_hit_wall', { pos: wh.point });
  shake(g, 0.1);
  haptic(16);
}
/** additive spark streaks along the edge's arc in the viewmodel (a blow that connects): flung along the swing */
function arcSparks(g, n) {
  const vm = g.vm, v = ssOf(g.arsenal.current).view, P = g.fx?.particles, a = vm.socketCam('edge', _a), b = vm.socketCam('hornU', _b);
  if (!a || !b || !P) return;
  const sv = v.hornV || _c.set(0, 0, 0);
  for (let i = 0; i < n; i++) {
    const u = 0.15 + R() * 0.85, x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, z = a.z + (b.z - a.z) * u, k = 0.35 + R() * 0.5;
    P.spawn({ additive: true, vm: true, x, y, z, vx: sv.x * k + (R() - 0.5) * 0.5, vy: sv.y * k + (R() - 0.3) * 0.4, vz: sv.z * k + (R() - 0.5) * 0.3, life: 0.12 + R() * 0.12,
      size: 0.0035 + R() * 0.003, stretch: 0.03, color: [...WHITE, 1], color1: [...CRIM, 0], frame: FRAME.spark, gravity: 1.5, drag: 3 });
  }
}
/** bronze sparks, a molten streak, blood chunks and bone chips where the edge bites (gk: the glint, thinned on
 *  multi-hits so the middle of the screen stays readable) */
function hitBurst(g, p, dir, k = 1, gk = 1) {
  const P = g.fx?.particles;
  if (!P) return;
  for (let i = 0; i < 12 * k; i++) {
    _c.set(R() - 0.5, R() * 0.9 - 0.2, R() - 0.5).multiplyScalar(5.5).addScaledVector(dir, 3.5);
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: _c.x, vy: _c.y, vz: _c.z, life: 0.22 + R() * 0.25, size: 0.026, stretch: 0.028, color: [...SPARK, 1], color1: [...CRIM, 0], frame: FRAME.spark, gravity: 7, drag: 2 });
  }
  for (let i = 0; i < 5 * k; i++) {   // chunks and chips (lit, falling)
    _c.set(R() - 0.5, R() * 0.8, R() - 0.5).multiplyScalar(3).addScaledVector(dir, 2.5);
    const bone = i % 3 === 0;
    P.spawn({ x: p.x, y: p.y, z: p.z, vx: _c.x, vy: _c.y + 1, vz: _c.z, life: 0.7 + R() * 0.4, size: bone ? 0.022 : 0.035, color: bone ? [0.75, 0.7, 0.6, 1] : [0.28, 0.02, 0.02, 1], color1: bone ? [0.6, 0.55, 0.48, 1] : [0.2, 0.01, 0.01, 1],
      frame: bone ? FRAME.shard : FRAME.rock, lit: true, gravity: 12, spin: (R() - 0.5) * 16, rot: R() * 6, collide: true, bounce: 0.2 });
  }
  if (gk > 0) P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.12, size: 0.36 * k * gk, size1: 0.6 * k * gk, color: [...WHITE, 0.9], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() * 6 });
  if (gk > 0) P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.18, size: 0.3 * k, size1: 0.65 * k, color: [...CRIM, 0.6], color1: [0, 0, 0, 0], frame: FRAME.glow });
}
/** KE_CLEAVE: a molten cut across the body along the blow, embers and bronze sparks rising (≤ 3 cuts alive); the
 *  n-th kill of one frame gets a smaller glint, no cut past the second, embers only past the third */
function cleaveKill(g, z, dir, n = 1) {
  const S = sys(g), cam = g.camera, c = z.center(V3());
  const m = n <= 2 ? S.cutPool.find((x) => !x.visible) || S.cuts.shift()?.mesh : null;
  if (m) {
    const L = 1.0 + R() * 0.4, ang = (R() - 0.5) * 1.1 + (dir.x * cam.matrixWorld.elements[0] + dir.z * cam.matrixWorld.elements[2] > 0 ? 0.5 : -0.5);
    m.quaternion.copy(cam.quaternion).multiply(_q.setFromAxisAngle(_d.set(0, 0, 1), ang));
    _e.set(1, 0, 0).applyQuaternion(m.quaternion);
    m.position.copy(c).addScaledVector(_e, -L / 2);
    m.scale.set(L, 0.2, 1);
    m.visible = true;
    S.cuts.push({ mesh: m, t: 0, z, off: m.position.clone().sub(z.pos) });
  }
  const P = g.fx?.particles;
  for (let i = 0; i < (n > 3 ? 4 : 9); i++) {
    const a = R() * 6.28, r = R() * 0.32;
    P?.spawn({ additive: true, x: c.x + Math.cos(a) * r, y: c.y - 0.3 + R() * 0.7, z: c.z + Math.sin(a) * r, vx: (R() - 0.5) * 0.6, vy: 0.8 + R() * 1.4, vz: (R() - 0.5) * 0.6, delay: 0.08 + R() * 0.25,
      life: 0.7 + R() * 0.6, size: 0.035 + R() * 0.04, size1: 0.008, color: [...EMBER, 1], color1: [...DEEP, 0], frame: i % 3 ? FRAME.glow : FRAME.spark, drag: 1.3, spin: (R() - 0.5) * 4 });
  }
  if (n > 3) return;
  const gk = 1 / (1 + 0.6 * (n - 1));
  P?.spawn({ additive: true, x: c.x, y: c.y, z: c.z, life: 0.2, size: 0.8 * gk, size1: 1.3 * gk, color: [...CRIM, 0.7], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() * 6 });
  if (n <= 1) g.fx?.lights?.flash?.(c, '#ff5a2a', 1.2, 2.2, 0.1);
}
/** chips of street flying off a strike (lit, gravity, bouncing) */
function rubble(g, p, n, speed, rng = R) {
  const P = g.fx?.particles;
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.283, s = speed * (0.4 + rng() * 0.8);
    P?.spawn({ x: p.x, y: p.y + 0.05, z: p.z, vx: Math.cos(a) * s * 0.5, vy: s * (0.6 + rng() * 0.8), vz: Math.sin(a) * s * 0.5, life: 0.9 + rng() * 0.6, size: 0.035 + rng() * 0.055,
      color: [0.42, 0.4, 0.38, 1], color1: [0.36, 0.34, 0.32, 1], frame: FRAME.rock, lit: true, gravity: 12, spin: (rng() - 0.5) * 14, rot: rng() * 6, collide: true, bounce: 0.3 });
  }
}
/** a burst of embers + a glint (impacts) */
function emberBurst(g, p, n, rng = R, k = 1) {
  const P = g.fx?.particles;
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.283, s = (1.5 + rng() * 3.5) * k;
    P?.spawn({ additive: true, x: p.x, y: p.y + 0.2, z: p.z, vx: Math.cos(a) * s, vy: (1.5 + rng() * 3.5) * k, vz: Math.sin(a) * s, life: 0.6 + rng() * 0.7, size: 0.06 * k, size1: 0.01, color: [...EMBER, 1], color1: [...DEEP, 0], frame: i % 2 ? FRAME.spark : FRAME.glow, stretch: i % 2 ? 0.02 : 0, gravity: 3, drag: 1.1 });
  }
  P?.spawn({ additive: true, x: p.x, y: p.y + 0.4, z: p.z, life: 0.2, size: 1.1 * k, size1: 1.8 * k, color: [...CRIM, 0.8], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: rng() * 6 });
}
/** a shockwave ring on the ground: a crimson hairline + a white-hot inner ring + a dust ring at radius r (thick: a
 *  broad hot band and a ground shock under them, the big blows) */
function quakeRing(g, c, r, k = 1, rng = R, thick = false) {
  const fx = g.fx;
  fx?.shockwave?.(_a.set(c.x, c.y + 0.06, c.z), { normal: UP, r0: r * 0.35, r1: r, life: 0.42, color: thick ? [1.5, 0.16, 0.05] : CRIM, thin: !thick });
  fx?.shockwave?.(_a.set(c.x, c.y + 0.08, c.z), { normal: UP, r0: r * 0.2, r1: r * 0.75, life: 0.3, color: thick ? [3.2, 1.6, 0.8] : [4, 2.2, 1.1], thin: true });
  if (thick) fx?.ground?.add?.('shock', _a.set(c.x, c.y + 0.04, c.z), { r: r * 0.3, r1: r, life: 0.45, col: [2.0, 0.42, 0.14], width: Math.min(1.1, 0.25 + r * 0.08), ease: 0.4 });
  const nd = Math.round(10 * k);
  for (let i = 0; i < nd; i++) { const a = (i / nd) * 6.283 + rng() * 0.3; fx?.knockDust?.(_a.set(c.x + Math.cos(a) * r * 0.8, c.y, c.z + Math.sin(a) * r * 0.8), _b.set(Math.cos(a) * 7, 0, Math.sin(a) * 7), 0.9 * k); }
}

// ------------------------------------------------------------------------------------------ the axe's life (view)
function view(ws, g, dt) {
  const vm = g.vm, w = vm?.weapon, ss = ssOf(ws);
  if (!w?.parts?.fx_jaw || w.def !== ws.def) return;
  const v = ss.view;
  if (v.w !== w) { Object.assign(v, { w, t: 0, jaw: 0, flare: 0, emberT: 0.5, roarT: 0, glintT: 1 }); }
  v.t += dt;
  const hu = vm.socketCam('hornU', _d);
  if (hu && dt > 0) { if (v.hornP) (v.hornV || (v.hornV = V3())).copy(hu).sub(v.hornP).multiplyScalar(1 / dt); (v.hornP || (v.hornP = V3())).copy(hu); }
  if (!ss.hum && g.audio?.has?.('greataxe_idle')) ss.hum = sfx(g, 'greataxe_idle', { loop: true, volume: 0.08, fadeIn: 0.4 });
  const ready = canCast(ws, 'ult').ok, busy = ss.lockT > 0 || ss.mode === 'thrown';
  const charging = ss.mode === 'charge', st = charging ? ss.stage : 0, spinning = !!ss.spin, readyIdle = ready && !busy && !charging && !spinning;
  // ---- the jaw: half open at charge stage 1, wide at 2 (the roar), open in the whirl, a snap on each ready reminder
  v.roarT = Math.max(0, v.roarT - dt);
  const jaw = charging ? [0.2, 0.6, 1][st] : spinning ? 0.7 : v.roarT > 0 ? 1 : 0;
  v.jaw = damp(v.jaw, jaw, jaw > v.jaw ? 22 : 9, dt);
  const pj = psOf(vm, 'fx_jaw'); if (!pj.tw) pj.v = v.jaw;
  // ---- the projected crescent: full at charge stage 2 and in the whirl (clips drive their own on heavy blows)
  const fl = (charging && st >= 2) || spinning ? 1 : 0;
  v.flare = damp(v.flare, fl, fl ? 9 : 14, dt);
  const clipFlare = vm.clip.active && vm.clip.clip?.tracks?.['fx_flare.scale'];
  const kf = clipFlare ? 1 : Math.max(0.03, v.flare);
  psOf(vm, 'fx_flare').hidden = !clipFlare && v.flare < 0.03;
  w.parts.fx_flare.scale.set(1, kf, kf);
  XH.stage = st; XH.spin = spinning; XH.thrown = ss.mode === 'thrown';
  // ---- glow: the seam a step brighter a stage, the mouth core throbs (fast when charged / ready)
  const G = vm._glowMat;
  if (G) {
    const pulse = 0.5 + 0.5 * Math.sin(v.t * (st >= 2 ? 16 : readyIdle ? 5 : 2.6));
    G.glow_red = (charging ? 1.35 ** st : readyIdle ? 1.3 : 1) * (0.88 + 0.12 * Math.sin(v.t * 1.9));
    G.glow_orange = (charging ? 1 + 0.45 * st : spinning ? 1.6 : readyIdle ? 1.25 : 1) * (0.75 + 0.35 * pulse) * (v.roarT > 0 ? 1.8 : 1);
    G.glow_white = charging || spinning ? 1 + 0.4 * pulse : 1;
  }
  // ---- embers off the mouth and the seam (idle ≤ 8; charged: they stream into the open mouth)
  const P = g.fx?.particles;
  if (P && !busy && (v.emberT -= dt) <= 0) {
    v.emberT = charging ? 0.03 : readyIdle ? 0.16 : 0.45 + R() * 0.4;
    const m = vm.socketCam(charging || R() < 0.55 ? 'mouth' : 'edge', _a);
    if (m && charging) {
      const o = _b.set((R() - 0.5) * 0.4, (R() - 0.2) * 0.3, (R() - 0.5) * 0.2);
      P.spawn({ additive: true, vm: true, x: m.x + o.x, y: m.y + o.y, z: m.z + o.z, vx: -o.x * 4, vy: -o.y * 4, vz: -o.z * 4, life: 0.25, size: 0.008 + 0.003 * st, size1: 0.002, stretch: 0.02,
        color: [...EMBER, 1], color1: [...CRIM, 0.4], frame: FRAME.spark, rot: R() * 6 });
    } else if (m) P.spawn({ additive: true, vm: true, x: m.x + (R() - 0.5) * 0.03, y: m.y, z: m.z + (R() - 0.5) * 0.02, vx: (R() - 0.5) * 0.04, vy: 0.05 + R() * 0.06, vz: (R() - 0.5) * 0.03,
      life: 1.0 + R() * 0.6, size: 0.0045, size1: 0.001, color: [...EMBER, 1], color1: [...DEEP, 0], frame: FRAME.glow, inertia: 0.5 });
  }
  if (charging) chargeLife(ws, g, v, st, dt);
  // ---- ready (§1.7.1 beat 7): the mask roars (jaw snaps, a puff of fire), the eyes flash; again every 2.5 s
  if (ready && !busy) {
    if (!ss.readyN) { ss.readyN = true; ss.readyT = 0; roar(ws, g, 1); }
    else if ((ss.readyT += dt) >= 2.5) { ss.readyT = 0; if (g.hud?.settings?.readyReminder !== false) roar(ws, g, 0.5); }
  } else ss.readyN = false;
  if (readyIdle && (v.lightT = (v.lightT ?? 0) - dt) <= 0) { v.lightT = 0.12; const p = vm.socketWorld?.('mouth', _b); if (p) g.fx?.lights?.flash?.(p, '#ff4a1a', 0.8 + 0.4 * Math.sin(v.t * 5), 0.8, 0.15); }
}
/** the mask roars: the jaw snaps open, fire puffs from the mouth, the eyes flash (ready + reminders + clips) */
function roar(ws, g, k = 1) {
  const v = ssOf(ws).view, vm = g.vm, P = g.fx?.particles;
  v.roarT = 0.32 * (0.6 + 0.4 * k);
  vm.weapon?.premium?.fire?.(0.35 * k, 0.25);
  sfx(g, 'greataxe_jaw', { volume: 0.35 * k });
  const m = vm.socketCam('mouth', _a), d = vm.socketCam('head', _b);
  if (!m || !P) return;
  const out = _c.copy(m).sub(d || m).normalize();
  for (let i = 0; i < 10 * k; i++) P.spawn({ additive: true, vm: true, x: m.x, y: m.y, z: m.z, vx: out.x * 0.3 + (R() - 0.5) * 0.25, vy: 0.15 + R() * 0.25, vz: out.z * 0.3 + (R() - 0.5) * 0.1,
    life: 0.35 + R() * 0.3, size: 0.012, size1: 0.003, color: [...EMBER, 1], color1: [...CRIM, 0], frame: i % 2 ? FRAME.spark : FRAME.glow, stretch: i % 2 ? 0.015 : 0 });
  P.spawn({ additive: true, vm: true, x: m.x, y: m.y, z: m.z, life: 0.22, size: 0.05 * k, size1: 0.11 * k, color: [...CRIM, 0.9], color1: [0, 0, 0, 0], frame: FRAME.glow });
  // 口前一團赤焰: a puff of flame rolling out of the mouth towards the eye, a hot flash on the hands
  if (k >= 0.9) {
    const toEye = _e.copy(m).negate().normalize();
    for (let i = 0; i < Math.round(9 * k); i++) {
      const sp = 0.25 + R() * 0.35;
      P.spawn({ additive: true, vm: true, x: m.x, y: m.y, z: m.z, vx: (out.x * 0.6 + toEye.x * 0.4) * sp + (R() - 0.5) * 0.12, vy: 0.12 + R() * 0.2, vz: (out.z * 0.6 + toEye.z * 0.4) * sp + (R() - 0.5) * 0.08,
        life: 0.3 + R() * 0.15, size: 0.025 * k, size1: 0.07 * k, color: [3.2, 1.25, 0.4, 0.9], color1: [1.2, 0.1, 0.03, 0], frame: FRAME.fire, frames: 8, fps: 24, frameOffset: R() * 7, rot: R() * 6, drag: 2.5 });
    }
    const wp = vm.socketWorld?.('mouth', _f);
    if (wp) g.fx?.lights?.flash?.(wp, '#ff5a1a', 3 * k, 2, 0.18);
  }
  for (const s of ['eyes']) { const e = vm.socketCam(s, _d); if (e) P.spawn({ additive: true, vm: true, x: e.x, y: e.y, z: e.z, life: 0.25, size: 0.04, size1: 0.09, color: [...CRIM, 1], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() }); }
}
/** while charging: the edge throbs, sparks crawl along the crescent, stage 2 lights the hands */
function chargeLife(ws, g, v, st, dt) {
  const vm = g.vm, P = g.fx?.particles;
  if (!P) return;
  if ((v.crawlT = (v.crawlT ?? 0) - dt) <= 0) {
    v.crawlT = 0.05 - 0.012 * st;
    const a = vm.socketCam('hornL', _a), b = vm.socketCam('hornU', _b);
    if (a && b) {
      const u = R(), p = _c.copy(a).lerp(b, u);
      P.spawn({ additive: true, vm: true, x: p.x, y: p.y, z: p.z, vx: (b.x - a.x) * (R() - 0.5), vy: (b.y - a.y) * (R() - 0.5), vz: 0, life: 0.18, size: 0.006 + 0.003 * st, stretch: 0.02,
        color: [...WHITE, 1], color1: [...CRIM, 0], frame: FRAME.spark });
    }
  }
  if (st >= 2 && (v.handT = (v.handT ?? 0) - dt) <= 0) {
    v.handT = 0.08;
    const p = vm.socketWorld?.('mid', _c);
    if (p) g.fx?.lights?.flash?.(p, '#ff4a1a', 4 + 2.5 * Math.sin(v.t * 16), 1.6, 0.11);
    if ((v.throbT = (v.throbT ?? 0) - dt * 10) <= 0) { v.throbT = 4; vm.weapon?.premium?.fire?.(0.3, 0.2); }
  }
}

// ------------------------------------------------------------------------------------------ combo / leap driver
const COMBO_CLIP = ['greataxe_cleave', 'greataxe_backhand', 'greataxe_mountain'];
function startSwing(ws, g, step) {
  const ss = ssOf(ws), c = ws.def.special.combo[step], ar = g.arsenal;
  ss.mode = 'swing'; ss.step = step; ss.cur = c; ss.t = 0; ss.hit = false; ss.chainT = 0;
  ar.sinceShot = 0;
  ar.playClip(COMBO_CLIP[step], { duration: c.dur });
  sfx(g, step === 2 ? 'greataxe_swing_heavy' : 'greataxe_swing', { volume: 0.95, delay: c.hit * 0.5 });
  g.noise?.(g.camera.position, 12);
}
function vignette(g, k) {
  const post = g.renderer?.post;
  if (!post) return;
  if (g._gaVig == null) g._gaVig = post.vignette ?? 0;
  post.vignette = g._gaVig + k;
  if (k === 0) g._gaVig = null;
}
function startCharge(ws, g) {
  const ss = ssOf(ws), ar = g.arsenal;
  ss.mode = 'charge'; ss.ct = 0; ss.stage = 0; ss.t = 0;
  ar.sinceShot = 0;
  ar.playClip('greataxe_charge', { duration: 2.4 });
  g.vm.clip.hold = true;
  ss.chargeSnd = sfx(g, 'greataxe_charge', { loop: true, volume: 0.5 });
  ss.chargeSnd?.setRate?.(0.8);
}
/**
 * The 天墜 strike point for a charge stage (the reticle: where the axe will bite): the crosshair on the street; else
 * a zombie it rests on; else the densest cluster in a 30° cone; else a wall's foot or the full reach ahead. Clamped
 * to 2.6 m .. the stage's reach.
 */
function leapTarget(ws, g, st, out) {
  const p = ws.def.special.leap, cam = g.camera, eye = cam.position, dir = cam.getWorldDirection(_c);
  const reach = p.range[st], feet = g.player?.pos || eye;
  const fh = _e.set(dir.x, 0, dir.z); if (fh.lengthSq() < 1e-6) fh.set(0, 0, -1); fh.normalize();
  const hit = g.world?.collision?.raycast(eye, dir, reach + 3);
  let pt = null;
  if (hit && hit.normal.y > 0.55) pt = _d.copy(hit.point);
  if (!pt) { const z = pinned(g, eye, dir, reach + 2); if (z) pt = _d.set(z.pos.x, z.pos.y, z.pos.z); }
  if (!pt) { const c = clusterAim(g, eye, fh, reach + 1); if (c) pt = _d.copy(c); }
  if (!pt) pt = hit ? _d.copy(hit.point).addScaledVector(dir, -0.6) : _d.copy(eye).addScaledVector(fh, reach);
  const dx = pt.x - feet.x, dz = pt.z - feet.z, dh = Math.hypot(dx, dz) || 1, k = clamp(dh, 2.6, reach) / dh;
  out.set(feet.x + dx * k, pt.y + 1.2, feet.z + dz * k);
  out.y = floorAt(g, out);
  if (Math.abs(out.y - feet.y) > 4) out.y = feet.y;
  return out;
}
const BITE_D = 1.8;   // the axe bites the street this far ahead of the feet (天墜 lands the feet short of the reticle)
function releaseLeap(ws, g) {
  const ss = ssOf(ws), ar = g.arsenal, p = ws.def.special.leap, pl = g.player, st = ss.stage;
  ss.chargeSnd?.stop?.(0.1); ss.chargeSnd = null;
  ar.fovHold(0, 0.2);
  vignette(g, 0);
  if (!pl) { ss.mode = 'idle'; return; }
  const bite = leapTarget(ws, g, st, V3()), from = pl.pos.clone();
  const hd = _b.set(bite.x - from.x, 0, bite.z - from.z), dl = hd.length() || 1;
  const to = from.clone().addScaledVector(hd.multiplyScalar(1 / dl), Math.max(0.8, dl - BITE_D));
  to.y = bite.y + 1.2; to.y = floorAt(g, to); if (Math.abs(to.y - from.y) > 4) to.y = from.y;
  const Tf = p.flight[st], apex = p.apex[st] + Math.max(0, to.y - from.y);
  ss.leap = { from, to, bite, Tf, apex, t: 0, st, landed: false };
  ss.mode = 'leap'; ss.t = 0; ss.fresh = false;
  pl.onGround = false;
  if (g.status) g.status.invuln = Math.max(g.status.invuln || 0, Tf + p.invuln);
  // (the clip runs a frame ahead of the arc: the bite pose lands on the touchdown frame)
  ar.playClip('greataxe_leap', { duration: Tf + 0.5, flight: (Tf - 1 / 60) / (Tf + 0.5) });
  ar.fovKick(5, Tf * 0.8);
  sfx(g, 'greataxe_leap', { volume: 0.9 });
  sfx(g, 'greataxe_swing_heavy', { volume: 0.9, delay: Tf * 0.55 });
  haptic(20);
}
/** the ballistic arc: the controller is steered onto it every frame (collision still resolves walls); the smash goes
 *  off on the frame the feet touch down (落地同幀砸地) */
function leapUpdate(ws, g, dt) {
  const ss = ssOf(ws), L = ss.leap, pl = g.player;
  if (!L || !pl) return;
  L.t += dt;
  const u = Math.min(1, L.t / L.Tf), u2 = Math.min(1, (L.t + dt) / L.Tf);
  if (u >= 1 || (L.t > 0.12 && pl.onGround) || !g.status?.alive) { land(ws, g); return; }
  const y = (k) => L.from.y + (L.to.y - L.from.y) * k + 4 * L.apex * k * (1 - k);
  const nx = L.from.x + (L.to.x - L.from.x) * u2, nz = L.from.z + (L.to.z - L.from.z) * u2;
  const h = Math.max(dt, 1 / 240);
  pl.vel.set((nx - pl.pos.x) / h, (y(u2) - pl.pos.y) / h + G_PLAYER * h, (nz - pl.pos.z) / h);
  pl.onGround = false;
  // the marker stays on the strike point, brightening as the axe comes down
  const mk = sys(g).marker;
  mk.visible = true; mk.position.set(L.bite.x, L.bite.y + 0.03, L.bite.z);
  mk.material.uniforms.uAmt.value = 0.6 + 0.6 * u;
}
function land(ws, g) {
  const ss = ssOf(ws), L = ss.leap, pl = g.player, p = ws.def.special.leap;
  if (!L || L.landed) return;
  L.landed = true;
  pl.vel.x *= 0.1; pl.vel.z *= 0.1; if (pl.vel.y > 0) pl.vel.y = 0;
  // the smash is where the head bites on screen: BITE_D ahead along the view (short of a wall)
  const fwd = eyeFwd(g, _a, V3()), eye = g.camera.position;
  const wh = g.world?.collision?.raycast(_b.set(eye.x, pl.pos.y + 0.6, eye.z), fwd, BITE_D + 0.3);
  const at = pl.pos.clone().addScaledVector(fwd, wh ? Math.max(0.6, wh.dist - 0.3) : BITE_D); at.y = floorAt(g, at);
  const ev = { type: 'skill', id: 'greataxe_smash', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [at.x, at.y, at.z], dir: [fwd.x, 0, fwd.z], by: g.localId, ph: 0, st: L.st };
  startSkill(g, ev, { ws, local: true });
  g.net?.sendSkill?.(ev);
  sys(g).marker.visible = false;
  ss.mode = 'recover'; ss.t = ws.def.special.recover - 0.5; ss.step = -1; ss.lockT = 0.4;
  ss.leapCd = p.cd;
  if (g.status) g.status.invuln = Math.max(g.status.invuln || 0, p.invuln);
}
function driver(ws, dt, g) {
  const ss = ssOf(ws), p = ws.def.special, ar = g.arsenal;
  runQueue(ss, dt);
  ss.buf = Math.max(0, ss.buf - dt);
  if (ss.pressing) ss.pressT += dt;
  ss.lockT = Math.max(0, ss.lockT - dt);
  ss.leapCd = Math.max(0, ss.leapCd - dt);
  if (ss.mode === 'swing') {
    ss.t += dt;
    const c = ss.cur;
    if (!ss.hit && ss.t >= c.hit) { ss.hit = true; if (ss.step === 2) mountain(ws, g, c); else sweep(ws, g, c, ss.step === 1 ? -1 : 1); }
    if (ss.t >= c.dur) {
      ss.mode = 'recover'; ss.t = 0; ss.chainT = p.chain;
      if (ss.step === 2) {
        // 收招 after the third: the axe swung onto the shoulder (1 in 8: left standing in the street), any input cancels
        ss.combos++;
        ar.playClip(ss.combos % 8 === 0 ? 'greataxe_recover_rare' : 'greataxe_recover', { duration: ss.combos % 8 === 0 ? p.recover + 0.4 : p.recover });
        ss.step = -1;
      }
    }
  } else if (ss.mode === 'recover') {
    ss.t += dt;
    if (ss.chainT > 0 && (ss.chainT -= dt) <= 0) ss.step = -1;
    if (ss.t >= p.recover) ss.mode = 'idle';
  } else if (ss.mode === 'charge') {
    ss.ct += dt;
    g.vm.clip.hold = true;
    const st = p.leap.stages.filter((x) => ss.ct >= x).length;
    if (st > ss.stage) {
      ss.stage = st;
      sfx(g, st >= 2 ? 'greataxe_charge_full' : 'greataxe_charge_stage', { volume: 0.65, pitch: st === 1 ? 1 : 1.122 });
      haptic(12);
      ar.fovHold(-st, 0.2);
      vignette(g, 0.07 * st);
      g.vm?.weapon?.premium?.fire?.(0.45 + 0.25 * st, 0.3);
      roar(ws, g, 0.6 + 0.4 * st);
    }
    ss.chargeSnd?.setRate?.(0.8 + 0.45 * Math.min(1, ss.ct / p.leap.stages[1]));
    // the landing reticle on the ground at the crosshair
    const mk = sys(g).marker, to = leapTarget(ws, g, ss.stage, _mk);
    mk.visible = true; mk.position.set(to.x, to.y + 0.03, to.z);
    mk.scale.setScalar(p.leap.r[ss.stage]);
    const u = mk.material.uniforms; u.uStage.value = ss.stage; u.uAmt.value = damp(u.uAmt.value, 0.55 + 0.2 * ss.stage, 10, dt);
    if (!g.status?.alive) { mk.visible = false; ss.mode = 'idle'; }
  } else if (ss.mode === 'leap') leapUpdate(ws, g, dt);
}

// ------------------------------------------------------------------------------------------ 開山 overhead chop + fissure
function mountain(ws, g, c) {
  const eye = _a.copy(g.camera.position), fwd = eyeFwd(g, _e, V3());
  let reach = c.reach;
  const wh = g.world?.collision?.raycast(eye, fwd, reach + 0.3);
  if (wh) reach = Math.max(0.8, wh.dist - 0.3);
  const at = V3().copy(eye).addScaledVector(fwd, reach);
  at.y = floorAt(g, at);
  let n = 0, kills = 0;
  for (const z of g.zombies?.list || []) {
    if (!z.alive) continue;
    const zc = z.center(V3()), rel = _b.set(zc.x - eye.x, 0, zc.z - eye.z);
    const along = rel.dot(fwd), lat = Math.abs(rel.x * fwd.z - rel.z * fwd.x), dAt = Math.hypot(zc.x - at.x, zc.z - at.z);
    // the bite (r) or the axe's path from the eye to it (a 0.9 m wide lane)
    if (!(dAt <= c.r + (z.radius ?? 0.4) || (along > 0.2 && along < reach && lat < 0.9)) || Math.abs(zc.y - at.y) > 2.6) continue;
    const dir = V3().set(zc.x - eye.x, 0, zc.z - eye.z).normalize();
    const res = strike(ws, g, z, c.dmg * (dAt < c.r * 0.6 || lat < 0.6 ? 1 : 0.75), dir, { knock: c.knock, stagger: 1, sever: SEVER_ANY, tag: 'mountain', head: !z.def?.boss && lat < 0.45 && along < reach + 0.4, blood: n < 3 ? 1 : 0.3 });
    hitBurst(g, zc, dir, n < 3 ? 1.3 : 0.5, n < 2 ? 1 : n < 4 ? 0.5 : 0);
    n++; if (res?.killed) kills++;
  }
  const ev = { type: 'skill', id: 'greataxe_fissure', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [at.x, at.y, at.z], dir: [fwd.x, 0, fwd.z], by: g.localId, ph: 0 };
  startSkill(g, ev, { ws, local: true });
  g.net?.sendSkill?.(ev);
  if (n) { g.arsenal?._trailHit?.(); arcSparks(g, 18); }
  stop(g, kills >= 2 ? 0.13 : n ? 0.11 : 0.07);
  shake(g, 0.35);
  g.punch?.impulse?.(-3.2 * 0.0175, 0, (R() - 0.5) * 0.02);
  g.vm?.kick?.({ back: 0.04, up: -3, side: 0, roll: 1.5 });
  g.arsenal?.fovKick?.(-2, 0.25);
  if (n) { sfx(g, 'greataxe_hit', { volume: 1 }); sfx(g, 'greataxe_hit_flesh', { volume: 0.9 }); }
  haptic(40);
}
registerSkill('greataxe_fissure', {
  level: 'L2', dur: 1.0,
  start(k) {
    const g = k.game, fx = g.fx, at = k.pos.clone(), dir = k.dir.clone().setY(0).normalize(), f = k.def.special.combo[2].fissure;
    const near = g.camera.position.distanceTo(at) < 5 ? 0.6 : 1;
    k.data = { at, dir, dist: 0, len: f.len, hit: new Set() };
    fx?.impact?.(0, _a.set(at.x, at.y + 0.02, at.z), UP, _b.set(dir.x, -1, dir.z).normalize(), { big: 1.6 });
    fx?.shockwave?.(_a.set(at.x, at.y + 0.06, at.z), { normal: UP, r0: 0.3, r1: 2.6, life: 0.32, color: CRIM, thin: true });
    for (let i = 0; i < 10 * near; i++) { const a = (i / 10) * 6.283 + k.rng() * 0.4; fx?.knockDust?.(_a.set(at.x + Math.cos(a) * 0.6, at.y, at.z + Math.sin(a) * 0.6), _b.set(Math.cos(a) * 5, 0, Math.sin(a) * 5), 1.1); }
    rubble(g, at, Math.round(14 * near), 5, k.rng);
    emberBurst(g, at, 12, k.rng, 0.9);
    fx?.decals?.add?.(_a.copy(at), UP, { frame: DECAL.concrete, size: 1.3, alpha: 1, life: 30 });
    fx?.decals?.add?.(_a.copy(at), UP, { frame: DECAL.scorch, size: 1.4, tint: DECAL_TINT.scorch, alpha: 0.5, life: 12 });
    fissure(g, at, dir, f.len, { width: 1.3, life: 2.6, speed: 18, rng: k.rng });
    fx?.lights?.flash?.(_a.set(at.x, at.y + 0.6, at.z), '#ff5a2a', 5, 5, 0.2);
    sfx(g, 'greataxe_chop_ground', { pos: at, volume: 1 });
  },
  update(k, dt) {
    const d = k.data, g = k.game;
    const prev = d.dist;
    d.dist = Math.min(d.len, d.dist + 18 * dt);
    if (k.rng() < 0.6) { const p = _a.copy(d.at).addScaledVector(d.dir, d.dist); p.y = floorAt(g, p); g.fx?.knockDust?.(p, _b.copy(d.dir).multiplyScalar(2), 0.6); rubble(g, p, 2, 2.5, k.rng); }
    if (!k.local || !k.ws) return d.dist < d.len;
    const f = k.def.special.combo[2].fissure;
    for (const z of g.zombies?.list || []) {
      if (!z.alive || d.hit.has(z)) continue;
      const zc = z.center(_a), rel = _b.set(zc.x - d.at.x, 0, zc.z - d.at.z);
      const along = rel.dot(d.dir), lat = Math.abs(rel.x * d.dir.z - rel.z * d.dir.x), zr = z.radius ?? 0.4;
      if (along < prev - zr || along > d.dist + zr || lat > f.width / 2 + zr || Math.abs(zc.y - d.at.y) > 2.2) continue;
      d.hit.add(z);
      strike(k.ws, g, z, f.dmg, V3().copy(d.dir).setY(0).normalize(), { knock: 2.5, stagger: 1, tag: 'fissure', skill: 'greataxe_fissure' });
      hitBurst(g, zc, d.dir, 0.8);
    }
    return true;
  },
});

// ------------------------------------------------------------------------------------------ 天墜 smash + three rings
registerSkill('greataxe_smash', {
  level: 'L2', dur: 0.75,
  start(k) {
    const g = k.game, fx = g.fx, st = k.ev.st ?? 0, p = k.def.special.leap, c = k.pos.clone(), r = p.r[st];
    const near = !k.local && g.camera.position.distanceTo(c) < 4 ? 0.55 : 1;   // (never thinned for the caster's own)
    k.data = { c, st, ring: 0, hit: [new Set(), new Set(), new Set()] };
    fx?.impact?.(0, _a.set(c.x, c.y + 0.02, c.z), UP, _b.set(0, -1, 0), { big: 2 + st * 0.4 });
    fx?.lights?.flash?.(_a.set(c.x, c.y + 0.8, c.z), '#ff6a3a', 9 + st * 3, 7 + st * 1.5, 0.22);
    fx?.particles?.spawn({ additive: true, x: c.x, y: c.y + 0.35, z: c.z, life: 0.1, size: 1.6 + st * 0.4, size1: 2.8 + st * 0.6, color: [5, 3.4, 2.2, 1], color1: [1.4, 0.12, 0.04, 0], frame: FRAME.glow });
    dustWall(g, c, 1.6 + st * 0.3, Math.round((14 + st * 5) * near), 0.85 + st * 0.15, k.rng);
    rubbleUp(g, c, Math.round((12 + st * 6) * near), 0.8 + st * 0.12, k.rng);
    const nd = Math.round((14 + st * 4) * near);
    for (let i = 0; i < nd; i++) { const a = (i / nd) * 6.283 + k.rng() * 0.3; fx?.knockDust?.(_a.set(c.x + Math.cos(a) * r * 0.45, c.y, c.z + Math.sin(a) * r * 0.45), _b.set(Math.cos(a) * 7, 0, Math.sin(a) * 7), 1.2 + st * 0.3); }
    rubble(g, c, Math.round((16 + st * 8) * near), 5 + st * 1.5, k.rng);
    emberBurst(g, c, Math.round((16 + st * 6) * near), k.rng, 1.2);
    fx?.decals?.add?.(_a.copy(c), UP, { frame: DECAL.concrete, size: 1.6 + st * 0.5, alpha: 1, life: 30 });
    fx?.decals?.add?.(_a.copy(c), UP, { frame: DECAL.scorch, size: 2.4 + st * 0.7, tint: DECAL_TINT.scorch, alpha: 0.6, life: 14 });
    // radial molten cracks
    for (let i = 0; i < 5 + st; i++) { const a = (i / (5 + st)) * 6.283 + k.rng() * 0.5; fissure(g, c, _a.set(Math.sin(a), 0, Math.cos(a)), r * (0.8 + k.rng() * 0.5), { width: 0.9, thick: 0.8, life: 2.8 + st * 0.6, speed: 30, rng: k.rng }); }
    quakeRing(g, c, r * 0.9, 1.2, k.rng, st >= 1);
    sfx(g, 'greataxe_land', { pos: c, volume: 1 });
    if (k.local && k.ws) {
      let n = 0;
      for (const z of g.zombies?.list || []) {
        if (!z.alive) continue;
        const zc = z.center(V3()), d = Math.hypot(zc.x - c.x, zc.z - c.z);
        if (d > r + (z.radius ?? 0.4) || Math.abs(zc.y - c.y) > 2.6) continue;
        const dir = V3().set(zc.x - c.x, 0, zc.z - c.z); if (dir.lengthSq() < 1e-4) dir.copy(k.dir); dir.normalize();
        // (blood mist and glints thin out past the third body: the middle of the screen stays readable)
        strike(k.ws, g, z, p.dmg[st] * Math.max(0.4, 1 - d / (r * 1.4)), dir, { knock: 6 + st * 1.5, stagger: 1, sever: SEVER_ANY, tag: 'leap', fury: 2, skill: 'greataxe_smash', explosive: n < 3, blood: n < 3 ? 1 : 0.3 });
        hitBurst(g, zc, dir, n < 4 ? 1.2 : 0.5, n < 2 ? 1 : n < 4 ? 0.5 : 0);
        n++;
      }
      stop(g, 0.1 + st * 0.015 + (n ? 0.02 : 0));
      shake(g, 0.4 + st * 0.1);
      g.punch?.impulse?.(-(2.6 + 0.5 * st), 0, (k.rng() - 0.5) * 0.15);   // the view slams down onto the crater (~5-7°)
      g.arsenal?.fovKick?.(-(2 + st), 0.3);
      if (st >= 2 && clipComfort.overlay) g.fx?.overlay?.radial?.(0.55, 0.2, RADIAL_THIN);
      haptic(40); setTimeout(() => haptic(40), 110);
    } else if (g.camera.position.distanceTo(c) < 15) shake(g, 0.2);
  },
  update(k) {
    const g = k.game, d = k.data, p = k.def.special.leap;
    // three shockwave rings, 0.12 s apart, each further out; each hits every target once
    while (d.ring < p.rings && k.t >= p.ringEvery * (d.ring + 1)) {
      const i = d.ring++, R1 = p.ringR[d.st] * (i + 1) / p.rings;
      quakeRing(g, d.c, R1, 0.8 + i * 0.2, k.rng, d.st >= 2);
      sfx(g, 'greataxe_quake', { pos: d.c, volume: 0.9 - i * 0.2, pitch: 1 - i * 0.08 });
      if (k.local && k.ws) {
        let any = false;
        for (const z of g.zombies?.list || []) {
          if (!z.alive || d.hit[i].has(z)) continue;
          const zc = z.center(V3()), dist = Math.hypot(zc.x - d.c.x, zc.z - d.c.z);
          if (dist > R1 + (z.radius ?? 0.4) || Math.abs(zc.y - d.c.y) > 2.4) continue;
          d.hit[i].add(z);
          const dir = V3().set(zc.x - d.c.x, 0, zc.z - d.c.z).normalize();
          strike(k.ws, g, z, p.ringDmg[d.st], dir, { knock: 5, stagger: 1, tag: 'ring', skill: 'greataxe_smash', blood: 0.35 });
          any = true;
        }
        if (any) shake(g, 0.12);
      }
    }
    return true;
  },
});
const RADIAL_THIN = { r0: 0.3, density: 0.32, thin: 0.55 };

// ------------------------------------------------------------------------------------------ 狂旋 whirlwind (◎ held)
const SPIN_TURN = 0.28;   // one turn of the whirl (s): the clip's loop, the blade ring's wake, the damage tick
registerSkill('greataxe_spin', {
  level: 'L2', channel: true, defaults: { r: 3.4, every: 0.28, dmg: 60, pull: 7, pullSpeed: 2.4, speedMul: 0.85, burst: 120, burstR: 4, burstKnock: 7 },
  start(k) {
    const g = k.game, d = k.data;
    d.vortex = vortexMesh({ r0: 2.3, r1: 3.7, h0: -1.55, h1: -1.1 }); d.vortex.visible = true; g.scene.add(d.vortex);
    d.ring = bladeRing(); d.ring.visible = true; g.scene.add(d.ring);
    d.tick = 0; d.dustT = 0; d.pass = 0;
    if (!k.local) { sfx(g, 'greataxe_spin_start', { pos: k.pos, volume: 0.7 }); return; }
    const ws = k.ws, ss = ssOf(ws);
    meterAdd(ws, 'fury', k.p.cost ?? 0, true);           // the 20 is a threshold, not a price (the drain is the price)
    if (ss.mode === 'thrown' || ss.mode === 'leap' || ss.mode === 'charge') { d.dead = true; return; }
    ss.spin = k; ss.mode = 'idle'; ss.step = -1; ss.lockT = 0;
    g.arsenal.playClip('greataxe_spin', { duration: SPIN_TURN / 0.86 });
    g.vm.clip.hold = true;
    sfx(g, 'greataxe_spin_start', { volume: 0.9 });
    d.loop = sfx(g, 'greataxe_spin', { loop: true, volume: 0.7 });
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p;
    if (d.dead) return false;
    const eye = k.caster(_a, _b), yaw = Math.atan2(-_b.x, -_b.z);
    d.vortex.position.copy(eye);
    d.vortex.material.uniforms.uAmt.value = Math.min(1, k.t / 0.15) * 0.45;
    d.vortex.rotation.y += dt * 2;
    // the blade ring at waist height, its wake on the axe's angle (the clip enters from the right at 0.12 of a turn)
    const ph = 0.25 + (k.t - 0.12 * SPIN_TURN / 0.86) / SPIN_TURN;
    d.ring.position.copy(eye); d.ring.rotation.y = yaw;
    d.ring.material.uniforms.uPhase.value = ((ph % 1) + 1) % 1;
    d.ring.material.uniforms.uAmt.value = Math.min(1, k.t / 0.12);
    if (k.local && g.punch && clipComfort.shake) g.punch.target.z = Math.sin(ph * Math.PI * 2) * 3.5 * D2R;   // the view rolls ~±1.5° with the whirl (the spring lags a 3.6 Hz target)
    // dust dragged round and in; ember and grit streaks spiralling in from ~7 m
    if ((d.dustT -= dt) <= 0) {
      d.dustT = 0.03;
      const fy = k.floorY(eye), a = k.rng() * 6.283, rr = 2.5 + k.rng() * 1.5;
      if (k.rng() < 0.5) g.fx?.knockDust?.(_c.set(eye.x + Math.cos(a) * rr, fy, eye.z + Math.sin(a) * rr), _d.set(-Math.sin(a) * 6 - Math.cos(a) * 2, 0, Math.cos(a) * 6 - Math.sin(a) * 2), 0.8);
      for (let i = 0; i < 3; i++) {
        const b = k.rng() * 6.283, r2 = 4.5 + k.rng() * 3, hot = i < 2;
        g.fx?.particles?.spawn({ additive: hot, x: eye.x + Math.cos(b) * r2, y: fy + 0.25 + k.rng() * 1.3, z: eye.z + Math.sin(b) * r2, vx: -Math.cos(b) * r2 * 1.7 - Math.sin(b) * 5, vy: 0.3, vz: -Math.sin(b) * r2 * 1.7 + Math.cos(b) * 5,
          life: 0.5, size: hot ? 0.06 : 0.04, size1: 0.015, color: hot ? [...EMBER, 1] : [0.5, 0.46, 0.4, 0.9], color1: hot ? [...CRIM, 0] : [0.45, 0.42, 0.38, 0], frame: hot ? FRAME.spark : FRAME.rock,
          stretch: hot ? 0.09 : 0.04, drag: 0.4, lit: !hot });
      }
    }
    if (!k.local) return true;
    const ws = k.ws, ss = ssOf(ws);
    g.status?.applySlow?.(0.08, p.speedMul);
    g.arsenal.sinceShot = 0;
    if (g.vm.clip.active) g.vm.clip.hold = true;
    // pull: a steady drag towards the axe (kvel decays at 7/s: adding pull·7·dt holds pull m/s)
    for (const z of g.zombies?.list || []) {
      if (!z.alive || z.def?.boss || z.puppet || !z.kvel) continue;
      const dx = eye.x - z.pos.x, dz = eye.z - z.pos.z, dist = Math.hypot(dx, dz);
      if (dist > p.pull || dist < 1.4) continue;
      z.kvel.x += dx / dist * p.pullSpeed * 7 * dt; z.kvel.z += dz / dist * p.pullSpeed * 7 * dt;
    }
    if ((d.tick -= dt) <= 0) {
      d.tick += p.every;
      d.pass++;
      const fwd = eyeFwd(g, _c, V3());
      let n = 0;
      for (const { z, zc } of inSector(g, eye, fwd, p.r, 360)) {
        const dir = V3().subVectors(zc, eye).setY(0).normalize();
        dir.addScaledVector(_d.crossVectors(UP, dir), 0.8).normalize();   // flung round the whirl
        strike(ws, g, z, p.dmg, dir, { knock: 2.5, stagger: 0.8, sever: SEVER_ARM, tag: 'spin', skill: 'greataxe_spin', blood: n < 3 ? 0.7 : 0.25 });
        if (n < 4) hitBurst(g, zc, dir, 0.45, 0);                // (a glow on every body every turn hazed the crowd red)
        n++;
      }
      if (n) {
        if ((d.stopT = (d.stopT ?? 0) - p.every) <= 0) { d.stopT = 0.5; stop(g, 0.04); }
        shake(g, 0.08 + Math.min(0.12, n * 0.02));
        sfx(g, 'greataxe_spin_hit', { volume: 0.7, pitch: 0.9 + k.rng() * 0.2 });
        haptic(14);
      }
    }
    if (ss.mode === 'thrown') return false;
    return true;
  },
  end(k) {
    const g = k.game, d = k.data, p = k.p;
    for (const m of [d.vortex, d.ring]) { m?.removeFromParent(); m?.geometry.dispose(); m?.material.dispose(); }
    d.loop?.stop?.(0.15);
    if (k.local && g.punch) g.punch.target.z = 0;
    if (!k.local || d.dead) return;
    const ws = k.ws, ss = ssOf(ws);
    ss.spin = null;
    g.vm.clip.hold = false;
    // let go after 0.8 s: the whirl bursts outward
    if (k.t >= 0.8 && held(g, ws) && g.status?.alive) {
      const eye = k.caster(V3(), V3()), fy = k.floorY(eye), c = V3().set(eye.x, fy, eye.z);
      quakeRing(g, c, p.burstR + 0.5, 1.2, k.rng);
      sweepArc(g, _c.set(eye.x, eye.y, eye.z), 0, { r0: 1.2, r1: p.burstR + 0.3, h0: -1.2, h1: -0.6, arc: Math.PI * 2 }, { t0: 0, t1: 0.18, span: 0.6, fade: 0.25, amt: 0.8 });
      emberBurst(g, c, 18, k.rng, 1);
      for (const { z, zc } of inSector(g, eye, eyeFwd(g, _d, V3()), p.burstR, 360)) {
        const dir = V3().subVectors(zc, eye).setY(0).normalize();
        strike(ws, g, z, p.burst, dir, { knock: p.burstKnock, stagger: 1, sever: SEVER_ANY, tag: 'spin', skill: 'greataxe_spin' });
      }
      stop(g, 0.07); shake(g, 0.3);
      g.arsenal.playClip('greataxe_spin_end', { duration: 0.6 });
      sfx(g, 'greataxe_spin_end', { volume: 1 });
      haptic(40);
    } else if (held(g, ws)) g.arsenal.playClip('greataxe_spin_out', { duration: 0.35 });
  },
});

// ------------------------------------------------------------------------------------------ 迴戚 the thrown axe (★ tap)
// The real axe (world materials) leaves the hands at RELEASE: out along the aim at `speed` up to `range` (a wall ends it),
// a beat hanging there, then a curve back that bulges `bulge` m to the right of the out line into the caster's hands.
// Every client flies the same path from the event (the return chases the caster's live position); the caster's
// client deals the damage: everything within r of the path, once each way.
const RELEASE = 0.2;
registerSkill('greataxe_throw', {
  level: 'L2', dur: 6, defaults: { speed: 24, range: 16, r: 1.1, dmg: 180, back: 140, hang: 0.15, bulge: 3 },
  start(k) {
    const g = k.game, d = k.data;
    const dir = k.dir.clone();
    dir.y = clamp(dir.y, -0.3, 0.3); dir.normalize();
    Object.assign(d, { dir, phase: k.local ? 'wind' : 'out', pos: null, from: null, P1: null, dist: 0, hang: 0, u: 0, hitOut: new Set(), hitBack: new Set(), spin: 0, trailT: 0, mesh: null, disc: null, recall: false });
    if (k.local) {
      const ws = k.ws, ss = ssOf(ws);
      ss.mode = 'thrown'; ss.throwK = k; ss.step = -1;
      g.vm.clip.hold = false;
      g.arsenal.playClip('greataxe_throw', { duration: 0.45 });
      sfx(g, 'greataxe_throw', { volume: 1, delay: RELEASE * 0.8 });
    } else launchAxe(k);
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p;
    if (d.phase === 'wind') { if (k.t >= RELEASE) launchAxe(k); else return true; }
    if (!d.mesh) return true;
    const prev = _e.copy(d.pos);
    if (d.phase === 'out') {
      const step = p.speed * dt;
      const wh = g.world?.collision?.raycast(d.pos, d.dir, step + 0.35);
      if (wh) { d.pos.copy(wh.point).addScaledVector(d.dir, -0.35); wallHit(g, wh, d.dir); d.phase = 'hang'; }
      else { d.pos.addScaledVector(d.dir, step); d.dist += step; }
      if (d.dist >= p.range || d.recall) d.phase = d.recall ? 'back' : 'hang';
      if (d.phase !== 'out') { d.P1 = d.pos.clone(); d.u = 0; }
    } else if (d.phase === 'hang') {
      if ((d.hang += dt) >= p.hang || d.recall) { d.phase = 'back'; d.u = 0; sfx(g, 'greataxe_return', { pos: d.pos, volume: 0.8 }); }
    } else if (d.phase === 'back') {
      // a quadratic curve P1 -> C -> the caster's hand (live), C bulging to the right of the out line
      const hand = k.caster(_a, _b).addScaledVector(_c.set(0, -0.35, 0), 1).addScaledVector(_b.setY(0).normalize(), 0.5);
      const right = _c.crossVectors(d.dir, UP).normalize();
      const C = _d.copy(d.P1).lerp(hand, 0.5).addScaledVector(right, p.bulge);
      const L = d.P1.distanceTo(hand) + 0.5;
      d.u = Math.min(1, d.u + (p.speed * 0.95 * dt) / Math.max(1.5, L));
      const u = d.u, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      d.pos.set(a * d.P1.x + b * C.x + c * hand.x, a * d.P1.y + b * C.y + c * hand.y, a * d.P1.z + b * C.z + c * hand.z);
      if (u >= 1 || d.pos.distanceTo(hand) < 0.7) { catchAxe(k); return false; }
    }
    // spin + whirl disc + trail
    d.spin += dt * 22;
    const m = d.mesh, vel = _f.copy(d.pos).sub(prev);
    const fly = vel.lengthSq() > 1e-6 ? vel.clone().normalize() : d.dir;
    m.position.copy(d.pos);
    // the spin plane tilted up out of the flight line (a plane containing the flight line is edge-on to the thrower:
    // the axe would vanish into a hairline), banked a little to the right
    const right = _c.crossVectors(fly, UP).normalize(), nrm = _d.copy(fly).multiplyScalar(0.78).addScaledVector(UP, 0.55).addScaledVector(right, 0.28).normalize();
    m.quaternion.setFromUnitVectors(_ex, nrm).multiply(_q.setFromAxisAngle(_ex, d.spin));   // the blade's normal (+x = w) on the spin axis
    d.disc.position.copy(d.pos); d.disc.quaternion.setFromUnitVectors(_b.set(0, 0, 1), nrm);
    d.disc.material.uniforms.uAmt.value = 0.85;
    if ((d.trailT -= dt) <= 0) {
      d.trailT = 0.025;
      g.fx?.particles?.spawn({ additive: true, x: d.pos.x + (k.rng() - 0.5) * 0.6, y: d.pos.y + (k.rng() - 0.5) * 0.3, z: d.pos.z + (k.rng() - 0.5) * 0.6, vx: -fly.x * 2, vy: 0.5, vz: -fly.z * 2,
        life: 0.4, size: 0.05, size1: 0.01, color: [...EMBER, 1], color1: [...CRIM, 0], frame: FRAME.spark, stretch: 0.03 });
      const fy = k.floorY(d.pos);
      if (d.pos.y - fy < 1.2) g.fx?.knockDust?.(_b.set(d.pos.x, fy, d.pos.z), _a.set(fly.x * 3, 0, fly.z * 3), 0.5);
    }
    if (k.local && k.ws) throwHits(k, prev, d.pos, d.phase === 'back');
    return true;
  },
  end(k) {
    const d = k.data, g = k.game;
    d.mesh?.removeFromParent(); d.disc?.removeFromParent(); d.disc?.material.dispose();
    d.flyLoop?.stop?.(0.1);
    if (k.local && k.ws) {
      const ss = ssOf(k.ws);
      if (ss.mode === 'thrown') { ss.mode = 'idle'; g.vm?.hideFor?.(0); if (g.vm?.weapon?.def === k.def) { g.vm.setAnchor('R', 'grip_r', 0.1); g.vm.setAnchor('L', 'grip_l', 0.12); } }
      ss.throwK = null;
    }
  },
});
function launchAxe(k) {
  const g = k.game, d = k.data, S = sys(g);
  if (k.local) {
    d.pos = (g.vm.socketApparent('head', V3()) || k.caster(V3(), _b)).clone();
    g.vm.hideFor(30, 1);                                    // the gun leaves the hands; the arms stay
  } else d.pos = k.muzzle(V3());
  d.from = d.pos.clone();
  d.phase = 'out';
  d.mesh = S.axe ? S.axe.clone(true) : new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.4, 0.4), new THREE.MeshBasicMaterial({ color: 0x6a4a20 }));
  d.mesh.scale.setScalar(1.5);   // the axe grows as it leaves the hands (readable at 15 m)
  // pivot the axe about its centre of mass (between the head and the haft's middle)
  const holder = new THREE.Group();
  d.mesh.position.set(0, -0.45 * 1.5, 0.15);
  holder.add(d.mesh);
  g.scene.add(holder);
  d.mesh = holder;
  d.disc = discMesh(); d.disc.scale.setScalar(1.25); g.scene.add(d.disc);
  d.flyLoop = sfx(g, 'greataxe_fly', { loop: true, volume: 0.6, pos: d.pos });
}
function wallHit(g, wh, dir) {
  g.fx?.impact?.(wh.surf, wh.point, wh.normal, dir, { big: 1.2 });
  g.fx?.sparkBurst?.(wh.point, { color: WHITE, color1: CRIM, count: 24, speed: 7, glow: 0.6, normal: wh.normal });
  sfx(g, 'greataxe_hit_wall', { pos: wh.point, volume: 1 });
}
function throwHits(k, a, b, back) {
  const g = k.game, d = k.data, p = k.p, set = back ? d.hitBack : d.hitOut;
  const seg = _f.copy(b).sub(a), L2 = Math.max(1e-6, seg.lengthSq());
  let n = 0;
  for (const z of g.zombies?.list || []) {
    if (!z.alive || set.has(z)) continue;
    const zc = z.center(V3());
    const u = clamp(_c.copy(zc).sub(a).dot(seg) / L2, 0, 1);
    const near = _c.copy(a).addScaledVector(seg, u);
    if (Math.hypot(zc.x - near.x, zc.z - near.z) > p.r + (z.radius ?? 0.4) || Math.abs(zc.y - near.y) > 1.3) continue;
    set.add(z);
    const dir = seg.clone().setY(0).normalize();
    strike(k.ws, g, z, back ? p.back : p.dmg, dir, { knock: 4, stagger: 1, sever: SEVER_ANY, tag: 'throw', skill: 'greataxe_throw', head: zc.y + 0.25 < near.y });
    hitBurst(g, zc, dir, 1.1);
    sfx(g, 'greataxe_hit_flesh', { pos: zc, volume: 0.8, pitch: 0.9 + k.rng() * 0.2 });
    n++;
  }
  if (n) { stop(g, 0.03); shake(g, 0.08); }
}
function catchAxe(k) {
  const g = k.game;
  if (!k.local || !k.ws) return;
  const ss = ssOf(k.ws);
  ss.mode = 'idle'; ss.lockT = 0.3;
  g.vm.hideFor(0);
  g.vm.setAnchor('R', 'grip_r', 0.06); g.vm.setAnchor('L', 'grip_l', 0.1);
  g.arsenal.playClip('greataxe_catch', { duration: 0.42 });
  sfx(g, 'greataxe_catch', { volume: 1 });
  stop(g, 0.05); shake(g, 0.14);
  g.punch?.impulse?.(-1.6 * 0.0175, 0, 0);
  haptic(40);
  const c = g.vm.socketCam('grip_r', _a);   // the ring and sparks in the palm that caught it
  if (c) {
    g.fx?.shockwave?.(c, { r0: 0.02, r1: 0.14, life: 0.25, color: CRIM, thin: true, vm: true });
    for (let i = 0; i < 12; i++) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: (R() - 0.5) * 0.9, vy: R() * 0.5, vz: (R() - 0.5) * 0.4, life: 0.2, size: 0.004, stretch: 0.012, color: [...SPARK, 1], color1: [...CRIM, 0], frame: FRAME.spark, gravity: 2 });
  }
}

// ------------------------------------------------------------------------------------------ 猛志 ultimate
// The war spirit stands beyond the mark (from the caster), facing them: its low forehand sweep runs its axe head
// through the street in front of it (the head's face to the caster, a thick white-hot / crimson band in its wake),
// then it raises the axe overhead and chops diagonally across its body onto the mark. Its height S follows the mark's
// distance so the whole figure fits the caster's frame (7.5 m close by .. 14 m from ~25 m); everything it reaches
// scales with S. Its axe arm is its own ghost hinged at the right shoulder; poses are (yaw, pitch, roll) of the arm
// (reaching along +Z, edge +X; pitch + = down).
let _spGeo = null, _armGeo = null, _shGeo = null;
const spGeo = () => _spGeo || (_spGeo = spiritGeometry());
const armGeo = () => _armGeo || (_armGeo = spiritArmGeometry());
const shGeo = () => _shGeo || (_shGeo = shieldGeometry());
const D2R = Math.PI / 180;
const _qy = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _ex = new THREE.Vector3(1, 0, 0), _ez = new THREE.Vector3(0, 0, 1);
function armPose(q, yaw, pitch, roll) {
  _qy.setFromAxisAngle(UP, yaw * D2R); _qp.setFromAxisAngle(_ex, pitch * D2R); _qr.setFromAxisAngle(_ez, roll * D2R);
  return q.copy(_qy).multiply(_qp).multiply(_qr);
}
const ease3 = (u) => u * u * (3 - 2 * u);
// [t, yaw, pitch, roll]: rises with the axe up and back -> wound out to its right -> the low sweep across its front (the
// haft ~44° down: the head runs through the horde at waist height, its face to the caster) -> raised overhead ->
// the chop, diagonally across the body onto the mark (rolled 45°: the crescent reads, not a knife edge)
const CHOP_YAW = 27, CHOP_PITCH = 58;
const ARM_KEYS = [[0, -20, -125, -60], [0.9, -105, 10, 0], [1.05, -110, 42, 0], [1.6, 105, 46, 0], [1.75, 110, 36, 0], [2.0, 22, -105, -45], [2.25, CHOP_YAW, -125, -45],
  [2.42, CHOP_YAW, CHOP_PITCH, -45], [3.2, CHOP_YAW, CHOP_PITCH + 2, -45]];
const T_SWEEP = [1.05, 1.6], T_RAISE = 2.25, T_CHOP = 2.42, LIFT = 0.05;
const SW_A0 = -110, SW_ARC = 236;                      // the sweep band: from the arm's start round past its end (+ the edge's lead)
// where the head centre bites at the end of the chop, in the giant's own frame (authored metres)
const BITE = (() => {
  const sh = RSHOULDER.map((v) => v * SPIRIT_H), L = ARM_HEAD[0] * Math.cos(CHOP_PITCH * D2R);
  return [sh[0] + Math.sin(CHOP_YAW * D2R) * L, sh[2] + Math.cos(CHOP_YAW * D2R) * L];
})();
/**
 * The 猛志 mark when the crosshair does not pin it (no zombie within 6°, no street within 15 m): the densest zombie
 * cluster in a 30° cone ahead within 15 m, else 10 m ahead. The event's dir is bent onto the point before it is sent,
 * so every client's ray finds the same spot (specials.js snapAim does the same for a pinned zombie).
 */
function ultAim(k) {
  const g = k.game, eye = k.pos, dir = k.dir;
  const hit = g.world?.collision?.raycast(eye, dir, 15);
  if (hit && hit.normal.y > 0.55) return;
  if (pinned(g, eye, dir, k.p.range ?? 30)) return;
  const fh = _f.set(dir.x, 0, dir.z); if (fh.lengthSq() < 1e-6) fh.set(0, 0, -1); fh.normalize();
  const c = clusterAim(g, eye, fh, 15);
  const pt = c ? V3().copy(c) : V3().copy(eye).addScaledVector(fh, 10);
  if (!c) { const wh = g.world?.collision?.raycast(eye, fh, 10); if (wh) pt.copy(eye).addScaledVector(fh, Math.max(2, wh.dist - 0.8)); }
  pt.y = k.floorY(_a.set(pt.x, eye.y, pt.z)) + 0.05;
  dir.copy(pt).sub(eye).normalize();
  k.ev.dir = [dir.x, dir.y, dir.z];
  const h2 = g.world?.collision?.raycast(eye, dir, k.p.range ?? 30);
  k.at = eye.clone().addScaledVector(dir, h2 ? Math.max(0, h2.dist - 0.05) : eye.distanceTo(pt));
  k.at.y = k.floorY(k.at);
}
registerSkill('greataxe_ult', {
  level: 'L4', aim: 'target', dur: 4.0, defaults: { range: 30, sweep: 450, sweepR: 11, sweepArc: 200, chop: 900, chopR: 7, ring: 80, ringR: 10 },
  start(k) {
    const g = k.game, d = k.data;
    if (k.local) ultAim(k);
    const c = (k.at || k.feet()).clone();
    const fy = k.floorY(_a.copy(k.pos).setY(k.pos.y - 1));
    if (k.dir.y < -0.02 && c.distanceTo(k.pos) > (k.pos.y - fy) / -k.dir.y + 0.5) c.copy(k.pos).addScaledVector(k.dir, (k.pos.y - fy) / -k.dir.y).setY(fy);
    const to = k.caster(_a, _b), away = _c.set(c.x - to.x, 0, c.z - to.z);
    if (away.lengthSq() < 1e-4) away.set(k.dir.x, 0, k.dir.z);
    away.normalize();
    d.c = c; d.beat = 0; d.ring = 0;
    const M = Math.hypot(c.x - to.x, c.z - to.z);
    d.S = clamp((0.466 * M + 1.6) / 0.776, 7.5, 14);           // its top stays ~25° over the caster's eye line
    d.yaw = Math.atan2(-away.x, -away.z);                    // its +Z faces the caster
    // stand it so the chop's bite lands on the mark: the mark sits at BITE in its own frame
    const ks = d.S / SPIRIT_H, cy = Math.cos(d.yaw), sy = Math.sin(d.yaw), bx = BITE[0] * ks, bz = BITE[1] * ks;
    d.gp = c.clone().sub(_d.set(bx * cy + bz * sy, 0, -bx * sy + bz * cy)); d.gp.y = k.floorY(_a.set(d.gp.x, c.y + 2, d.gp.z));
    d.near = g.camera.position.distanceTo(c) < 5;
    d.hitSweep = new Set();
    // the sweep reaches as far as the head does (from the giant's middle), the card's 11 m at full height
    d.sweepR = Math.max(k.p.sweepR * d.S / 14, ((ARM_HEAD[0] + ARM_HEAD[1]) * Math.cos(44 * D2R) + 2.75 + 1) * ks);
    if (k.local) {
      const ws = k.ws, ss = ssOf(ws);
      ss.mode = 'idle'; ss.lockT = 1.1; ss.step = -1;
      g.vm.clip.hold = false;
      g.arsenal.playClip('greataxe_ult_cast', { duration: 3.3 });
      g.hud?.card?.(k.cardText(), { color: k.hex.rim, sub: k.def.en });
      g.arsenal.fovKick(3, 0.6);
      if (g.status) g.status.invuln = Math.max(g.status.invuln || 0, 1.0);
      if (clipComfort.overlay) { g.hud?.border?.(k.hex.core, 0.22, 3.6); g.fx?.overlay?.tint?.([1.4, 0.45, 0.3], 0.06, 1.0, { fadeIn: 0.15, fadeOut: 0.4 }); }
      sfx(g, 'greataxe_ult_roar', { volume: 1 });
      sfx(g, 'greataxe_ult_bed', { volume: 0.8, delay: 0.3 });
      // the mask roars a column of fire to the sky -- once the card is in, leaning up and out to the right of it
      later(ws, 0.42, () => {
        const m = g.vm.socketApparent('mouth', V3()), cam = g.camera;
        if (m) {
          const right = _b.set(1, 0, 0).applyQuaternion(cam.quaternion), fwd = cam.getWorldDirection(_c);
          g.fx?.beam?.(m, m.clone().addScaledVector(UP, 30).addScaledVector(right, 13).addScaledVector(fwd, 8), { core: WHITE, glow: CRIM, wCore: 0.05, wGlow: 0.4, life: 0.5, shrink: 0.5 });
        }
        g.fx?.lights?.flash?.(g.camera.position, '#ff4a1a', 14, 6, 0.25);
        roar(ws, g, 1.2);
      });
    } else sfx(g, 'greataxe_ult_roar', { pos: c, volume: 0.8 });
  },
  update(k, dt) {
    const g = k.game, fx = g.fx, d = k.data, c = d.c, t = k.t, p = k.p;
    if (d.beat < 1 && t >= 0.2) {
      d.beat = 1;
      d.sigil = fx?.sigils?.sigil?.(c, { design: 'leiwen', radius: Math.min(7, 0.55 * d.S), color: [1.8, 0.24, 0.08], color1: [1.3, 0.55, 0.15], intensity: 0.75, life: 3.4, spin: 0.6, seed: k.ev.seed });
      sfx(g, 'greataxe_ult_sigil', { pos: c, volume: 0.9 });
    }
    // ③ a crimson shaft, the spirit rises out of the street behind the mark
    if (d.beat < 2 && t >= 0.3) {
      d.beat = 2;
      fx?.sigils?.pillar?.(d.gp, { radius: 0.12 * d.S, height: 2 * d.S, color: [2.0, 0.35, 0.12], color1: [1.0, 0.1, 0.04], life: 0.7, motes: 10, light: 10, rise: true });
      const q = new THREE.Quaternion().setFromAxisAngle(UP, d.yaw);
      d.body = fx?.summons?.ghost?.({ geometry: spGeo(), size: d.S, pos: d.gp, quat: q, appear: 0.6, life: Infinity, out: 0.7, motion: 'rise', bob: 0, big: true,
        ...SPIRIT_LOOK, opacity: d.near ? 0.6 : 0.88, exit: { kind: 'shard', count: 34, palette: [[0.55, 0.38, 0.16], [0.24, 0.55, 0.48], [0.8, 0.12, 0.08]], speed: 4, up: 2, scale: 2.4 }, seed: k.ev.seed });
      if (d.body) {
        d.arm = fx.summons.ghost({ geometry: armGeo(), size: 1, pos: new THREE.Vector3(...RSHOULDER), appear: 0.6, life: Infinity, out: 0.7, motion: 'none', big: false,
          ...SPIRIT_LOOK, opacity: d.near ? 0.6 : 0.88, exit: { kind: 'ember', count: 18, color: [3, 1, 0.3], speed: 3, up: 1.5, scale: 2 }, seed: k.ev.seed + 1 });
        d.body.obj.add(d.arm.obj);   // hinged at the right shoulder, in the body's (unit height) frame
        d.arm.obj.position.set(...RSHOULDER); d.arm.obj.scale.setScalar(1);
        armPose(d.arm.obj.quaternion, ...ARM_KEYS[0].slice(1));
      }
      sfx(g, 'greataxe_ult_rise', { pos: d.gp, volume: 1 });
      // 威壓: the horde round the mark falters under the spirit (30 % speed until the chop has landed, a flinch)
      if (k.local && g.zombies?.authority !== false) for (const z of g.zombies?.list || []) {
        if (!z.alive || z.def?.boss || Math.hypot(z.pos.x - c.x, z.pos.z - c.z) > Math.max(9, 0.9 * d.S)) continue;
        z.speedMul = 0.3; z.hasteT = 2.6;
        if (z.flinchV) z.flinchV.y += 3;
      }
      if (clipComfort.overlay && k.local) g.fx?.overlay?.tint?.([1.3, 0.4, 0.25], 0.06, 2.2, { fadeIn: 0.3, fadeOut: 0.6 });
    }
    // the eye lifts to the spirit while it is up, and comes back down with the chop
    if (k.local && g.punch) g.punch.target.x = t > 0.35 && t - 0.3 < T_CHOP - 0.12 ? LIFT : 0;
    // ④ the arm through its keys (slerped), the sweep (band + streak + hits) and the chop (fan + streak)
    const tt = t - 0.3;
    if (d.arm?.alive) {
      let i = 0; while (i < ARM_KEYS.length - 2 && tt >= ARM_KEYS[i + 1][0]) i++;
      const a = ARM_KEYS[i], b = ARM_KEYS[i + 1], u = clamp((tt - a[0]) / Math.max(1e-3, b[0] - a[0]), 0, 1);
      const e = b[0] === T_SWEEP[1] ? u : b[0] === T_CHOP ? u * u : ease3(u);    // the chop accelerates into the bite
      const yaw = a[1] + (b[1] - a[1]) * e, pitch = a[2] + (b[2] - a[2]) * e;
      armPose(d.arm.obj.quaternion, yaw, pitch, a[3] + (b[3] - a[3]) * e);
      d.body.obj.updateMatrixWorld(true);
      if (tt >= T_SWEEP[0] - 0.05 && tt <= T_SWEEP[1] + 0.05) sweepUpdate(k, yaw, tt);
      ultTrails(k, yaw, pitch, tt);
    }
    if (d.beat < 3 && tt >= T_SWEEP[0] - 0.05) { d.beat = 3; sfx(g, 'greataxe_ult_sweep', { pos: d.gp, volume: 1 }); }
    if (d.beat < 4 && tt >= T_CHOP - 0.2) { d.beat = 4; sfx(g, 'greataxe_ult_chop', { pos: c, volume: 1 }); }
    if (d.beat < 5 && tt >= T_CHOP) { d.beat = 5; d.body?.flash?.(0.8); d.arm?.flash?.(1); chopImpact(k, c); }
    // three rings after the chop
    while (d.beat >= 5 && d.ring < 3 && tt >= T_CHOP + 0.13 * (d.ring + 1)) {
      const i = d.ring++, R1 = p.ringR * (i + 1) / 3;
      quakeRing(g, c, R1, 1.2 + i * 0.3, k.rng, true);
      sfx(g, 'greataxe_quake', { pos: c, volume: 1 - i * 0.2, pitch: 0.9 - i * 0.07 });
      if (k.local) k.hurt(c, R1, p.ring, { knock: 6, stagger: 1, falloffMin: 1 });
      if (k.local) shake(g, 0.15);
    }
    // ⑤ it breaks into bronze and embers
    if (d.beat < 6 && t >= 3.3) {
      d.beat = 6;
      d.body?.dissolveOut?.(0.7); d.arm?.dissolveOut?.(0.6);
      emberBurst(g, _a.set(d.gp.x, d.gp.y + 6, d.gp.z), d.near ? 16 : 30, k.rng, 1.6);
      fx?.motes?.burst?.('ember', _a.set(d.gp.x, d.gp.y + 7, d.gp.z), 26, { color: [3, 1.1, 0.3], speed: 4, spread: 1, radius: 3, seed: k.ev.seed });
      sfx(g, 'greataxe_ult_shatter', { pos: d.gp, volume: 1 });
    }
  },
  end(k) {
    const d = k.data;
    d.sigil?.stop?.();
    for (const m of [d.band, d.fan]) if (m) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
    d.streak?.stop?.(); d.streak2?.stop?.();
    if (k.local && k.game.punch) k.game.punch.target.x = 0;
    if (d.body?.alive) d.body.dissolveOut?.(0.3);
    if (d.arm?.alive) d.arm.dissolveOut?.(0.3);
  },
});
// glazed bronze: a dark warm body, crimson veins of light, an ember rim (an ember rim above ~1.5 tonemaps to beige)
const SPIRIT_LOOK = { base: [0.15, 0.075, 0.032], core: [1.3, 0.12, 0.04], rim: [1.25, 0.16, 0.05], edge: [4, 1.4, 0.5], glaze: 0.35, rimPower: 2.2, flowSpeed: 0.55 };
const _sh = new THREE.Vector3();
/** a point of the spirit's axe arm (authored metres in the arm's frame) in the world */
const armPt = (d, x, y, z, out) => out.set(x / SPIRIT_H, y / SPIRIT_H, z / SPIRIT_H).applyMatrix4(d.arm.obj.matrixWorld);
/**
 * The light the head leaves: in the sweep a thick band round the shoulder's vertical axis (the cone the head's
 * span sweeps out at ~50° of haft, uHead on the edge's live angle), in the chop a fan in the chop's plane (uHead on
 * the live pitch); a camera-facing white-hot streak follows the edge apex (and the upper horn) through both.
 */
function ultTrails(k, yaw, pitch, tt) {
  const g = k.game, d = k.data, ks = d.S / SPIRIT_H, ZC = ARM_HEAD[0], HS = ARM_HEAD[1];
  armPt(d, 0, 0, 0, _sh);
  const sweeping = tt >= T_SWEEP[0] - 0.05 && tt <= T_SWEEP[1] + 0.12, chopping = tt >= T_RAISE - 0.05 && tt <= T_CHOP + 0.08;
  if (sweeping && !d.band) {
    const L0 = ZC - HS + 0.3, L1 = ZC + HS + 0.2, cs = Math.cos(44 * D2R), sn = Math.sin(44 * D2R), fl = d.gp.y - _sh.y + 0.08;
    d.band = sweepBand({ r0: L0 * cs * ks, r1: L1 * cs * ks, h0: -L0 * sn * ks, h1: Math.max(fl, -L1 * sn * ks), arc: SW_ARC * D2R, seg: 110 });
    d.band.material.uniforms.uSpan.value = 0.4;
    g.scene.add(d.band);
  }
  if (d.band) {
    const u = d.band.material.uniforms;
    d.band.position.copy(_sh); d.band.rotation.y = d.yaw + SW_A0 * D2R;
    if (tt <= T_SWEEP[1] + 0.05) u.uHead.value = clamp((yaw + 24 - SW_A0) / SW_ARC, 0, 1.4);
    else u.uHead.value += 0.9 * (1 / 60);                         // drains out past the end
    const end = T_SWEEP[1] + 0.05;
    u.uAmt.value = tt < end ? 1.6 : Math.max(0, 1.6 * (1 - (tt - end) / 0.4));
    if (tt > end + 0.4) { d.band.removeFromParent(); d.band.geometry.dispose(); d.band.material.dispose(); d.band = null; }
  }
  if (chopping && !d.fan) {
    d.fan = sweepBand({ r0: (ZC - HS) * ks, r1: (ZC + HS + 0.4) * ks, h0: 0, h1: 0, arc: 185 * D2R, seg: 80 });
    d.fan.material.uniforms.uSpan.value = 0.45;
    // the band's angle a + a0 = the arm's pitch, in the plane turned by the chop's yaw
    d.fan.quaternion.setFromAxisAngle(UP, d.yaw + CHOP_YAW * D2R).multiply(_qr.setFromAxisAngle(_ez, -Math.PI / 2)).multiply(_qp.setFromAxisAngle(UP, -125 * D2R));
    g.scene.add(d.fan);
    d.fanEnd = 0;
  }
  if (d.fan) {
    const u = d.fan.material.uniforms;
    d.fan.position.copy(_sh);
    if (tt <= T_CHOP) u.uHead.value = clamp((pitch + 125) / 185, 0, 1);
    else { u.uHead.value += 1.4 / 60; d.fanEnd += 1 / 60; }
    u.uAmt.value = tt < T_RAISE + 0.02 ? 0.4 : 1.2 * Math.max(0, 1 - d.fanEnd / 0.35);
    if (d.fanEnd > 0.35) { d.fan.removeFromParent(); d.fan.geometry.dispose(); d.fan.material.dispose(); d.fan = null; }
  }
  // the streaks: camera-facing ribbons off the edge apex and the upper horn
  const on = (tt >= T_SWEEP[0] - 0.05 && tt <= T_SWEEP[1] + 0.02) || (tt >= T_RAISE + 0.02 && tt <= T_CHOP + 0.01);
  if (on) {
    if (!d.streak) {
      d.streak = g.fx?.trail?.({ width: 1.5 * ks, life: 0.26, segs: 32, profile: 'beam', color: [4.6, 3.1, 2.0, 1], color1: [1.3, 0.1, 0.03, 0], taper: 0.2 });
      d.streak2 = g.fx?.trail?.({ width: 0.8 * ks, life: 0.2, segs: 24, profile: 'beam', color: [3.2, 1.6, 0.8, 1], color1: [1.0, 0.06, 0.02, 0], taper: 0.1 });
    }
    d.streak?.push(armPt(d, ARM_HEAD[2], -0.05, ZC, _e));
    d.streak2?.push(armPt(d, ARM_HEAD[2] * 0.8, -0.05, ZC + HS, _e));
  } else if (d.streak) { d.streak.stop(); d.streak2?.stop(); d.streak = d.streak2 = null; }
}
/** the sweep: every zombie within reach of the spirit in its front arc whose bearing the axe passed this frame */
function sweepUpdate(k, yawDeg, tt) {
  const g = k.game, d = k.data, p = k.p;
  const yawNow = yawDeg * D2R + d.yaw;                                 // world yaw of the arm (the giant's +Z = yaw 0)
  const prev = d.prevYaw ?? (SW_A0 * D2R + d.yaw);
  d.prevYaw = yawNow;
  const head = armPt(d, ARM_HEAD[2] * 0.7, -0.05, ARM_HEAD[0] + 1, _a);
  if (k.rng() < 0.8) { const fy = k.floorY(head); g.fx?.knockDust?.(_b.set(head.x, fy, head.z), _c.set(Math.cos(yawNow) * 6, 0, -Math.sin(yawNow) * 6), 1.5); rubble(g, _b, 2, 4, k.rng); }
  if (!k.local || !k.ws || tt < T_SWEEP[0]) return;
  let any = false;
  for (const z of g.zombies?.list || []) {
    if (!z.alive || d.hitSweep.has(z)) continue;
    const zc = z.center(V3()), dx = zc.x - d.gp.x, dz = zc.z - d.gp.z, dist = Math.hypot(dx, dz);
    if (dist > d.sweepR + (z.radius ?? 0.4) || dist < 1.5 || Math.abs(zc.y - d.gp.y) > 4) continue;
    let ang = Math.atan2(dx, dz);
    while (ang < prev - Math.PI) ang += Math.PI * 2;
    while (ang > prev + Math.PI) ang -= Math.PI * 2;
    if (ang < prev - 0.1 || ang > yawNow + 0.1) continue;
    d.hitSweep.add(z);
    const dir = V3().set(Math.cos(yawNow), 0, -Math.sin(yawNow)).multiplyScalar(-1).add(_b.set(dx, 0, dz).normalize().multiplyScalar(0.4)).normalize();
    strike(k.ws, g, z, p.sweep, dir, { knock: 9, stagger: 1, sever: SEVER_ANY, tag: 'ult', skill: 'greataxe_ult', blood: d.hitSweep.size <= 3 ? 1 : 0.35 });
    hitBurst(g, zc, dir, d.hitSweep.size <= 3 ? 1.4 : 0.6);
    any = true;
  }
  if (any && !d.sweepStop) { d.sweepStop = true; stop(g, 0.07); shake(g, 0.3); if (clipComfort.overlay) g.fx?.overlay?.radial?.(0.45, 0.15, RADIAL_THIN); sfx(g, 'greataxe_hit', { volume: 1 }); haptic(30); }
}
/**
 * The chop lands: a white-hot / crimson flash column on the bite, a rubble blast, a wall of dust rolling up and out,
 * chunks of street thrown up into view, thick hot rings, a crater with radial molten cracks. Full treatment unless
 * the camera stands right on it (< 5 m: the column and the blast would fill the screen).
 */
function chopImpact(k, c) {
  const g = k.game, fx = g.fx, p = k.p, near = g.camera.position.distanceTo(c) < 5, cn = near ? 0.6 : 1;
  addAura(g, { type: 'dmg', mul: 1.12, radius: 8, pos: c, dur: 6, by: k.by });
  fx?.lights?.flash?.(_a.set(c.x, c.y + 3, c.z), '#ff6a3a', near ? 10 : 30, 24, 0.35);
  if (!near) {
    fx?.beam?.(_a.set(c.x, c.y - 0.2, c.z), _b.set(c.x, c.y + 20, c.z), { core: [6, 4.6, 3.4], glow: [1.5, 0.14, 0.05], wCore: 0.4, wGlow: 2.6, life: 0.4, shrink: 0.75 });
    fx?.sigils?.pillar?.(_a.set(c.x, c.y, c.z), { radius: 1.5, height: 16, color: [3, 1.3, 0.55], color1: [1.4, 0.12, 0.04], life: 0.45, motes: 14, light: 0, ring: false });
    // (a rubble blast scaled up: radius 2.2 keeps its full-screen kick to the last few metres -- at 6.5 the chop went milky)
    fx?.explosion?.(_a.set(c.x, c.y + 0.3, c.z), { radius: 2.2, scale: 1.6, color: [0.45, 0.4, 0.36] });
  }
  fx?.shockwave?.(_a.set(c.x, c.y + 0.08, c.z), { normal: UP, r0: 0.5, r1: p.chopR * 1.6, life: 0.6, color: [3.4, 1.4, 0.6], thin: false });
  fx?.shockwave?.(_a.set(c.x, c.y + 0.1, c.z), { normal: UP, r0: 0.3, r1: p.chopR * 1.2, life: 0.4, color: [1.5, 0.14, 0.05], thin: true });
  fx?.ground?.add?.('shock', _a.set(c.x, c.y + 0.04, c.z), { r: 0.6, r1: p.chopR * 1.5, life: 0.5, col: [2.4, 0.55, 0.2], width: 1.2, ease: 0.35 });
  dustWall(g, c, 2.6, near ? 16 : 30, 1.6, k.rng);
  rubbleUp(g, c, Math.round(36 * cn), 1.4, k.rng);
  rubble(g, c, Math.round(30 * cn), 7.5, k.rng);
  emberBurst(g, _a.set(c.x, c.y + 0.4, c.z), Math.round(36 * cn), k.rng, 1.8);
  fx?.decals?.add?.(_a.copy(c), UP, { frame: DECAL.concrete, size: 4.5, alpha: 1, life: 40 });
  fx?.decals?.add?.(_a.copy(c), UP, { frame: DECAL.scorch, size: 6, tint: DECAL_TINT.scorch, alpha: 0.6, life: 20 });
  for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283 + k.rng() * 0.5; fissure(g, c, _a.set(Math.sin(a), 0, Math.cos(a)), 4 + k.rng() * 4, { width: 1.1, life: 4.5, speed: 34, rng: k.rng }); }
  sfx(g, 'greataxe_ult_impact', { pos: c, volume: 1.2 });
  if (k.local) {
    k.hurt(c, p.chopR, p.chop, { knock: 10, stagger: 1, falloffMin: 0.4 });
    stop(g, 0.12); shake(g, 0.6);
    if (clipComfort.overlay) g.fx?.overlay?.radial?.(0.6, 0.2, RADIAL_THIN);   // (the blast's own flash is enough: a screen kick on top went milky)
    haptic(40); setTimeout(() => haptic(40), 110);
  } else if (g.camera.position.distanceTo(c) < 20) shake(g, 0.25);
}
/** a wall of dust rolling up and out of a heavy impact (lit puffs on a ring, rising fast, spreading) */
function dustWall(g, c, r, n, k = 1, rng = R) {
  const P = g.fx?.particles;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + rng() * 0.25, sp = (3.5 + rng() * 2.5) * k;
    P?.spawn({ x: c.x + Math.cos(a) * r * 0.5, y: c.y + 0.2 + rng() * 0.4, z: c.z + Math.sin(a) * r * 0.5, vx: Math.cos(a) * sp, vy: (2.2 + rng() * 2.6) * k, vz: Math.sin(a) * sp,
      life: 1.4 + rng() * 0.6, size: 0.7 * k, size1: (2.6 + rng()) * k, sizePow: 0.45, color: [0.5, 0.47, 0.42, 0.62], color1: [0.5, 0.47, 0.42, 0], colorPow: 0.8,
      frame: FRAME.dusty + (i & 1), lit: true, drag: 2.4, ground: c.y, soft: 0.3 });
  }
}
/** chunks of street thrown high (into the view from 10 m), tumbling, bouncing */
function rubbleUp(g, c, n, k = 1, rng = R) {
  const P = g.fx?.particles;
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.283, s = (1.5 + rng() * 3) * k;
    P?.spawn({ x: c.x + Math.cos(a) * 0.6, y: c.y + 0.1, z: c.z + Math.sin(a) * 0.6, vx: Math.cos(a) * s, vy: (6 + rng() * 6) * k, vz: Math.sin(a) * s, life: 1.4 + rng() * 0.6,
      size: (0.06 + rng() * 0.1) * k, color: [0.4, 0.38, 0.36, 1], color1: [0.34, 0.32, 0.3, 1], frame: FRAME.rock, lit: true, gravity: 13, spin: (rng() - 0.5) * 12, rot: rng() * 6, collide: true, bounce: 0.3 });
  }
}
/** a zombie within 6° of the crosshair, in range, in sight (specials.js snapAim's rule) */
function pinned(g, eye, dir, range) {
  let best = null, bc = Math.cos(6 * D2R);
  for (const z of g.zombies?.list || []) {
    if (!z.alive || !z.center) continue;
    const e = z.center(_cl).sub(eye), d = e.length();
    if (d < 2 || d > range) continue;
    const cs = e.dot(dir) / d;
    if (cs < bc) continue;
    const hit = g.world?.collision?.raycast(eye, e.multiplyScalar(1 / d), d);
    if (hit && hit.dist < d - 0.6) continue;
    bc = cs; best = z;
  }
  return best;
}
/** the densest zombie cluster in a 30° cone ahead (horizontal fwd) within `range`: its weighted centroid (feet), or null */
function clusterAim(g, eye, fwd, range, minD = 2.2) {
  const list = (g.zombies?.list || []).filter((z) => z.alive && !z.puppet);
  let best = 0, cos = Math.cos(15 * D2R);
  for (const z of list) {
    const dx = z.pos.x - eye.x, dz = z.pos.z - eye.z, d = Math.hypot(dx, dz);
    if (d < minD || d > range || (dx * fwd.x + dz * fwd.z) / d < cos) continue;
    let s = 0, cx = 0, cz = 0;
    for (const o of list) { const e = Math.hypot(o.pos.x - z.pos.x, o.pos.z - z.pos.z); if (e < 3.2) { const w = 1 - e / 6.4; s += w; cx += o.pos.x * w; cz += o.pos.z * w; } }
    if (s - d * 0.01 > best) { best = s - d * 0.01; _cl.set(cx / s, z.pos.y, cz / s); }
  }
  return best > 0 ? _cl : null;
}
const _cl = new THREE.Vector3();

// ------------------------------------------------------------------------------------------ crisis + final kill
registerSkill('greataxe_crisis', {
  level: 'L1', dur: 1.0,
  start(k) {
    const g = k.game, c = k.feet(V3()), eye = k.caster(_a, _b), fwd = _b.setY(0).normalize();
    // 干盾: a glazed bronze shield flashes up in front of the player and bursts
    // (lower left of the view, half a metre tall: a flash of the shield, not a wall over the screen)
    const side = _f.crossVectors(fwd, UP).normalize();
    const pos = _c.copy(eye).addScaledVector(fwd, 1.25).addScaledVector(side, -0.28).add(_d.set(0, -0.42, 0));
    const gh = g.fx?.summons?.ghost?.({ geometry: shGeo(), size: 0.55, pos, quat: new THREE.Quaternion().setFromUnitVectors(_e.set(0, 0, 1), _f.copy(fwd).negate()), appear: 0.05, life: 0.24, out: 0.18, motion: 'none', big: false,
      base: [0.2, 0.11, 0.04], core: [1.4, 0.2, 0.06], rim: [1.3, 0.2, 0.06], edge: [4, 1.5, 0.5], opacity: 0.45,
      exit: { kind: 'shard', count: 14, palette: [[0.55, 0.38, 0.16], [0.24, 0.55, 0.48], [0.8, 0.12, 0.08]], speed: 6, up: 1, scale: 1 } });
    void gh;
    emberBurst(g, _a.set(c.x, c.y + 1, c.z), 16, k.rng, 1.2);
    g.fx?.shockwave?.(_a.set(c.x, c.y + 0.1, c.z), { normal: UP, r0: 0.4, r1: 4.5, life: 0.4, color: CRIM, thin: false });
    if (!k.p.sfx) sfx(g, 'greataxe_crisis', { pos: c, volume: 1 });   // (crisis.js plays premium.crisis.sfx)
  },
});
registerSkill('greataxe_final', {
  level: 'L2', dur: 1.3,
  start(k) {
    const g = k.game, fx = g.fx, c = k.pos.clone();
    c.y = k.floorY(_a.set(c.x, c.y + 1, c.z));
    if (!k.local) { fx?.sigils?.pillar?.(c, { radius: 0.45, height: 7, color: CRIM, life: 0.7, motes: 4, ring: false }); return; }
    fx?.sigils?.sigil?.(c, { design: 'leiwen', radius: 2.6, color: [3.2, 0.5, 0.18], color1: [2.2, 1.2, 0.35], life: 1.3, spin: 0.8, seed: k.ev.seed });
    // a spirit axe (the ult's arm, a third the size) chops down on the spot
    const yaw = Math.atan2(g.camera.position.x - c.x, g.camera.position.z - c.z) + Math.PI / 2;
    const gh = fx?.summons?.ghost?.({ geometry: armGeo(), size: SPIRIT_H * 0.36, pos: _b.set(c.x, c.y + 4.4, c.z), appear: 0.1, life: 0.9, out: 0.35, motion: 'none', big: false,
      base: [0.22, 0.12, 0.05], core: [2, 0.35, 0.12], rim: [3, 0.9, 0.25], edge: [5, 2.4, 1.1], opacity: 0.6, exit: { kind: 'ember', count: 12, color: [3, 1, 0.3], speed: 3 } });
    if (gh) {
      let t = 0;
      const sysA = { update: (dt) => {
        t += dt;
        const u = Math.min(1, t / 0.28);
        armPose(gh.obj.quaternion, yaw / D2R, -120 + 175 * u * u, -90);
        if (t >= 0.28 && !sysA.hit) { sysA.hit = true; emberBurst(g, c, 16, k.rng, 1); quakeRing(g, c, 3, 1, k.rng); fissure(g, c, _a.set(Math.sin(yaw), 0, Math.cos(yaw)), 2.5, { rng: k.rng }); }
        if (t > 1 || !gh.alive) g.systems.splice(g.systems.indexOf(sysA), 1);
      } };
      g.systems.push(sysA);
    }
    sfx(g, 'greataxe_final', { pos: c, volume: 0.9 });
  },
});

// ------------------------------------------------------------------------------------------ the special (engine overrides)
registerSpecial(ID, {
  init(ws) {
    ssOf(ws);
    const g = ws.game;
    if (g?.scene) { sys(g); warm(g); }
    const au = g?.audio;
    if (au?.defs && !au._gaPre) { au._gaPre = true; au.preload?.(Object.keys(au.defs).filter((n) => /^(greataxe_|ready_greataxe)/.test(n)))?.catch?.(() => {}); }
  },
  /** the attacks (Arsenal._melee asks every frame while the weapon is idle in hand) */
  melee(ws, s, g) {
    const ss = ssOf(ws), p = ws.def.special;
    if (!g.status?.alive) return true;
    if (s.pressed.fire) { ss.buf = 0.3; ss.pressT = 0; ss.pressing = true; ss.fresh = true; }
    if (!s.held.fire) { ss.pressing = false; ss.fresh = true; }
    if (ss.lockT > 0 || ss.spin || ss.mode === 'thrown' || ss.mode === 'leap') return true;
    if (ss.mode === 'charge') { if (!s.held.fire || ss.ct >= p.leap.max) releaseLeap(ws, g); return true; }
    // hold -> 天墜 (from rest, or out of a swing's wind-up before it lands); not while the leap cools down
    if (ss.pressing && ss.fresh && ss.pressT >= p.leap.hold && ss.leapCd <= 0 && (ss.mode === 'idle' || ss.mode === 'recover' || (ss.mode === 'swing' && !ss.hit))) { startCharge(ws, g); return true; }
    if (ss.buf > 0) {
      if (ss.mode === 'idle' || ss.mode === 'recover') { ss.buf = 0; startSwing(ws, g, ss.mode === 'recover' && ss.chainT > 0 && ss.step >= 0 ? (ss.step + 1) % 3 : 0); }
      else if (ss.mode === 'swing' && ss.hit && ss.t >= ss.cur.dur * 0.7) { ss.buf = 0; startSwing(ws, g, (ss.step + 1) % 3); }
    }
    return true;
  },
  onHit(ws, info, res, target) {
    const g = ws.game, z = target?.zombie || target;
    if (!res?.killed || !z?.center) return;
    const dir = info.dir || _a.set(0, 0, -1);
    const zf = z.zfx || g.fx?.zfx, S = sys(g), n = ++S.kf;
    if (zf) {
      zf.clearStatus?.(z, 'kill');                                  // a charred body with a thin molten rim, not the white flash
      if (S.ck.length < 3) { zf.status?.(z, 'cleavekill', 0.6); S.ck.push({ z, t: 0.6 }); }   // ≤ 3 rims at a time; the rest: embers
    }
    cleaveKill(g, z, dir, n);
    if (!info.skill) stop(g, info.headshot ? 0.07 : 0.045);   // (skills time their own stops: a stop per kill turned the 猛志 sweep to slow motion)
    // the wave's last kill: a spirit axe falls on it (KE_FINAL, §1.10) -- once a wave
    const m = g.match, ss = ssOf(ws);
    if (m && m.state === 'round' && (m.queue?.length ?? 1) + (g.zombies?.alive ?? 1) <= 0 && ss.finalWave !== m.round) {
      ss.finalWave = m.round;
      const ev = { type: 'skill', id: 'greataxe_final', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [z.pos.x, z.pos.y, z.pos.z], dir: [0, 0, -1], by: g.localId, ph: 0 };
      startSkill(g, ev, { ws, local: true });
      g.net?.sendSkill?.(ev);
    }
  },
  update(ws, dt, g) {
    const ss = ssOf(ws), inp = g.input?.state;
    // ★ again while the axe is out = recall (eaten before the Arsenal hands the press to the skill engine)
    if (ss.mode === 'thrown' && inp?.pressed.special) { inp.pressed.special = false; if (ss.throwK) ss.throwK.data.recall = true; }
    // F mid-fight is not an inspect
    if ((ss.mode !== 'idle' && ss.mode !== 'recover') || ss.spin || ss.lockT > 0) { if (inp) inp.pressed.inspect = false; }
    driver(ws, dt, g);
    view(ws, g, dt);
    if (ss.mode === 'charge' || ss.spin || ss.mode === 'thrown' || ss.mode === 'leap') g.arsenal.sinceShot = 0;
  },
  tick(ws, dt, g) {
    const ss = ssOf(ws);
    if (!held(g, ws)) {
      if (ss.hum) { ss.hum.stop?.(0.2); ss.hum = null; }
      if (ss.chargeSnd) { ss.chargeSnd.stop?.(0.1); ss.chargeSnd = null; }
      if (ss.mode === 'charge' || ss.mode === 'leap') { const mk = g._ga?.marker; if (mk) mk.visible = false; }
      if (ss.throwK && !ss.throwK.done) endSkill(ss.throwK);
      if (ss.mode !== 'idle') { ss.mode = 'idle'; ss.step = -1; ss.lockT = 0; ss.leap = null; g.arsenal?.fovHold?.(0, 0.2); vignette(g, 0); }
      ss.view.w = null;
    }
  },
  dispose(ws) {
    const ss = ws.sp?.ga;
    if (!ss) return;
    ss.hum?.stop?.(0.1); ss.chargeSnd?.stop?.(0.1);
    if (ss.throwK && !ss.throwK.done) endSkill(ss.throwK);
  },
  meterInfo(ws, key, m) {
    if (key !== 'charge') return null;
    const ss = ssOf(ws), n = ss.mode === 'charge' ? ss.stage : 0;
    return { ...m, raw: n, value: n / 2, ready: n >= 2, hidden: ss.mode !== 'charge' };
  },
  onClipEvent(ws, name, arg, g) {
    if (name !== 'ga') return;
    const what = typeof arg === 'string' ? arg : arg?.do, vm = g.vm;
    if (what === 'roar') roar(ws, g, arg?.k ?? 1);
    else if (what === 'eyes') { const e = vm.socketCam('eyes', _a); if (e) g.fx?.particles.spawn({ additive: true, vm: true, x: e.x, y: e.y, z: e.z, life: 0.3, size: 0.04, size1: 0.1, color: [...CRIM, 1], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() }); }
    else if (what === 'world') worldInspect(ws, g);
    else if (what === 'thumb') thumbSparks(g);
    else if (what === 'scrape') scrape(g);
    else if (what === 'plant') plant(ws, g);
    else if (what === 'smoke') smoke(g);
    else if (what === 'bite') bite(g);
  },
});

/** first-use hitches: the custom materials, the spirit geometries and the war sigil are built up front */
function warm(g) {
  if (g._gaWarm) return;
  g._gaWarm = true;
  try {
    spGeo(); armGeo(); shGeo();
    g.fx?.sigils?.preload?.(['leiwen']);
    for (const t of g.fx?.sigils?.tex || []) if (t) g.renderer?.gl?.initTexture?.(t);
    const grp = new THREE.Group();
    grp.name = 'greataxe-warmup';
    for (const m of [sweepBand({ seg: 8 }), fissureMesh(R, 1, 1), vortexMesh({ seg: 8 }), bladeRing({ seg: 8 }), discMesh()]) { m.visible = false; m.frustumCulled = false; grp.add(m); }
    // the war spirit's ghost passes and the sigil / pillar materials (their first use hitched the cast ~90 ms)
    const gm = g.fx?.summons?._materials?.({ ...SPIRIT_LOOK }, false, spGeo());
    if (gm) for (const m of [gm.depth, gm.color]) { const o = new THREE.Mesh(spGeo(), m); o.visible = false; o.frustumCulled = false; grp.add(o); }
    const sg = g.fx?.sigils;
    if (sg?._sigilMat && sg.geo) { const o = new THREE.Mesh(sg.geo, sg._sigilMat()); o.visible = false; grp.add(o); }
    if (sg?._pillarMat && sg.pillarGeo?.round) { const o = new THREE.Mesh(sg.pillarGeo.round, sg._pillarMat()); o.visible = false; grp.add(o); }
    g.scene.add(grp);
    g.renderer?.gl?.compileAsync?.(grp, g.camera, g.scene)?.catch?.(() => {});
  } catch (e) { console.warn('[greataxe] warm-up', e); }
}
/** 改變世界的檢視: the world dims under a crimson haze for 2.5 s (only this screen) */
function worldInspect(ws, g) {
  const post = g.renderer?.post, ss = ssOf(ws);
  if (!post || ss.dim) return;
  const k = 0.8;
  post.exposure *= k; ss.dim = true;
  if (clipComfort.overlay) g.fx?.overlay?.tint?.([1.4, 0.45, 0.3], 0.12, 2.5, { fadeIn: 0.4, fadeOut: 0.6 });
  const P = g.fx?.particles, cam = g.camera;
  for (let i = 0; i < 22; i++) {
    _a.set((R() - 0.5) * 8, R() * 2.5 - 1, -3 - R() * 6).applyQuaternion(cam.quaternion).add(cam.position);
    P?.spawn({ additive: true, x: _a.x, y: _a.y, z: _a.z, vy: 0.25, delay: R() * 0.8, life: 1.6, fadeIn: 0.3, size: 0.04 + R() * 0.04, size1: 0.01, color: [...EMBER, 1], color1: [...CRIM, 0], frame: FRAME.glow });
  }
  later(ws, 2.5, () => { post.exposure /= k; ss.dim = false; });
}
/** inspect: the thumb tests the edge -- sparks where it runs */
function thumbSparks(g) {
  const vm = g.vm, a = vm.socketCam('edge', _a);
  if (!a) return;
  for (let i = 0; i < 6; i++) g.fx?.particles.spawn({ additive: true, vm: true, x: a.x, y: a.y, z: a.z, vx: (R() - 0.5) * 0.3, vy: R() * 0.3, vz: 0.1, life: 0.2, size: 0.003, stretch: 0.01, color: [...WHITE, 1], color1: [...CRIM, 0], frame: FRAME.spark, gravity: 2 });
}
/** first draw: the edge drags along the street -- a spray of sparks off the edge, thrown up into view */
function scrape(g) {
  const vm = g.vm, a = vm.socketCam('edge', _a);
  if (!a) return;
  for (let i = 0; i < 16; i++) g.fx?.particles.spawn({ additive: true, vm: true, x: a.x, y: a.y, z: a.z, vx: (R() - 0.3) * 0.8, vy: 0.4 + R() * 0.9, vz: R() * 0.3, life: 0.3 + R() * 0.15, size: 0.004, stretch: 0.015, color: [...SPARK, 1], color1: [...CRIM, 0], frame: FRAME.spark, gravity: 3 });
}
/** rare recovery: the axe left standing in the street -- dust and embers where it bites */
function plant(ws, g) {
  const eye = g.camera.position, fwd = eyeFwd(g, _a, V3());
  const p = V3().copy(eye).addScaledVector(fwd, 1.4); p.y = floorAt(g, p);
  emberBurst(g, p, 10);
  g.fx?.knockDust?.(p, _b.set(0, 0, 0), 0.9);
  g.fx?.decals?.add?.(p, UP, { frame: DECAL.concrete, size: 0.4, life: 15 });
  sfx(g, 'greataxe_hit_wall', { pos: p, volume: 0.8 });
}
/** the edge bites the street (開山 / 天墜): sparks, grit and a hot flash off the edge in the viewmodel layer */
function bite(g) {
  const vm = g.vm, P = g.fx?.particles;
  for (const s of ['edge', 'hornL']) {
    const a = vm.socketCam(s, _a);
    if (!a || !P) continue;
    for (let i = 0; i < 14; i++) P.spawn({ additive: true, vm: true, x: a.x, y: a.y, z: a.z, vx: (R() - 0.5) * 1.6, vy: R() * 1.1, vz: (R() - 0.3) * 0.8, life: 0.2 + R() * 0.2, size: 0.005, stretch: 0.018, color: [...SPARK, 1], color1: [...CRIM, 0], frame: FRAME.spark, gravity: 4 });
    P.spawn({ additive: true, vm: true, x: a.x, y: a.y, z: a.z, life: 0.12, size: 0.08, size1: 0.16, color: [...WHITE, 0.8], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() * 6 });
  }
}
/** rare inspect: a wisp of smoke off the blade after the bite */
function smoke(g) {
  const vm = g.vm, a = vm.socketCam('mouth', _a);
  if (!a) return;
  for (let i = 0; i < 4; i++) g.fx?.particles.spawn({ vm: true, x: a.x, y: a.y, z: a.z, vy: 0.05 + R() * 0.03, vx: (R() - 0.5) * 0.02, delay: i * 0.08, life: 1.2, size: 0.02, size1: 0.07, color: [0.5, 0.48, 0.46, 0.35], color1: [0.5, 0.48, 0.46, 0], frame: FRAME.smoke || 1 });
}

// ------------------------------------------------------------------------------------------ clips
// Swings are authored as camera-space axe directions (d: where the haft points from the hands to the head, m: where
// the cutting edge faces / travels -- the edge leads the blow) and grip offsets (m from the hip pose); axeRot() turns
// each into the clip's gunRot offset about the grip (Euler YXZ, unwrapped key to key so a blow never spins the short
// way round). Every swing starts from wherever the axe is now and ends below the frame before it comes back up.
// +x right, +y up, -z forward.
const Z3 = [0, 0, 0];
const _qb = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _eu = new THREE.Euler(), _bx = V3(), _by = V3(), _bz = V3();
function axeRot(vm, d, m, prev = null) {
  _qb.setFromEuler(vm?.hip?.rot ?? _eu.set(0, 0, 0));
  _by.set(d[0], d[1], d[2]).normalize();
  _bz.set(-m[0], -m[1], -m[2]);                                 // gun +Z = against the edge (the edge is gun -Z = s)
  _bz.addScaledVector(_by, -_bz.dot(_by)).normalize();
  _bx.crossVectors(_by, _bz);
  _qt.setFromRotationMatrix(_m4.makeBasis(_bx, _by, _bz)).multiply(_qb.invert());
  _eu.setFromQuaternion(_qt, 'YXZ');
  const r = [_eu.x / D2R, _eu.y / D2R, _eu.z / D2R];
  if (prev) for (let i = 0; i < 3; i++) { while (r[i] - prev[i] > 180) r[i] -= 360; while (r[i] - prev[i] < -180) r[i] += 360; }
  return r;
}
const now = (vm) => ({ p: vm?.clip?.active ? vm.clip.sample('gunPos', [0, 0, 0]) || Z3 : Z3, r: vm?.clip?.active ? vm.clip.sample('gunRot', [0, 0, 0]) || Z3 : Z3 });
/** a clip from axe keys [t, gripPos, d, m, ease] (d null = keep the previous direction); starts at the current pose, ends at rest */
function axeClip(vm, keys, { events = [], extra = {}, hide = -1, from = null, rest = 'out3', loop, dur } = {}) {
  const f = from ? { p: from[0], r: axeRot(vm, from[1], from[2]) } : now(vm), gp = [[0, f.p]], gr = [[0, f.r]];
  let prev = f.r;
  keys.forEach(([t, p, d, m, e = 'inOut'], i) => {
    const r = d ? axeRot(vm, d, m, prev) : prev.slice();
    gp.push([t, p, e]); gr.push([t, r, e]);
    if (i === hide) {
      const n = r.map((v) => ((v % 360) + 540) % 360 - 180);
      gr.push([t + 0.0005, n, 'snap']); gp.push([t + 0.0005, p, 'snap']);
      prev = n; return;
    }
    prev = r;
  });
  const last = gr[gr.length - 1][1], fold = last.map((v) => ((v % 360) + 540) % 360 - 180);
  if (fold.some((v, i) => Math.abs(v - last[i]) > 1e-3)) { const tl = gr[gr.length - 1][0] + 0.0005; gr.push([tl, fold, 'snap']); gp.push([tl, gp[gp.length - 1][1], 'snap']); }
  gp.push([1, Z3, rest]); gr.push([1, Z3, rest]);
  const c = { tracks: { gunPos: gp, gunRot: gr, ...extra }, events };
  if (loop) c.loop = loop;
  if (dur) c.duration = dur;
  return c;
}
// §1.17: a crimson crescent off the outer half of the edge (mid -> upper horn: the whole 500 mm edge read as a tall
// pale sheet), kept near 1.5 HDR so it tonemaps crimson, not cream; a camera-facing streak rides its outer rim (the
// upper horn's path: a white-hot core in a crimson glow -- it stays a crescent when the chop comes at the eye and the
// ribbon goes edge-on). The blow that lands burns molten orange and fades dark (hitColor1). TR / TROFF: both events.
const TRAIL = (id = 'edge', o = {}) => ({ on: true, id, from: 'edge', to: 'hornU', profile: 'crescent', color: '#ff2a14', color1: '#5a0603', k: 1.6,
  hitColor: '#ff5a1a', hitColor1: '#4a0402', life: 0.14, ...o });
const CORE = (id = 'edge', o = {}) => ({ on: true, id: id + 'Core', from: 'hornU', to: null, profile: 'beam', width: 0.0045, color: '#fff2dc', color1: '#ff3a14', k: 4, life: 0.1, segs: 16, ...o });
const GLOW = (id = 'edge', o = {}) => ({ on: true, id: id + 'Glow', from: 'hornU', to: null, profile: 'soft', width: 0.065, color: '#ff2a14', color1: '#4a0402', k: 2.2, life: 0.13, segs: 18, ...o });
const TRAIL_OFF = (id = 'edge') => ({ on: false, id });
const TR = (t, id = 'edge', o = {}) => [[t, 'trail', TRAIL(id, o)], [t, 'trail', GLOW(id, { life: (o.life ?? 0.14) * 0.9 })], [t, 'trail', CORE(id, { life: (o.life ?? 0.14) * 0.7 })]];
const TROFF = (t, id = 'edge') => [[t, 'trail', TRAIL_OFF(id)], [t, 'trail', TRAIL_OFF(id + 'Glow')], [t, 'trail', TRAIL_OFF(id + 'Core')]];
const FLARE = (a, b, c, d) => ({ 'fx_flare.scale': [[0, [1, 0.04, 0.04]], [a, [1, 0.04, 0.04]], [b, [1, 1, 1], 'out3'], [c, [1, 1, 1]], [d, [1, 0.04, 0.04]]], 'fx_flare.vis': [[0, 0], [a, 1, 'snap'], [d, 1], [Math.min(1, d + 0.01), 0, 'snap']] });
const LOW = [-0.06, -0.5, 0.06];
const tr3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
// 斜劈: wound up high over the right shoulder, the head comes over and down across the front to the lower left
registerClip('greataxe_cleave', (vm) => axeClip(vm, [
  [0.3, [0.07, 0.12, 0.1], [0.42, 0.78, 0.46], [-0.35, 0.55, -0.76], 'out3'],
  [0.4, [0.0, 0.08, -0.08], [0.1, 0.5, -0.86], [-0.55, -0.72, -0.42], 'in'],
  [0.5, [-0.18, -0.08, -0.12], [-0.55, -0.32, -0.77], [-0.25, -0.75, 0.6], 'out'],
  [0.64, [-0.28, -0.26, -0.02], [-0.7, -0.68, 0.2], [0.35, -0.55, 0.75], 'out3'],
  [0.8, LOW, null, null, 'inOut'],
], { hide: 4, extra: FLARE(0.3, 0.38, 0.5, 0.62), events: [...TR(0.28), [0.34, 'haptic', 'tick'], ...TROFF(0.66)] }));
// 回掄: from the lower left, the axe turned in the hands, rising across to the upper right
registerClip('greataxe_backhand', (vm) => axeClip(vm, [
  [0.26, [-0.26, -0.16, -0.02], [-0.85, -0.25, -0.45], [0.3, 0.6, -0.74], 'out3'],
  [0.38, [-0.04, -0.02, -0.14], [-0.12, 0.3, -0.95], [0.9, 0.42, 0.1], 'in'],
  [0.5, [0.14, 0.1, -0.08], [0.72, 0.52, -0.45], [0.3, 0.55, 0.78], 'out'],
  [0.66, [0.18, 0.14, 0.04], [0.55, 0.82, 0.15], [-0.2, 0.25, 0.95], 'out3'],
  [0.84, [0.12, -0.5, 0.06], null, null, 'inOut'],
], { hide: 4, extra: FLARE(0.26, 0.34, 0.5, 0.64), events: [...TR(0.24), [0.3, 'haptic', 'tick'], ...TROFF(0.68)] }));
// 開山: the axe raised high overhead (the edge to the sky, the head over the top of the frame), brought straight down
// onto the street ahead (bites at 0.44), held there a beat, wrenched out and back to the guard
registerClip('greataxe_mountain', (vm) => axeClip(vm, [
  [0.28, [0.0, 0.2, 0.1], [0.06, 0.62, 0.78], [0.0, 0.82, -0.57], 'out3'],
  [0.36, [-0.04, 0.12, -0.08], [0.04, 0.68, -0.73], [0.0, -0.73, -0.68], 'in'],
  [0.44, [-0.06, 0.04, -0.2], [-0.45, -0.25, -0.86], [-0.12, -0.95, 0.28], 'in3'],
  [0.6, [-0.06, 0.03, -0.19], null, null, 'linear'],
  [0.72, [-0.08, -0.02, -0.14], [0.0, 0.1, -0.99], [0, -0.99, -0.1], 'inOut'],
  [0.86, LOW, null, null, 'inOut'],
], { hide: 5, extra: FLARE(0.28, 0.36, 0.6, 0.72), events: [...TR(0.3, 'edge', { life: 0.16, k: 2 }), [0.36, 'haptic', 'tick'], ...TROFF(0.46), [0.45, 'haptic', 'thud'], [0.44, 'ga', 'bite'], [0.62, 'snd', 'greataxe_recover']] }));
// 收招: the axe swung up onto the right shoulder, a shake of the blood off, back to the guard (any input cancels)
registerClip('greataxe_recover', (vm) => axeClip(vm, [
  [0.28, [0.08, 0.06, 0.1], [0.3, 0.55, 0.78], [0.1, 0.8, -0.5], 'out3'],
  [0.55, [0.08, 0.065, 0.105], null, null, 'linear'],
  [0.62, [0.09, 0.04, 0.09], [0.32, 0.5, 0.8], [0.1, 0.8, -0.5], 'outBack'],
  [0.78, [0.0, -0.01, 0.02], [-0.3, 0.92, -0.25], [0.9, 0.1, -0.4], 'inOut'],
], { events: [[0.2, 'snd', 'cloth'], [0.6, 'snd', 'greataxe_recover'], [0.62, 'ga', 'eyes']] }));
// rare 收招 (1 in 8): after 開山 the axe is left standing in the street, the hands let go, then wrench it out
registerClip('greataxe_recover_rare', (vm) => axeClip(vm, [
  [0.12, [-0.06, 0.03, -0.19], [-0.45, -0.25, -0.86], [-0.12, -0.95, 0.28], 'linear'],
  [0.55, [-0.06, 0.03, -0.19], null, null, 'linear'],
  [0.68, [-0.04, -0.02, -0.12], [0.0, 0.3, -0.95], [0, 0.95, 0.3], 'in3'],
  [0.86, [0.02, 0.0, 0.02], [-0.3, 0.92, -0.25], [0.9, 0.1, -0.4], 'out3'],
], { events: [[0.1, 'ga', 'plant'], [0.14, 'anchorR', ['rest', 0.12]], [0.16, 'anchorL', ['rest', 0.14]], [0.5, 'anchorR', ['grip_r', 0.08]], [0.52, 'anchorL', ['grip_l', 0.1]],
  [0.62, 'snd', 'greataxe_hit_wall'], [0.63, 'haptic', 'thud'], [0.7, 'snd', 'cloth']] }));
// 天墜 charge: the axe held up high, the face square to the eye so the opening jaw, the eyes and the growing crescent
// read; the head over the upper right of the frame, clear of the reticle (0.15 -> 0.85 loops while held: a tremble)
registerClip('greataxe_charge', (vm) => {
  const f = now(vm), up = [-0.02, 0.14, -0.14], ur = axeRot(vm, [-0.05, 0.85, -0.52], [0.98, 0.12, 0.1], f.r);   // high and away: the head over the upper right
  return {
    loop: [0.15, 0.85],
    tracks: {
      gunPos: [[0, f.p], [0.15, up, 'out3'], [0.32, tr3(up, [0.003, 0.004, 0])], [0.5, tr3(up, [-0.003, 0.0, 0.002])], [0.68, tr3(up, [0.002, 0.004, -0.001])], [0.85, up], [1, Z3, 'inOut']],
      gunRot: [[0, f.r], [0.15, ur, 'out3'], [0.32, tr3(ur, [0.9, -0.6, 0.7])], [0.5, tr3(ur, [-0.7, 0.6, -0.5])], [0.68, tr3(ur, [0.6, 0.4, 0.8])], [0.85, ur], [1, Z3, 'inOut']],
    },
    events: [[0.05, 'snd', 'cloth'], [0.14, 'ga', 'eyes']],
  };
});
// 天墜 leap: still overhead and rising (FOV kick from the special), pulled back further at the apex, brought down to
// bite the street the instant the feet land (o.flight = the landing as a fraction of the clip), held, up again
registerClip('greataxe_leap', (vm, o = {}) => {
  const L = o.flight ?? 0.55;
  return axeClip(vm, [
    [L * 0.45, [-0.1, 0.24, 0.12], [0.1, 0.8, 0.58], [0.95, -0.1, 0.25], 'out3'],
    [L * 0.8, [-0.06, 0.16, -0.04], [0.04, 0.7, -0.71], [0, -0.71, -0.7], 'in'],
    [L, [-0.06, 0.04, -0.2], [-0.45, -0.25, -0.86], [-0.12, -0.95, 0.28], 'in3'],
    [L + 0.12, [-0.06, 0.03, -0.19], null, null, 'linear'],
    [Math.min(0.97, L + 0.3), LOW, null, null, 'inOut'],
  ], { hide: 4, extra: FLARE(0.0, 0.02, L + 0.12, L + 0.25), events: [...TR(L * 0.78, 'edge', { life: 0.18, k: 2 }), ...TROFF(L + 0.02), [L, 'haptic', 'thud'], [L, 'ga', 'bite']] });
});
// 狂旋: one pass of the whirl a loop: in from the right (out of frame), flat across the lower half of the frame, out
// to the left; the arms go out of view while the axe is behind (vmHide), the loop runs while ◎ is held
registerClip('greataxe_spin', (vm) => {
  const c = axeClip(vm, [
    [0.12, [0.32, -0.16, 0.06], [0.98, -0.15, 0.1], [0.1, 0.0, -1], 'out3'],
    [0.36, [0.06, -0.14, -0.18], [0.35, -0.12, -0.93], [-0.93, 0, -0.35], 'linear'],
    [0.56, [-0.18, -0.14, -0.12], [-0.6, -0.12, -0.79], [-0.79, 0, 0.6], 'linear'],
    [0.72, [-0.36, -0.18, 0.04], [-0.99, -0.15, 0.05], [-0.05, 0, 1], 'linear'],
    [0.98, [0.32, -0.16, 0.06], [0.98, -0.15, 0.1], [0.1, 0.0, -1], 'snap'],
  ], { loop: [0.12, 0.98], extra: FLARE(0, 0.1, 0.95, 0.99), events: [[0.13, 'vmHide', false], ...TR(0.14, 'spin', { life: 0.1, k: 2 }), ...TROFF(0.7, 'spin'), [0.76, 'vmHide', 'all']] });
  return c;
});
// the whirl ends: a burst (the axe swung out round once more and brought back) / just lowered
registerClip('greataxe_spin_end', (vm) => axeClip(vm, [
  [0.2, [0.1, -0.12, -0.12], [0.6, -0.1, -0.79], [-0.79, 0, -0.6], 'out3'],
  [0.4, [-0.2, -0.14, -0.1], [-0.7, -0.12, -0.7], [-0.7, 0, 0.7], 'linear'],
  [0.6, LOW, null, null, 'inOut'],
], { hide: 2, events: [...TR(0.05, 'edge', { life: 0.16 }), ...TROFF(0.45)] }));
registerClip('greataxe_spin_out', (vm) => axeClip(vm, [[0.5, LOW, null, null, 'in']], {}));
// while the axe flies: the right hand open, palm forward, waiting for the catch; the left reaching out, open, palm down
const THROW_R = { pos: [0.1, -0.1, -0.38], F: [-0.12, 0.92, -0.35], N: [-0.08, 0.3, -0.95], pose: 'open', palm: [0.015, 0.05] };
const THROW_L = { pos: [0.15, -0.17, -0.47], F: [-0.15, 0.12, -1], N: [-0.25, -0.95, -0.1], pose: 'relaxed', palm: [0.02, 0.05] };
// 迴戚 throw: wound back over the right shoulder, hurled forward (released at RELEASE / 0.45 of the clip: the gun hides
// then), the right arm follows through, the left hand points the way
registerClip('greataxe_throw', (vm) => axeClip(vm, [
  [0.3, [0.14, 0.08, 0.16], [0.6, 0.45, 0.66], [0.2, 0.85, -0.5], 'out3'],
  [0.44, [0.0, 0.04, -0.2], [0.05, 0.4, -0.92], [0, -0.92, -0.4], 'in3'],
  [0.6, [-0.05, -0.1, -0.3], [-0.1, -0.2, -0.97], [0, -0.97, 0.2], 'out'],
], { events: [[0.02, 'snd', 'cloth'], ...TR(0.3, 'edge', { life: 0.14 }), ...TROFF(0.43),
  [0.46, 'anchorR', [THROW_R, 0.1]], [0.5, 'anchorL', [THROW_L, 0.16]], [0.47, 'haptic', 'thud']] }));
// the catch: the axe slams into both hands from the front, the arms give under it, back up to the guard
registerClip('greataxe_catch', (vm) => axeClip(vm, [
  [0.18, [-0.06, -0.08, -0.12], [0.1, 0.6, -0.79], [0.97, 0.1, 0.2], 'out'],
  [0.4, [0.02, -0.14, 0.06], [-0.2, 0.9, -0.3], [0.95, 0.15, -0.25], 'out3'],
], { from: [[-0.04, 0.02, -0.3], [0.05, 0.5, -0.86], [0.99, 0.0, 0.1]], rest: 'inOut', events: [[0.02, 'ga', 'eyes']] }));
// 猛志 cast (3.3 s): the axe raised to the sky, the face to the eye, the jaw wide (roar), held; then lowered out of the
// frame to the lower right while the war spirit does the work (the caster watches), back up at the end
registerClip('greataxe_ult_cast', (vm) => {
  const f = now(vm), r = axeRot(vm, [0.1, 1, 0.12], [0.98, -0.05, -0.15], f.r), lo = axeRot(vm, [0.55, 0.35, -0.76], [0.3, -0.93, 0.2], r);
  return {
    duration: 3.3,
    tracks: {
      gunPos: [[0, f.p], [0.06, [-0.04, 0.2, 0.0], 'out3'], [0.22, [-0.04, 0.21, 0.0]], [0.32, [0.16, -0.3, 0.12], 'inOut'], [0.86, [0.16, -0.31, 0.12]], [1, Z3, 'inOut']],
      gunRot: [[0, f.r], [0.06, r, 'out3'], [0.22, r], [0.32, lo, 'inOut'], [0.86, lo], [1, Z3, 'inOut']],
      fx_jaw: [[0, 0], [0.05, 1, 'out3'], [0.24, 1], [0.29, 0]],
      ...FLARE(0.03, 0.08, 0.22, 0.28),
    },
    events: [[0.055, 'haptic', 'thud'], [0.06, 'ga', 'eyes'], [0.065, 'shake', 0.12]],
  };
});
// first draw (1.7 s, once per match, fire cancels): dragged up off the street head first (sparks off the lower horn),
// turned so the mask faces the eye, the eyes light, the jaw roars open with a puff of fire, shouldered, a 0.2 s hold
registerClip('greataxe_first', (vm) => axeClip(vm, [
  // hauled up out of the lower right edge first (the head in frame by 0.15 s, sparks off the edge), turning to the eye
  [0.09, [0.1, -0.2, 0.06], [0.45, 0.4, -0.8], [0.4, -0.85, 0.35], 'out3'],
  [0.24, [0.06, -0.12, 0.04], [0.3, 0.6, -0.74], [0.55, -0.78, 0.3], 'inOut'],
  [0.42, [0.0, 0.0, 0.0], [-0.1, 0.96, -0.2], [0.98, 0.05, -0.15], 'inOut'],
  [0.66, [-0.02, 0.03, 0.02], [-0.12, 0.97, -0.15], [0.98, 0.05, -0.1], 'linear'],
  [0.8, [0.08, 0.06, 0.1], [0.3, 0.55, 0.78], [0.1, 0.8, -0.5], 'out3'],
  [0.92, [0.08, 0.06, 0.1], null, null, 'linear'],
], { from: [[0.16, -0.5, 0.0], [0.4, -0.6, -0.7], [0.4, -0.8, 0.45]], dur: 1.7, rest: 'inOut',
  extra: { fx_jaw: [[0, 0], [0.52, 0], [0.58, 1, 'out3'], [0.74, 1], [0.8, 0]], ...FLARE(0.5, 0.6, 0.72, 0.8) },
  events: [[0.02, 'snd', 'greataxe_draw_first'], [0.07, 'ga', 'scrape'], [0.12, 'ga', 'scrape'], [0.17, 'ga', 'scrape'], [0.42, 'ga', 'eyes'], [0.43, 'glow', { to: 1.8, sec: 0.2 }], [0.44, 'haptic', 'tick'],
    [0.56, 'ga', { do: 'roar', k: 1.4 }], [0.57, 'snd', 'greataxe_roar'], [0.58, 'shake', 0.1], [0.7, 'glow', { to: 1, sec: 0.4 }], [0.78, 'snd', 'cloth'], [0.82, 'snd', 'greataxe_first_sting']] }));
// normal draw (0.65 s): up out of the lower right, the seam lights (the colour shift is §1.17's)
registerClip('greataxe_draw', (vm) => axeClip(vm, [
  [0.7, [0.0, 0.01, 0.0], [-0.3, 0.92, -0.25], [0.9, 0.1, -0.4], 'out3'],
], { from: [[0.12, -0.45, 0.1], [0.45, 0.4, -0.8], [0.4, -0.85, 0.35]], rest: 'inOut', events: [[0.02, 'snd', 'greataxe_draw'], [0.55, 'ga', 'eyes']] }));
// inspect (4.4 s): the axe brought in and stood upright before the eye, the mask square to it, a slow tilt so the light
// runs over the iron and the seam (0.15 -> 0.4 loops on a held F), the left thumb runs along the edge (sparks), a half
// turn shows the back (the turquoise 夔 and the tassel swinging), round again, the eyes flash and the jaw bites shut
const INSP = [-0.14, -0.04, -0.02];                      // grip offset: in towards the middle of the frame
registerClip('greataxe_inspect', (vm) => axeClip(vm, [
  [0.14, INSP, [-0.12, 0.97, 0.2], [0.99, 0.08, 0.05], 'inOut'],
  [0.27, tr3(INSP, [0.01, 0.01, 0]), [-0.05, 0.97, 0.25], [0.97, 0.0, 0.25], 'inOut'],
  [0.4, INSP, [-0.12, 0.97, 0.2], [0.99, 0.08, 0.05], 'inOut'],
  [0.5, tr3(INSP, [0.02, -0.02, 0]), [-0.2, 0.95, 0.2], [0.98, 0.1, 0.15], 'inOut'],
  [0.6, tr3(INSP, [0.04, 0, -0.02]), [-0.1, 0.97, 0.2], [-0.2, 0.0, 0.98], 'inOut'],
  [0.72, tr3(INSP, [0.06, 0, -0.02]), [-0.1, 0.97, 0.2], [-0.99, 0.05, -0.1], 'inOut'],
  [0.8, INSP, [-0.12, 0.97, 0.2], [0.99, 0.08, 0.05], 'inOut'],
  [0.95, INSP, null, null, 'linear'],
], { rest: 'inOut', loop: [0.15, 0.4], dur: 4.4,
  extra: { env: [[0, 0], [0.12, 1], [0.9, 1], [1, 0]], fx_jaw: [[0, 0], [0.82, 0], [0.85, 0.8, 'out3'], [0.88, 0, 'in3']] },
  events: [[0.04, 'snd', 'cloth'], [0.08, 'ga', 'world'], [0.12, 'snd', 'greataxe_inspect'], [0.43, 'anchorL', [{ pos: [0.16, -0.02, -0.4], F: [0.1, 0.95, -0.3], N: [1, 0, 0.2], pose: 'point' }, 0.18]],
    [0.46, 'ga', 'thumb'], [0.49, 'ga', 'thumb'], [0.53, 'anchorL', ['grip_l', 0.2]], [0.6, 'snd', 'cloth'], [0.82, 'ga', 'eyes'], [0.88, 'snd', 'greataxe_jaw'], [0.885, 'haptic', 'tick']] }));
// rare inspect (1 in 10): the mask turns to look straight at the player, the jaw snaps at the testing thumb (the hand
// jerks back), a wisp of smoke off the mouth
registerClip('greataxe_inspect_rare', (vm) => axeClip(vm, [
  [0.14, INSP, [-0.12, 0.97, 0.2], [0.99, 0.08, 0.05], 'inOut'],
  [0.28, tr3(INSP, [0.02, 0.02, 0.03]), [-0.02, 0.97, 0.25], [1, 0.0, 0.02], 'inOut'],
  [0.4, tr3(INSP, [0.02, 0.02, 0.03]), null, null, 'linear'],
  [0.52, tr3(INSP, [0.01, 0.01, 0.02]), [-0.02, 0.97, 0.25], [1, 0.0, 0.02], 'linear'],
  [0.56, tr3(INSP, [0.04, 0.03, -0.02]), [0.12, 0.97, 0.2], [0.98, -0.12, 0.0], 'outBack'],
  [0.7, tr3(INSP, [0.01, 0.01, 0.02]), [-0.02, 0.97, 0.25], [1, 0.0, 0.02], 'inOut'],
  [0.95, tr3(INSP, [0.01, 0.01, 0.02]), null, null, 'linear'],
], { rest: 'inOut', loop: [0.14, 0.28], dur: 4.4,
  extra: { env: [[0, 0], [0.12, 1], [0.9, 1], [1, 0]], fx_jaw: [[0, 0], [0.5, 0], [0.53, 1, 'out3'], [0.56, 0, 'in3'], [0.6, 0.6], [0.66, 0]] },
  events: [[0.06, 'ga', 'world'], [0.3, 'ga', 'eyes'], [0.42, 'anchorL', [{ pos: [0.14, -0.05, -0.38], F: [0.1, 0.9, -0.4], N: [1, 0, 0.2], pose: 'point' }, 0.16]],
    [0.53, 'snd', 'greataxe_jaw'], [0.54, 'anchorL', [{ pos: [-0.1, -0.22, -0.3], F: [0.1, 0.6, -0.8], N: [1, 0, 0.2], pose: 'relaxed' }, 0.06]], [0.54, 'haptic', 'tick'],
    [0.6, 'ga', 'smoke'], [0.75, 'anchorL', ['grip_l', 0.2]]] }));
// ready idle extras (§1.17 idle tiers): the mask growls (the jaw snaps, a shake of the head) / a glint along the edge
registerClip('greataxe_ready', {
  duration: 0.9,
  tracks: {
    gunPos: [[0, Z3], [0.3, [0.01, 0.012, 0.01], 'out3'], [1, Z3, 'inOut']],
    gunRot: [[0, Z3], [0.25, [-4, 3, -4], 'out3'], [0.5, [2, -1.5, 2], 'inOut'], [1, Z3, 'inOut']],
    fx_jaw: [[0, 0], [0.2, 1, 'out3'], [0.5, 0.8], [0.7, 0]],
  },
  events: [[0.2, 'ga', 'roar'], [0.22, 'ga', 'eyes']],
});
registerClip('greataxe_glint', {
  duration: 0.8,
  tracks: { gunRot: [[0, Z3], [0.4, [2, -3, 1.5], 'inOut'], [1, Z3, 'inOut']], ...FLARE(0.0, 0.4, 0.5, 0.95) },
  events: [[0.35, 'ga', 'eyes']],
});

// ------------------------------------------------------------------------------------------ crosshair, kill mark, damage skin
// xh_axe: a crescent edge arc on the right (the 鉞), a short haft stroke on the left, a hollow square in the middle; the
// combo lights a notch on the arc a blow, 天墜 adds two landing ticks under the centre, 狂旋 turns it into three
// arcs whirling round, a thrown axe leaves only the haft stroke and the square
const XH = { stage: 0, spin: false, thrown: false };
registerCrosshair('xh_axe', {
  state: () => `${XH.stage}|${XH.spin ? 1 : 0}|${XH.thrown ? 1 : 0}`,
  draw(gap, c) {
    const R0 = 11 + gap * 0.6;
    const P = (a, r) => `${(Math.sin(a) * r).toFixed(1)} ${(-Math.cos(a) * r).toFixed(1)}`;
    const arc = (a0, a1, r) => `M${P(a0, r)} A${r} ${r} 0 0 1 ${P(a1, r)}`;
    const sq = `<rect class="a" x="-2.2" y="-2.2" width="4.4" height="4.4" fill="none" stroke="${c}" stroke-width="1.2"/>`;
    if (XH.spin) {
      const arcs = [0, 1, 2].map((i) => arc(i * 2.094 + 0.3, i * 2.094 + 1.5, R0 + 2)).join(' ');
      return `<g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.56s" repeatCount="indefinite"/><path class="a" d="${arcs}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/></g>${sq}`;
    }
    const haft = `M${-R0 - 3} -6 L${-R0 - 3} 6`;
    if (XH.thrown) return `<path class="a" d="${haft}" stroke="${c}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>${sq}`;
    // the crescent: a fat outer edge and a thinner inner line, horns flaring past the ends
    const edge = `${arc(0.5, 2.64, R0 + 2)} M${P(0.5, R0 + 2)} L${P(0.36, R0 + 7)} M${P(2.64, R0 + 2)} L${P(2.78, R0 + 7)}`;
    const inner = arc(0.8, 2.34, R0 - 2);
    const ticks = XH.stage ? [0, 1].map((i) => `<path d="M${-5 + i * 10} ${R0 + 5} L${-5 + i * 10} ${R0 + 10}" stroke="${c}" stroke-width="${i < XH.stage ? 2.4 : 1.4}" stroke-linecap="round" opacity="${i < XH.stage ? 1 : 0.35}"/>`).join('') : '';
    return `<path class="a" d="${edge}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/><path class="a" d="${inner}" fill="none" stroke="${c}" stroke-width="1" opacity=".7"/>`
      + `<path class="a" d="${haft}" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>${sq}${ticks}`;
  },
  nodes: 22,
});

// km_greataxe: a crimson slash opens a dark field and draws the crescent 鉞 and its mask (beat 1), the bronze fills and
// the turquoise cells light one by one (2), full glow (3), the eyes flare crimson and the jaw bites with a ding (4)
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
registerKillMark('km_greataxe', {
  draw(ctx, S, t, o) {
    const c = S / 2, R0 = S * 0.42, lw = S * 0.032, crim = '#ff3a2a', gold = o.gold ? '#ffd56a' : '#d9a948', bronze = '#9a6d36', turq = '#3fbfae';
    const p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the field: a dark disc opening behind the slash
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, R0 * (0.75 + 0.25 * p1), 0, Math.PI * 2);
    const bg = ctx.createRadialGradient(c, c, R0 * 0.1, c, c, R0);
    bg.addColorStop(0, '#3a1208'); bg.addColorStop(0.7, '#160806'); bg.addColorStop(1, '#050202');
    ctx.globalAlpha = 0.95 * Math.min(1, p1 * 1.5); ctx.fillStyle = bg; ctx.fill();
    ctx.restore();
    // the 鉞 head (crescent edge to the right), centred a little left
    const hx = c - R0 * 0.18, hy = c, hw = R0 * 0.62, hh = R0 * 0.62;
    const head = () => {
      ctx.beginPath();
      ctx.moveTo(hx - hw * 0.45, hy - hh * 0.5);
      ctx.quadraticCurveTo(hx + hw * 0.25, hy - hh * 0.48, hx + hw * 0.62, hy - hh * 0.9);
      ctx.quadraticCurveTo(hx + hw * 1.15, hy, hx + hw * 0.62, hy + hh * 0.9);
      ctx.quadraticCurveTo(hx + hw * 0.25, hy + hh * 0.48, hx - hw * 0.45, hy + hh * 0.5);
      ctx.closePath();
    };
    // beat 2: bronze fill + turquoise cells along the shoulders
    if (p2 > 0) {
      ctx.save(); head(); ctx.clip();
      const gb = ctx.createLinearGradient(hx - hw, hy - hh, hx + hw, hy + hh); gb.addColorStop(0, '#c08a48'); gb.addColorStop(0.5, bronze); gb.addColorStop(1, '#5a3c1c');
      ctx.globalAlpha = p2; ctx.fillStyle = gb; ctx.fillRect(0, 0, S, S);
      const n = 7, lit = Math.floor(p2 * n * 2 + 0.01);
      for (let i = 0; i < n * 2; i++) {
        if (i >= lit) continue;
        const k = i % n, top = i < n, x = hx - hw * 0.35 + k * hw * 0.13, y = top ? hy - hh * 0.4 : hy + hh * 0.33;
        ctx.fillStyle = turq; ctx.globalAlpha = 0.9 * p2; ctx.fillRect(x, y, hw * 0.1, hh * 0.08);
      }
      // the iron edge band
      ctx.globalAlpha = p2; ctx.strokeStyle = '#cfd3d8'; ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); ctx.moveTo(hx + hw * 0.62, hy - hh * 0.86); ctx.quadraticCurveTo(hx + hw * 1.08, hy, hx + hw * 0.62, hy + hh * 0.86); ctx.stroke();
      ctx.restore();
    }
    // beats 1 + 3: the outline drawn with the slash, glowing once filled; the mask (eyes, mouth) cut into it
    ctx.save();
    ctx.setLineDash([S * 3, S * 3]); ctx.lineDashOffset = S * 3 * (1 - p1);
    ctx.strokeStyle = gold; ctx.lineWidth = lw * 0.6; ctx.shadowColor = crim; ctx.shadowBlur = S * 0.04 * p3;
    head(); ctx.stroke();
    ctx.setLineDash([]);
    // the haft through the rear of the head
    ctx.globalAlpha = Math.min(1, p1 * 2); ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = lw * 1.3;
    ctx.beginPath(); ctx.moveTo(hx - hw * 0.52, hy - R0 * 0.88); ctx.lineTo(hx - hw * 0.52, hy + R0 * 0.88); ctx.stroke();
    ctx.strokeStyle = gold; ctx.lineWidth = lw * 0.35; ctx.stroke();
    ctx.restore();
    // the mask: eye sockets, the grinning mouth with teeth
    const ex = [hx + hw * 0.0, hx + hw * 0.3], ey = hy - hh * 0.14, er = S * 0.032;
    if (p2 > 0) {
      ctx.save(); ctx.globalAlpha = p2;
      ctx.fillStyle = '#120604';
      for (const x of ex) { ctx.beginPath(); ctx.arc(x, ey, er * 1.25, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(hx - hw * 0.12, hy + hh * 0.14); ctx.quadraticCurveTo(hx + hw * 0.15, hy + hh * 0.34, hx + hw * 0.42, hy + hh * 0.14);
      ctx.quadraticCurveTo(hx + hw * 0.15, hy + hh * 0.2, hx - hw * 0.12, hy + hh * 0.14); ctx.fill();
      ctx.fillStyle = crim; ctx.globalAlpha = p2 * (0.6 + 0.4 * p3);
      ctx.beginPath(); ctx.moveTo(hx - hw * 0.06, hy + hh * 0.17); ctx.quadraticCurveTo(hx + hw * 0.15, hy + hh * 0.28, hx + hw * 0.36, hy + hh * 0.17); ctx.quadraticCurveTo(hx + hw * 0.15, hy + hh * 0.21, hx - hw * 0.06, hy + hh * 0.17); ctx.fill();
      ctx.restore();
    }
    // beat 4: 點睛 -- the eyes flare crimson (a cross-flare + ring on a headshot)
    const glow = p3 * 0.7 + Math.sin(Math.PI * p4) * 0.8 + (o.head ? Math.max(0, 1 - Math.abs(t - 1.1) / 0.08) : 0);
    if (glow > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const x of ex) {
        const g2 = ctx.createRadialGradient(x, ey, 0, x, ey, er * (2.2 + glow * 2));
        g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.25, crim); g2.addColorStop(1, '#ff3a2a00');
        ctx.globalAlpha = Math.min(1, glow); ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, ey, er * (2.2 + glow * 2), 0, Math.PI * 2); ctx.fill();
        if (p4 > 0) { const L = S * 0.03 * (1.5 + glow * (o.head ? 3.6 : 2)); ctx.strokeStyle = '#fff'; ctx.lineWidth = lw * 0.3; ctx.beginPath(); ctx.moveTo(x - L, ey); ctx.lineTo(x + L, ey); ctx.moveTo(x, ey - L); ctx.lineTo(x, ey + L); ctx.stroke(); }
      }
      ctx.restore();
    }
    if (o.head && t > 1.0) {
      const u = Math.min(1, (t - 1.0) / 0.17);
      ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = crim; ctx.lineWidth = lw * 0.35;
      ctx.beginPath(); ctx.arc((ex[0] + ex[1]) / 2, ey, S * 0.03 + S * 0.36 * u, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  },
});
// war-fire skin for skill hits (天墜, 狂旋, 迴戚, 猛志): white -> molten orange -> blood crimson on a bronze-gold edge
SKINS.axe = ['#fff3e0', '#ff8a4a', '#c8102e', '#d9a948'];

export { SFX as GREATAXE_SFX };
