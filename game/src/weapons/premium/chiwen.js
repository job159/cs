// 螭吻．吞潮 Chiwen Tidewarden — 神兵 M07 (docs/PREMIUM_WEAPONS.md M07 card; the Appendix A def is in defs.js, the
// model tools/assets/weapons/chiwen.mjs). Mechanics on the specials v2 engine (registerSpecial 'chiwen' + skills)
// and the whole presentation (viewmodel driver, clips, crosshair, kill mark, FX) live in this one file.
//   fire     潮彈: 46 + 20 splash within 1.5 m of the impact; an ice-cyan hollow crown and water mist at the mouth,
//            the jaw snaps open 3° a shot. A hit may mark 寒潮 (25 %, 10 s: three ice scales circle the target);
//            the next hit on it bursts (80 in 2 m, +4 % tide). Kills +4 % tide, 30 % loose a homing water bead
//            (60), and frost over before shattering (KE_FROST); the wave's last kill raises a water column
//   ◎ held   冰流光束 frostRay (20 % tide, <= 2.5 s): white-cored ice beam 280/s piercing 3, a line of ice spikes
//            on the floor (3 s, zombies slowed 40 %), the caster inside the 浪管 wave pipe (TUNNEL L4), FOV -2°
//   ★ tap    潮球 tideOrb (15 %): a slow water orb (6 m/s, 12 m); three pulses 0.6 s apart (120 in 3 m, pull 1 m)
//   both     水幕反衝: a water wall bursts round the caster, zombies within 3 m are shoved 4 m and take 40
//   ★ held   吞潮 swallowTide (ult, ~4,000 damage): cast (the gun dips, CARD) -> a reversed vortex sigil -> the water
//            螭吻 bursts out of it (GHOST) -> 吞: everything within 12 m is pulled 4 m and bitten (500) -> 吐: three
//            water pillars on the densest groups (400 in 4 m, tossed) -> it sinks back, the ground frosts 3 s (slow)
//   crisis   螭吻護甲: a water-dragon vortex wraps the player, knockback 6 m (crisis.js + 'chiwen_crisis')
//   aura     潮汐回流: anyone within 4 m of the ice line or the orb reloads 20 % faster (each client, its own player)
// Teammates replay every skill from its network event (visuals, their own aura; the host applies the slows).
// Sound cue names (§1.12, recorded later; missing ones fall back to existing impacts or stay silent): see SFX.
import * as THREE from 'three';
import { registerSpecial, registerSkill, startSkill, meterEvent, meterAdd, canCast, addAura, paletteOf } from '../specials.js';
import { registerClip, magReload } from '../../player/clips.js';
import { registerCrosshair, injectCSS } from '../../ui/crosshairs.js';
import { registerKillMark } from '../../ui/killmarks.js';
import { FRAME, DECAL, DECAL_TINT } from '../../fx/fx.js';
import { SURF } from '../../world/collision.js';
import { clipComfort } from '../arsenal.js';

const ID = 'chiwen';
const ICE = [1.3, 3.6, 5.0];        // HDR ice cyan (#6fe3ff)
const WHITE = [4.4, 5.6, 6.2];      // white-hot beam core
const DEEP = [0.4, 1.1, 3.4];       // rim blue (#2f8bff)
const MIST = [0.84, 0.92, 1.0];
const CY = '#6fe3ff', BL = '#2f8bff';
const UP = new THREE.Vector3(0, 1, 0);
const V3 = () => new THREE.Vector3();
const _a = V3(), _b = V3(), _c = V3(), _d = V3(), _e = V3(), _f = V3(), _g = V3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = V3();
const R = Math.random;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
// sound cues: name -> fallback (existing sample) | null
const SFX = {
  chiwen_fire: null, chiwen_mark: null, chiwen_mark_burst: 'impact_glass', chiwen_splash: 'impact_water', chiwen_bead: null,
  chiwen_frost_kill: 'impact_glass', chiwen_ray_start: 'impact_water', chiwen_ray_loop: null, chiwen_ray_end: null, chiwen_barrier: 'impact_water',
  chiwen_orb_cast: 'impact_water', chiwen_orb_pulse: 'impact_water', chiwen_orb_burst: 'impact_water', chiwen_ult_inhale: null,
  chiwen_ult_vortex: null, chiwen_ult_roar: 'explosion_far', chiwen_ult_bite: 'bone_crunch', chiwen_ult_spit: 'explosion_small',
  chiwen_ult_fall: 'debris_fall', chiwen_ult_end: null, chiwen_draw_first: 'cloth', chiwen_scales: null, chiwen_gurgle: null,
  chiwen_roar_low: null, chiwen_bubble: null, chiwen_tank: 'magIn', chiwen_eyes: null, chiwen_inspect: null, chiwen_crisis: 'impact_water',
  chiwen_final: 'impact_water', chiwen_idle: null,
};
function sfx(g, name, o = {}) {
  const au = g.audio;
  if (!au) return null;
  if (au.has?.(name)) return au.play(name, o);
  const fb = SFX[name];
  return fb ? au.play(fb, { ...o, volume: (o.volume ?? 1) * 0.6 }) : null;
}

// ------------------------------------------------------------------------------------------ per-weapon state
function cwOf(ws) {
  return ws.sp.cw || (ws.sp.cw = { q: [], marks: new Map(), beads: [], shotHit: false, view: { w: null }, beam: null, ult: null, orbs: 0, readyN: false, readyT: 0, finalWave: -1 });
}
/** Game-time delayed calls (hitstop / stepped frames safe), run from the special's tick. */
function later(ws, sec, fn) { cwOf(ws).q.push([sec, fn]); }
function runQueue(cw, dt) { const q = cw.q; for (let i = q.length - 1; i >= 0; i--) if ((q[i][0] -= dt) <= 0) { const f = q[i][1]; q.splice(i, 1); f(); } }

// ------------------------------------------------------------------------------------------ world system (per game)
// ice spikes (instanced, lit ice), mark scales (instanced, additive), slow zones (host), aura sources, beads
const SPIKE_MAX = 220, SCALE_MAX = 60;
function sys(g) {
  if (g._cw) return g._cw;
  const S = g._cw = { spikes: [], zones: [], auraSrc: new Set(), aura: null, marksWs: null, beadsWs: new Set(), statusT: 0, update: (dt) => sysUpdate(g, S, dt) };
  // ice spikes: a 5-sided crystal (tapered, cracked top) with a bright core; one draw call
  const sg = new THREE.ConeGeometry(0.06, 0.44, 5, 1).translate(0, 0.2, 0);
  S.spikeMesh = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ color: 0xd6f2ff, emissive: 0x2a9fe0, emissiveIntensity: 0.9, roughness: 0.08, metalness: 0,
    transparent: true, opacity: 0.86, flatShading: true }), SPIKE_MAX);
  S.spikeMesh.frustumCulled = false; S.spikeMesh.count = 1;            // one hidden instance: the program compiles at equip time
  S.spikeMesh.setMatrixAt(0, _m.makeScale(1e-4, 1e-4, 1e-4));
  g.scene.add(S.spikeMesh);
  // 寒潮 mark scales: a small fish-scale card, double sided, additive ice
  const sh = new THREE.Shape();
  sh.moveTo(0.05, -0.035); sh.lineTo(0.05, 0.035); sh.lineTo(-0.012, 0.035); sh.absarc(-0.012, 0, 0.035, Math.PI / 2, Math.PI * 1.5, false); sh.lineTo(0.05, -0.035);
  S.scaleMesh = new THREE.InstancedMesh(new THREE.ShapeGeometry(sh, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 2.6, 3.6), transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), SCALE_MAX);
  S.scaleMesh.frustumCulled = false; S.scaleMesh.count = 0; S.scaleMesh.renderOrder = 12;
  g.scene.add(S.scaleMesh);
  g.systems.push(S);
  return S;
}

function sysUpdate(g, S, dt) {
  const now = g.time;
  // ---- ice spikes: pop up (outBack), stand, melt down over the last 0.4 s
  const sp = S.spikes;
  let n = 0;
  for (let i = sp.length - 1; i >= 0; i--) if (now >= sp[i].until) sp.splice(i, 1);
  for (const s of sp) {
    if (n >= SPIKE_MAX) break;
    const age = now - s.born, left = s.until - now;
    const up = age < 0 ? 0 : Math.min(1, age / 0.14), grow = up < 1 ? 1 + 2.4 * (up - 1) ** 3 + 1.4 * (up - 1) ** 2 : 1;
    const k = Math.max(0, grow) * Math.min(1, left / 0.4) * s.h;
    _q.setFromEuler(new THREE.Euler(s.tx, s.ry, s.tz));
    _m.compose(s.pos, _q, _s.set(s.w * Math.max(0.05, k), k, s.w * Math.max(0.05, k)));
    S.spikeMesh.setMatrixAt(n++, _m);
  }
  S.spikeMesh.count = n;
  S.spikeMesh.instanceMatrix.needsUpdate = true;
  // ---- slow zones (the host moves the zombies): speed x0.6 while inside, frost shell refreshed
  for (let i = S.zones.length - 1; i >= 0; i--) if (now >= S.zones[i].until) S.zones.splice(i, 1);
  if (S.zones.length && g.zombies?.authority) {
    const tint = (S.statusT -= dt) <= 0;
    if (tint) S.statusT = 0.25;
    for (const z of g.zombies.list) {
      if (!z.alive || z.brain) continue;
      for (const zn of S.zones) {
        if ((z.pos.x - zn.pos.x) ** 2 + (z.pos.z - zn.pos.z) ** 2 > zn.r * zn.r || Math.abs(z.pos.y - zn.pos.y) > 2) continue;
        z.speedMul = Math.min(z.speedMul, 1 - (zn.slow ?? 0.4)); z.hasteT = Math.max(z.hasteT || 0, 0.2);
        if (tint) g.zombies.status?.(z, 'frozen', 0.3);
        break;
      }
    }
  }
  // ---- 潮汐回流: the local player within 4 m of an ice line / orb reloads 20 % faster (one refreshed aura entry)
  const me = g.player?.pos;
  let near = false;
  if (me) for (const a of S.auraSrc) {
    if (a.until <= now) { S.auraSrc.delete(a); continue; }
    if ((me.x - a.pos.x) ** 2 + (me.z - a.pos.z) ** 2 < a.r * a.r && Math.abs(me.y - a.pos.y) < 3) { near = true; break; }
  }
  if (near) {
    const list = g._skills?.auras;
    if (S.aura && list?.includes(S.aura)) S.aura.t = 0.2;
    else { addAura(g, { type: 'reloadSpeed', mul: 1.2, radius: 1e9, pos: null, dur: 0.2, by: g.localId }); S.aura = g._skills?.auras?.at(-1) || null; }
  }
  // ---- 寒潮 mark scales round every marked zombie of the local weapon
  let m = 0;
  const ws = S.marksWs;
  if (ws?.sp?.cw) {
    for (const [z, mk] of ws.sp.cw.marks) {
      if (m + 3 > SCALE_MAX) break;
      z.center(_a);
      _a.y += 0.12;
      const rr = Math.max(0.42, (z.radius ?? 0.35) + 0.15);
      for (let j = 0; j < 3; j++) {
        const ang = mk.a0 + now * 1.4 + j * 2.0944;
        _b.set(_a.x + Math.cos(ang) * rr, _a.y + Math.sin(now * 2.1 + j * 2) * 0.08, _a.z + Math.sin(ang) * rr);
        // tangent-facing card, tilted like a scale lifting off the body
        _q.setFromEuler(new THREE.Euler(0.35, -ang, 0.25 * Math.sin(now * 3 + j)));
        const pop = Math.min(1, (now - mk.born) / 0.18);
        _m.compose(_b, _q, _s.setScalar(0.7 + 0.5 * pop));
        S.scaleMesh.setMatrixAt(m++, _m);
      }
    }
  }
  S.scaleMesh.count = m;
  S.scaleMesh.instanceMatrix.needsUpdate = true;
}

/** Ice-spike cluster on the floor at p (3 s); host slow zone + aura source; a puff of frost mist. */
function spikeCluster(g, p, rand = R, { n = 3, life = 3, r = 1.0, slow = 0.4, aura = true, size = 1 } = {}) {
  const S = sys(g), now = g.time;
  for (let i = 0; i < n; i++) {
    const a = rand() * 6.283, d = rand() * 0.28 * size;
    S.spikes.push({ pos: new THREE.Vector3(p.x + Math.cos(a) * d, p.y - 0.03, p.z + Math.sin(a) * d), born: now + i * 0.03, until: now + life + rand() * 0.3,
      h: (0.55 + rand() * 0.75) * size, w: 0.8 + rand() * 0.6, tx: (rand() - 0.5) * 0.7, tz: (rand() - 0.5) * 0.7, ry: rand() * 6.283 });
  }
  if (S.spikes.length > SPIKE_MAX) S.spikes.splice(0, S.spikes.length - SPIKE_MAX);
  const z = { pos: p.clone(), r, until: now + life, slow };
  S.zones.push(z);
  if (aura) S.auraSrc.add({ pos: z.pos, r: 4, until: z.until });
  const P = g.fx?.particles;
  P?.spawn({ x: p.x, y: p.y + 0.15, z: p.z, vy: 0.25, life: 0.9, size: 0.3, size1: 0.9, sizePow: 0.5, color: [0.9, 0.96, 1, 0.32], color1: [0.9, 0.96, 1, 0], frame: FRAME.puff + ((rand() * 4) | 0), lit: true, drag: 1.5, ground: p.y, soft: 0.3 });
  P?.spawn({ additive: true, x: p.x, y: p.y + 0.25, z: p.z, life: 0.3, size: 0.18, size1: 0.05, color: [...WHITE, 1], color1: [...ICE, 0], frame: FRAME.glint, rot: rand() * 6 });
}

// ------------------------------------------------------------------------------------------ hits, marks, beads
/** Passive damage of this weapon feeds the ultimate (damage) and the tide (kills): skills / gun hits go through v2. */
function feed(ws, res) {
  if (!ws?.sp?.v2 || !res) return;
  if (res.damage > 0) meterAdd(ws, 'ult', res.damage / (ws.def.special.meters.ult.per || 4000) * 100);
  if (res.killed) meterEvent(ws, 'kill');
}
function hitOne(ws, g, z, dmg, from, { knock = 1, stagger = 0.4, tag = 'cw' } = {}) {
  const p = z.center(V3());
  const dir = p.clone().sub(from).setY(0);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  const info = { amount: dmg * (g.arsenal?.dmgMul ?? 1), part: 'body', point: p, dir, knock, stagger, weapon: ID, shooter: g.localId, cw: tag };
  const res = z.damage(info);
  g.hud?.onHit?.(info, res, z);
  feed(ws, res);
  if (res?.killed) killFx(ws, g, z, p, false);
  return res;
}
/** Area damage around c (caster only): falloff to `falloff`, push (or pull with knock < 0). */
function areaHit(ws, g, c, r, dmg, { exclude = null, knock = 2, falloff = 0.5, stagger = 0.5, tag = 'cw' } = {}) {
  if (!g.targets) return 0;
  let n = 0;
  for (const t of g.targets.inRadius(c, r)) {
    const z = t.zombie || t;
    if (z === exclude || !z.alive) continue;
    const f = Math.max(falloff, 1 - z.distanceTo(c) / r);
    hitOne(ws, g, z, dmg * f, c, { knock: knock * f, stagger, tag });
    n++;
  }
  return n;
}

function mark(ws, g, z) {
  const cw = cwOf(ws);
  if (cw.marks.size >= 16) return;
  cw.marks.set(z, { until: g.time + (ws.def.special.passive?.mark?.dur ?? 10), a0: R() * 6.283, born: g.time });
  sys(g).marksWs = ws;
  sfx(g, 'chiwen_mark', { pos: z.pos, volume: 0.5 });
  z.center(_a);
  g.fx?.particles.spawn({ additive: true, x: _a.x, y: _a.y + 0.1, z: _a.z, life: 0.25, size: 0.5, size1: 0.1, color: [...ICE, 1], color1: [...DEEP, 0], frame: FRAME.glint, rot: R() * 6 });
}
/** 寒潮 burst: the three scales fly apart, a white frost ring, 80 in 2 m, +4 % tide. */
function detonate(ws, g, z) {
  const cw = cwOf(ws), mk = ws.def.special.passive?.mark || {};
  cw.marks.delete(z);
  const c = z.center(V3());
  const fx = g.fx;
  fx?.motes?.burst?.('shard', c, 6, { palette: [[0.75, 0.92, 1], [0.3, 0.55, 1], [0.93, 0.95, 0.98]], speed: 3.6, spread: 0.9, radius: 0.15 });
  fx?.motes?.burst?.('frost', c, 8, { speed: 1.4, radius: 0.4 });
  fx?.shockwave(c, { r0: 0.1, r1: (mk.r ?? 2) * 0.8, life: 0.3, color: [2.6, 3.8, 4.4], thin: true });
  fx?.shockwave(_a.copy(c).setY(z.pos.y + 0.05), { normal: UP, r0: 0.2, r1: mk.r ?? 2, life: 0.45, color: [1.2, 2.4, 3.2] });
  fx?.sparkBurst(c, { color: WHITE, color1: ICE, count: 10, speed: 4.5, glow: 0.4 });
  sfx(g, 'chiwen_mark_burst', { pos: c, volume: 0.8 });
  areaHit(ws, g, c, mk.r ?? 2, mk.burst ?? 80, { knock: 3, falloff: 0.6, tag: 'burst' });
  meterEvent(ws, 'detonate');
}

/** 回潮 water bead: rises off the kill, then homes on the nearest zombie (60). */
function spawnBead(ws, g, p) {
  const cw = cwOf(ws);
  if (cw.beads.length >= 8) return;
  const trail = g.fx?.trail?.({ width: 0.05, life: 0.24, color: [2.2, 4.8, 6.2, 1], color1: [0.3, 0.9, 2.2, 0], taper: 0.15, segs: 16 });
  cw.beads.push({ pos: p.clone(), vel: new THREE.Vector3(R() - 0.5, 2.6, R() - 0.5).normalize().multiplyScalar(5), t: 0, tgt: null, trail });
  sys(g).beadsWs.add(ws);
  sfx(g, 'chiwen_bead', { pos: p, volume: 0.6 });
}
function tickBeads(ws, g, dt) {
  const cw = cwOf(ws), dmg = ws.def.special.passive?.orb?.dmg ?? 60;
  for (let i = cw.beads.length - 1; i >= 0; i--) {
    const b = cw.beads[i];
    b.t += dt;
    if (b.t > 0.18 && (!b.tgt || !b.tgt.alive)) {
      b.tgt = null;
      let bd = 20 * 20;
      for (const z of g.zombies?.list || []) { if (!z.alive) continue; const d = z.pos.distanceToSquared(b.pos); if (d < bd) { bd = d; b.tgt = z; } }
    }
    if (b.tgt) {
      b.tgt.center(_a);
      _b.subVectors(_a, b.pos);
      const d = _b.length();
      if (d < 0.5) {
        hitOne(ws, g, b.tgt, dmg, b.pos, { knock: 1.2, tag: 'bead' });
        splashFx(g, _a, 0.9);
        b.trail?.stop(); cw.beads.splice(i, 1);
        continue;
      }
      b.vel.lerp(_b.multiplyScalar(17 / Math.max(d, 1e-3)), Math.min(1, dt * (b.t < 0.35 ? 3 : 7)));
    } else b.vel.y -= 4 * dt;
    b.pos.addScaledVector(b.vel, dt);
    b.trail?.push(b.pos);
    g.fx?.particles.spawn({ additive: true, x: b.pos.x, y: b.pos.y, z: b.pos.z, life: 0.06, size: 0.11, size1: 0.05, color: [...WHITE, 1], color1: [...ICE, 0], frame: FRAME.glow });
    if (b.t > 2.6) { splashFx(g, b.pos, 0.5); b.trail?.stop(); cw.beads.splice(i, 1); }
  }
}

// ------------------------------------------------------------------------------------------ small FX
/** Water splash at a point: droplets, a splash sprite, mist. k = size. */
function splashFx(g, p, k = 1) {
  const P = g.fx?.particles;
  if (!P) return;
  const n = Math.round(4 + 4 * k);
  for (let i = 0; i < n; i++) {
    const a = R() * 6.283, s = (1.4 + R() * 2.4) * k;
    P.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * s * 0.6, vy: 1.2 + R() * 2.4 * k, vz: Math.sin(a) * s * 0.6, life: 0.45 + R() * 0.3, size: 0.016 * k + 0.01, stretch: 0.025,
      color: [0.86, 0.94, 1, 0.85], color1: [0.86, 0.94, 1, 0], frame: FRAME.drop, gravity: 9.8 });
  }
  P.spawn({ x: p.x, y: p.y, z: p.z, mode: 'align', dir: [0, 1, 0], aspect: 1.5, anchor: 0.45, life: 0.3, size: 0.18 * k, size1: 0.5 * k, sizePow: 0.5,
    color: [0.88, 0.95, 1, 0.7], color1: [0.88, 0.95, 1, 0], frame: FRAME.splash, mirror: R() < 0.5 });
  P.spawn({ x: p.x, y: p.y, z: p.z, vy: 0.2, life: 0.6, size: 0.18 * k, size1: 0.55 * k, sizePow: 0.5, color: [...MIST, 0.3], color1: [...MIST, 0], frame: FRAME.puff + ((R() * 4) | 0), lit: true, drag: 2 });
}

/** Mouth crown for each shot: a hollow ice ring, six short rays, a breath of mist (viewmodel layer). */
function crown(g, n) {
  const vm = g.vm, P = g.fx?.particles, c = vm?.socketCam?.('muzzle', _a);
  if (!P || !c) return;
  const f = _b.set(0, 0, -1).applyQuaternion(vm.gunRoot.quaternion);
  const u = _c.set(0, 1, 0).applyQuaternion(vm.gunRoot.quaternion), w = _d.crossVectors(f, u).normalize();
  const rot = (n % 2) * 0.5236;
  for (let i = 0; i < 6; i++) {
    const a = rot + i * 1.0472, col = i % 2 ? ICE : WHITE;
    _e.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
    P.spawn({ additive: true, vm: true, x: c.x + _e.x * 0.012 + f.x * 0.008, y: c.y + _e.y * 0.012 + f.y * 0.008, z: c.z + _e.z * 0.012 + f.z * 0.008,
      vx: _e.x * 2.2 + f.x * 0.6, vy: _e.y * 2.2 + f.y * 0.6, vz: _e.z * 2.2 + f.z * 0.6, life: 0.065, size: 0.0045, stretch: 0.02,
      color: [col[0] * 1.5, col[1] * 1.5, col[2] * 1.5, 1], color1: [col[0] * 0.2, col[1] * 0.2, col[2] * 0.2, 0], frame: FRAME.spark, drag: 8 });
  }
  P.spawn({ additive: true, vm: true, x: c.x + f.x * 0.012, y: c.y + f.y * 0.012, z: c.z + f.z * 0.012, mode: 'flat', dir: [f.x, f.y, f.z], life: 0.075,
    size: 0.03, size1: 0.11, sizePow: 0.5, color: [ICE[0] * 0.9, ICE[1] * 0.9, ICE[2] * 0.9, 1], color1: [DEEP[0] * 0.2, DEEP[1] * 0.2, DEEP[2] * 0.2, 0], frame: FRAME.thinRing, rot });
  // water mist and a couple of droplets out of the mouth (ignore part of the camera motion: they hang in the air)
  P.spawn({ vm: true, x: c.x + f.x * 0.02, y: c.y + f.y * 0.02, z: c.z + f.z * 0.02, vx: f.x * 0.5 + (R() - 0.5) * 0.1, vy: f.y * 0.5 + 0.05, vz: f.z * 0.5,
    life: 0.35, size: 0.02, size1: 0.07, sizePow: 0.5, color: [...MIST, 0.22], color1: [...MIST, 0], frame: FRAME.smoke + ((R() * 2) | 0), drag: 3, inertia: 0.6 });
  if (R() < 0.5) P.spawn({ vm: true, x: c.x, y: c.y, z: c.z, vx: f.x * 0.8 + (R() - 0.5) * 0.3, vy: 0.3 + R() * 0.3, vz: f.z * 0.8 + (R() - 0.5) * 0.3, life: 0.35, size: 0.0025,
    stretch: 0.01, color: [0.9, 0.96, 1, 0.9], color1: [0.9, 0.96, 1, 0], frame: FRAME.drop, gravity: 3, inertia: 0.4 });
}

/** KE_FROST: white frost covers the body for 0.3 s, then it breaks into ice crystals (+ a couple of glaze shards). */
function killFx(ws, g, z, p, bullet) {
  g.zombies?.status?.(z, 'frozen', 0.45);
  const at = p.clone();
  later(ws, 0.3, () => {
    g.fx?.motes?.burst?.('frost', at, 10, { speed: 1.8, radius: 0.35 });
    g.fx?.motes?.burst?.('shard', at, 3, { palette: [[0.14, 0.29, 0.65], [0.91, 0.96, 1]], speed: 2.6, spread: 0.8, radius: 0.15 });
    g.fx?.particles.spawn({ additive: true, x: at.x, y: at.y, z: at.z, life: 0.22, size: 0.7, size1: 0.2, color: [...WHITE, 1], color1: [...ICE, 0], frame: FRAME.glint, rot: R() * 6 });
    sfx(g, 'chiwen_frost_kill', { pos: at, volume: 0.45 });
  });
  const pr = ws.def.special.passive?.orb;
  if (pr && R() < (pr.chance ?? 0.3)) spawnBead(ws, g, p);
  // KE_FINAL (§1.10): the wave's last kill raises one water column there (no damage, once a wave)
  const m = g.match, cw = cwOf(ws);
  if (m && m.state === 'round' && (m.queue?.length ?? 1) + (g.zombies?.alive ?? 1) <= 0 && cw.finalWave !== m.round) {
    cw.finalWave = m.round;
    const ev = { type: 'skill', id: 'chiwen_final', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [z.pos.x, z.pos.y, z.pos.z], dir: [0, 0, -1], by: g.localId, ph: 0 };
    startSkill(g, ev, { ws: null, local: true });   // not one of the weapon's running skills (no glow / HUD state)
    g.net?.sendSkill?.(ev);
  }
}

// ------------------------------------------------------------------------------------------ viewmodel driver
const ps = (vm, name) => vm.partState[name] || (vm.partState[name] = { v: 0 });
/** The eyes light: a glint on each eye socket (viewmodel layer). */
function eyes(g, k = 1) {
  const vm = g.vm, P = g.fx?.particles;
  if (!P) return;
  for (const s of ['eye_r', 'eye_l']) {
    const c = vm.socketCam(s, _a);
    if (!c) continue;
    P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.38 * k, size: 0.016, size1: 0.006, color: [...WHITE, 1], color1: [...ICE, 0], frame: FRAME.glint, rot: R() * 6 });
    P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.5 * k, size: 0.012, size1: 0.02, color: [ICE[0] * 0.8, ICE[1] * 0.8, ICE[2] * 0.8, 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  }
}
/** Droplets flung off the gun (scales / mouth): n viewmodel-layer drops. */
function droplets(g, n = 10, socks = ['scales_r', 'mouth', 'ridge']) {
  const vm = g.vm, P = g.fx?.particles;
  if (!P) return;
  for (let i = 0; i < n; i++) {
    const c = vm.socketCam(socks[i % socks.length], _a);
    if (!c) continue;
    _b.set((R() - 0.5) * 0.8, 0.4 + R() * 0.6, (R() - 0.5) * 0.4).applyQuaternion(vm.gunRoot.quaternion);
    P.spawn({ vm: true, x: c.x + (R() - 0.5) * 0.03, y: c.y, z: c.z + (R() - 0.5) * 0.03, vx: _b.x, vy: _b.y, vz: _b.z, life: 0.5 + R() * 0.3, size: 0.003, stretch: 0.012,
      color: [0.9, 0.96, 1, 0.95], color1: [0.9, 0.96, 1, 0], frame: FRAME.drop, gravity: 3.2, inertia: 0.5 });
    if (i % 3 === 0) P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: _b.x * 0.3, vy: _b.y * 0.3, vz: _b.z * 0.3, life: 0.4, size: 0.004, size1: 0.001, color: [...ICE, 1], color1: [...ICE, 0], frame: FRAME.glint, rot: R() * 6, inertia: 0.5 });
  }
}
/** A bubble out of the 螭吻 mouth that floats up and pops (rare idle / inspect). big: the inspect mirror bubble. */
function bubble(ws, g, big = false) {
  const vm = g.vm, P = g.fx?.particles, c = vm?.socketCam?.('mouth', _a);
  if (!P || !c) return;
  const f = _b.set(0, 0, -1).applyQuaternion(vm.gunRoot.quaternion);
  const life = big ? 1.1 : 1.0, s0 = big ? 0.006 : 0.004, s1 = big ? 0.034 : 0.014;
  const vx = f.x * 0.03, vy = big ? 0.02 : 0.07, vz = f.z * 0.03;
  // ring (the bubble skin) + a highlight glint that rides on it
  P.spawn({ additive: true, vm: true, x: c.x, y: c.y + 0.004, z: c.z, vx, vy, vz, life, size: s0, size1: s1, sizePow: 0.35, color: [0.9, 1.4, 1.8, 0.9], color1: [0.7, 1.2, 1.6, 0.9], frame: FRAME.thinRing, inertia: 0.7 });
  P.spawn({ additive: true, vm: true, x: c.x - s1 * 0.25, y: c.y + 0.004 + s1 * 0.25, z: c.z, vx, vy, vz, life, size: s0 * 0.5, size1: s1 * 0.3, sizePow: 0.35, color: [2, 2.4, 2.6, 1], color1: [2, 2.4, 2.6, 0.8], frame: FRAME.glint, inertia: 0.7 });
  sfx(g, 'chiwen_bubble', { volume: 0.5 });
  ps(vm, 'fx_jaw').kick = 2.2;
  if (!big) later(ws, life, () => pop(g, _f.set(c.x + vx * life, c.y + vy * life + 0.004, c.z + vz * life), 0.6));
}
function pop(g, c, k = 1) {
  const P = g.fx?.particles;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.283;
    P?.spawn({ vm: true, x: c.x, y: c.y, z: c.z, vx: Math.cos(a) * 0.25 * k, vy: Math.sin(a) * 0.25 * k + 0.05, vz: (R() - 0.5) * 0.1, life: 0.3, size: 0.0022 * k, stretch: 0.006,
      color: [0.9, 0.96, 1, 0.9], color1: [0.9, 0.96, 1, 0], frame: FRAME.drop, gravity: 2.5, inertia: 0.5 });
  }
  P?.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.12, size: 0.01 * k, size1: 0.03 * k, color: [1.4, 2.4, 3, 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing });
}
/** Scale groups ripple rear -> front (setPart staggers by extras.order) and the seams flare. */
function ripple(g, k = 1) {
  const vm = g.vm;
  if (!vm?.weapon?.parts?.fx_scale1) return;
  vm.setPart('fx_scale*', k, 0.07, 0.045);
  vm.glowTo(2.6 * k, 0.08, { mat: 'glow_ice' });
  const back = () => { vm.setPart('fx_scale*', 0, 0.16, 0.045); vm.glowTo(1, 0.4, { mat: 'glow_ice' }); };
  setTimeout(back, 140);   // presentation-only: wall clock is fine (a stale call just re-closes them)
}

/** Per frame while held: jaw, tail sway, water flow, glints, rare idle bubble, ready beats, reload tail slap. */
function view(ws, g, dt) {
  const vm = g.vm, w = vm?.weapon, cw = cwOf(ws), ar = g.arsenal;
  if (!w?.parts?.fx_jaw || w.def !== ws.def) return;
  const v = cw.view;
  if (v.w !== w) {
    // fresh viewmodel (equip): the scales 'breathe out' on the draw -- pCharge 0.2, back to its value over 0.3 s
    Object.assign(v, { w, t: 0, jaw: 0, tail: 0, tailV: 0, glintT: 1, bubbleT: 12, reloading: false, slapAt: 0, kickT: 0 });
    const st = w.premium;
    vm.glowTo(0.2, 0, { u: 'pCharge' });
    later(ws, 0.05, () => { if (vm.weapon === w) vm.glowTo(st?.u?.pCharge?.value ?? 0.4, 0.3, { u: 'pCharge' }); });
  }
  v.t += dt;
  const ready = canCast(ws, 'ult').ok, act = !!cw.beam || !!cw.ult;
  // ---- jaw: per-shot kick (3°), wide for the beam / ultimate, a slow breathing gape while ready
  const jp = ps(vm, 'fx_jaw');
  jp.kick = Math.max(0, (jp.kick || 0) - dt / 0.1);
  const want = act ? 1 : ready ? 0.12 + 0.06 * Math.sin(v.t * 2.4) : 0;
  v.jaw = damp(v.jaw, want, act ? 16 : 8, dt);
  jp.v = Math.max(v.jaw, Math.min(1, jp.kick) * 0.12 + Math.max(0, jp.kick - 1) * 0.25);
  // ---- tail: a damped spring pushed by turning and strafing, a lazy swish while walking, a slap after reloads
  const p = g.player, look = vm.sway?.target?.y ?? 0;
  const strafe = p ? (p.vel.x * Math.cos(p.yaw) - p.vel.z * Math.sin(p.yaw)) : 0;
  const walk = p ? Math.min(1, (p.horizontalSpeed || 0) / 5) : 0;
  const tgt = clamp(look * 18 - strafe * 0.12 + Math.sin(v.t * 2.3) * (0.08 + 0.18 * walk), -1, 1);
  v.tailV += ((tgt - v.tail) * 60 - v.tailV * 7) * dt;
  v.tail = clamp(v.tail + v.tailV * dt, -1.2, 1.2);
  ps(vm, 'fx_tail').v = v.tail;
  // ---- water flow in the tube (fx_flow spin, 1 = 0.5 m/s): slack while reloading, racing in skills
  const insp = !!ar?._inspecting;
  const flow = act ? 3 : ar?.state === 'reload' ? 0.25 : (v.flowBoost > 0 ? 3 : insp ? 1.6 : ready ? 1.5 : 1);
  v.flowBoost = Math.max(0, (v.flowBoost || 0) - dt);
  ps(vm, 'fx_flow').spinMul = flow;
  // ---- the beam: a held, slightly bucking gun; no bullets while it runs
  if (cw.beam) {
    if (ar) ar.fireCd = Math.max(ar.fireCd, 0.08);
    if ((v.kickT -= dt) <= 0) { v.kickT = 0.06; vm.kick({ back: 0.003, up: 0.25, side: 0.25, roll: 0.3 }); }
  }
  // ---- ready (§1.7.1 beat 7): eyes light + the scales flare in a wave, droplets; again every 2.5 s
  if (ready && !act) {
    if (!cw.readyN) { cw.readyN = true; cw.readyT = 0; eyes(g); ripple(g); droplets(g, 8); sfx(g, 'chiwen_eyes', { volume: 0.5 }); }
    else if ((cw.readyT += dt) >= 2.5) { cw.readyT = 0; if (g.hud?.settings?.readyReminder !== false) { eyes(g, 0.8); ripple(g, 0.7); droplets(g, 4, ['mouth']); } }
  } else cw.readyN = false;
  // ---- idle life: up to 6 frost glints round the gun, a bubble every 12 s (rare idle)
  const idle = ar?.state === 'idle' && !vm.clip.active && (ar.sinceShot ?? 9) > 1.5 && !act;
  if (idle && (v.glintT -= dt) <= 0) {
    v.glintT = 0.6 + R() * 1.1;
    const c = vm.socketCam(['ridge', 'scales_r', 'mouth', 'eye_r', 'tube'][(R() * 5) | 0], _a);
    if (c) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x + (R() - 0.5) * 0.06, y: c.y + (R() - 0.3) * 0.02, z: c.z + (R() - 0.5) * 0.06, life: 0.45, size: 0.0045, size1: 0.001,
      color: [2.6, 3.4, 4, 1], color1: [1, 2, 3, 0], frame: FRAME.glint, rot: R() * 6, inertia: 0.6 });
  }
  if (idle && (ar.sinceShot ?? 9) > 3) { if ((v.bubbleT -= dt) <= 0) { v.bubbleT = 12; ar.playClip('chiwen_bubble'); } }
  // ---- reload: tank 'gurgle', the tail slaps the stock as the new tank seats (~80 %)
  if (ar?.state === 'reload' && !ar.shellReload) {
    if (!v.reloading) { v.reloading = true; v.slapAt = (ar.reloadTotal || 2.3) * 0.78; sfx(g, 'chiwen_tank', { volume: 0.5, delay: (ar.reloadTotal || 2.3) * 0.6 }); }
    if (v.slapAt > 0 && (v.slapAt -= dt) <= 0) { v.tailV += 22; g.audio?.play('cloth', { volume: 0.4 }); }
  } else v.reloading = false;
}

function cwEvent(ws, g, a) {
  const vm = g.vm, cw = cwOf(ws), what = typeof a === 'string' ? a : a?.do;
  if (what === 'scales') { ripple(g, 1); sfx(g, 'chiwen_scales', { volume: 0.7 }); }
  else if (what === 'droplets') droplets(g, a?.n ?? 10);
  else if (what === 'flow') { cw.view.flowBoost = a?.sec ?? 1.2; sfx(g, 'chiwen_gurgle', { volume: 0.6 }); }
  else if (what === 'roar') { sfx(g, 'chiwen_roar_low', { volume: 0.8 }); eyes(g); }
  else if (what === 'first') sfx(g, 'chiwen_draw_first', { volume: 0.8 });
  else if (what === 'bubble') bubble(ws, g, false);
  else if (what === 'bigbubble') bubble(ws, g, true);
  else if (what === 'pop') { const c = vm.socketCam('mouth', _a); if (c) pop(g, c.add(_b.set(0, 0.012, 0)), 1.6); sfx(g, 'chiwen_splash', { volume: 0.4 }); }
  else if (what === 'eyes') eyes(g, a?.k ?? 1);
  else if (what === 'vortex') {
    // rare reload: the water in the tube whirls as the tank seats
    cw.view.flowBoost = 0.6;
    const c = vm.socketCam('tube', _a);
    if (c) for (let i = 0; i < 3; i++) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, delay: i * 0.08, mode: 'flat', dir: [1, 0, 0], life: 0.35, size: 0.01, size1: 0.05, color: [...ICE, 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: i });
    sfx(g, 'chiwen_gurgle', { volume: 0.6 });
  } else if (what === 'world') worldInspect(ws, g);
  else if (what === 'tail') cw.view.tailV += a?.v ?? 18;
}

/** 改變世界的檢視 (mythic inspect): the world dims into a sea mist for 2.5 s, only on this screen. */
function worldInspect(ws, g) {
  const post = g.renderer?.post;
  if (!post || ws.sp.cw.mist) return;
  const k = 0.88;
  post.exposure *= k;
  ws.sp.cw.mist = true;
  if (clipComfort.overlay) g.fx?.overlay?.tint?.([0.55, 0.85, 1.1], 0.14, 2.5, { fadeIn: 0.4, fadeOut: 0.6 });
  const P = g.fx?.particles, cam = g.camera;
  for (let i = 0; i < 10; i++) {
    _a.set((R() - 0.5) * 6, (R() - 0.4) * 2, -2 - R() * 5).applyQuaternion(cam.quaternion).add(cam.position);
    P?.spawn({ x: _a.x, y: _a.y, z: _a.z, vx: (R() - 0.5) * 0.2, vy: 0.05, vz: (R() - 0.5) * 0.2, delay: R() * 0.6, life: 2.2, fadeIn: 0.3, size: 1.2, size1: 2.4, color: [0.78, 0.88, 0.96, 0.16], color1: [0.78, 0.88, 0.96, 0], frame: FRAME.puff + (i % 4), lit: true, drag: 0.5 });
  }
  later(ws, 2.5, () => { post.exposure /= k; ws.sp.cw.mist = false; });
}

// ------------------------------------------------------------------------------------------ the special (engine overrides)
registerSpecial(ID, {
  init(ws) { cwOf(ws); if (ws.game?.scene) sys(ws.game).marksWs = ws; },
  onFire(ws, ctx) {
    const g = ctx.game, cw = cwOf(ws);
    if (g.arsenal?.current === ws) { crown(g, ws.shots); if (g.vm?.partState) ps(g.vm, 'fx_jaw').kick = 1; }
    sfx(g, 'chiwen_fire', { volume: 0.25 });
    // a round that struck no body still splashes where it lands (wall / floor), not in open sky
    if (!cw.shotHit && ctx.end && ctx.end.distanceTo(ctx.origin) < (ws.def.range?.[1] ?? 90)) {
      splashFx(g, ctx.end, 0.55);
      const sp = ws.def.splash;
      if (sp) areaHit(ws, g, ctx.end, sp.r, sp.dmg, { knock: 0.6, falloff: 0.5, tag: 'splash' });
    }
    cw.shotHit = false;
  },
  onHit(ws, info, res, target) {
    if (info.skill || info.cw) return;   // marks, splash and beads come from the gun's own rounds
    const g = ws.game, cw = cwOf(ws), z = target?.zombie || target;
    if (!z?.center) return;
    cw.shotHit = true;
    const p = info.point || z.center(V3());
    splashFx(g, p, 0.45);
    const sp = ws.def.splash;
    if (sp) areaHit(ws, g, p, sp.r, sp.dmg, { exclude: z, knock: 0.6, falloff: 0.5, tag: 'splash' });
    if (cw.marks.has(z)) detonate(ws, g, z);
    else if (z.alive && R() < (ws.def.special.passive?.mark?.chance ?? 0.25)) mark(ws, g, z);
    if (res?.killed) killFx(ws, g, z, p, true);
  },
  update(ws, dt, g) { view(ws, g, dt); },
  tick(ws, dt, g) {
    const cw = cwOf(ws);
    runQueue(cw, dt);
    for (const [z, mk] of cw.marks) if (!z.alive || mk.until <= g.time) cw.marks.delete(z);
    if (cw.beads.length) tickBeads(ws, g, dt);
  },
  dispose(ws, g) {
    const cw = ws.sp?.cw;
    if (!cw) return;
    cw.marks.clear();
    for (const b of cw.beads) b.trail?.stop();
    cw.beads.length = 0;
    if (g?._cw?.marksWs === ws) g._cw.marksWs = null;
  },
  meterInfo(ws, key, m) {
    if (key !== 'marks') return null;
    const n = Math.min(m.max, cwOf(ws).marks.size);
    return { ...m, raw: n, value: n / m.max, ready: false };
  },
  onClipEvent(ws, name, arg, g) { if (name === 'cw') cwEvent(ws, g, arg); },
});

// ------------------------------------------------------------------------------------------ skills
const cwOfK = (k) => (k.ws ? cwOf(k.ws) : null);

/** 水幕反衝: a ring of water bursts up round the caster; within 3 m: shoved 4 m (+40) -- caster only for damage. */
function barrier(k) {
  const g = k.game, P = g.fx?.particles, pb = k.def.special.passive?.barrier || { r: 3, knock: 4, dmg: 40 };
  const c = k.feet(V3());
  const n = k.local ? 16 : 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + k.rng() * 0.3, r = (k.local ? 1.15 : 0.8) + k.rng() * 0.3;
    const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    P?.spawn({ x, y: c.y + 0.05, z, mode: 'align', dir: [0, 1, 0], aspect: 2.2, anchor: 0.45, life: 0.45, size: 0.35, size1: 1.1, sizePow: 0.5, color: [0.86, 0.94, 1, 0.75], color1: [0.86, 0.94, 1, 0], frame: FRAME.splash, mirror: k.rng() < 0.5, ground: c.y, soft: 0.1 });
    for (let j = 0; j < 2; j++) P?.spawn({ x, y: c.y + 0.3, z, vx: Math.cos(a) * (2 + k.rng() * 2), vy: 2.5 + k.rng() * 2.5, vz: Math.sin(a) * (2 + k.rng() * 2), life: 0.6, size: 0.025, stretch: 0.03, color: [0.88, 0.95, 1, 0.9], color1: [0.88, 0.95, 1, 0], frame: FRAME.drop, gravity: 9.8 });
  }
  g.fx?.shockwave(_a.set(c.x, c.y + 0.06, c.z), { normal: UP, r0: 0.4, r1: pb.r + 0.4, life: 0.4, color: [1.4, 2.8, 3.6], thin: false });
  sfx(g, 'chiwen_barrier', k.local ? { volume: 0.8 } : { pos: c, volume: 0.8 });
  if (!k.local) return;
  // ~4 m of shove: a zombie's knock velocity decays exp(-7 t), the hit applies knock x 1.2
  k.hurt(c, pb.r, pb.dmg, { knock: pb.knock * 7 / 1.2, stagger: 1, falloffMin: 1, explosive: false });
}

// 冰流光束 (◎ held): channel <= 2.5 s; the engine drains nothing (cost paid on cast) and ends it on release.
registerSkill('frostRay', {
  level: 'L4', channel: true, defaults: { dps: 280, dur: 2.5, pierce: 3, range: 40, tick: 0.1, spikeEvery: 0.1, zh: '冰流光束' },
  start(k) {
    const g = k.game, d = k.data;
    Object.assign(d, { acc: 0, spT: 0.05, endT: 0, mistT: 0, spX: 1.6 });
    barrier(k);
    d.loop = sfx(g, 'chiwen_ray_loop', k.local ? { loop: true, volume: 0.6 } : { loop: true, volume: 0.6, pos: k.pos });
    sfx(g, 'chiwen_ray_start', k.local ? { volume: 0.9 } : { pos: k.pos, volume: 0.9 });
    if (!k.local) return;
    const cw = cwOfK(k);
    if (cw) cw.beam = k;
    // L4 for the caster only: the 浪管 wave pipe (a 220° curl of water over the top and right), FOV -2°
    if (k.level >= 4 && clipComfort.overlay) d.tunnel = g.fx?.overlay?.tunnel?.(Infinity, { look: 'wave' });
    g.arsenal?.fovHold?.(-2, 0.25);
    g.hud?.border?.(CY, 0.12, k.p.dur);
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p, fx = g.fx;
    const eye = k.caster(_c, _d);
    const hit = g.world?.collision?.raycast(eye, _d, p.range);
    const len = hit ? hit.dist : p.range;
    const end = _e.copy(eye).addScaledVector(_d, len);
    const m = k.muzzle(_f);
    // the ray: white core in an ice sheath, two wobbling water strands round it
    if (!d.beam && fx?.beam) {
      d.beam = fx.beam(m.clone(), end.clone(), { core: WHITE, glow: [0.5, 1.5, 2.8], wCore: 0.06, wGlow: 0.24, life: Infinity, scroll: 3 });
      d.s1 = fx.bolt?.(m.clone(), end.clone(), { col: ICE, glow: [0.25, 0.7, 1.5], width: 0.11, core: 0.12, levels: 4, jitter: 0.012, branches: 0, regen: 0.045, life: Infinity });
      d.s2 = fx.bolt?.(m.clone(), end.clone(), { col: [0.9, 2.2, 4], glow: [0.15, 0.4, 1.2], width: 0.07, core: 0.15, levels: 3, jitter: 0.02, branches: 0, regen: 0.06, life: Infinity });
    }
    d.beam?.set(m, end); d.s1?.set(m, end); d.s2?.set(m, end);
    // the struck end: frost sparks, spray and mist
    if ((d.endT -= dt) <= 0) {
      d.endT = 0.05;
      fx?.sparkBurst(end, { color: WHITE, color1: ICE, count: 3, speed: 4, glow: 0.3 });
      if (k.rng() < 0.4) splashFx(g, end, 0.6);
      if (k.rng() < 0.3) fx?.motes?.burst?.('frost', end, 2, { speed: 1.2, radius: 0.2, seed: k.ev.seed + ((k.t * 100) | 0) });
    }
    // mist off the mouth (world layer, it drifts back over the hands)
    if ((d.mistT -= dt) <= 0) {
      d.mistT = 0.07;
      fx?.particles.spawn({ x: m.x, y: m.y, z: m.z, vx: _d.x * 0.6, vy: 0.15, vz: _d.z * 0.6, life: 0.5, size: 0.06, size1: 0.22, sizePow: 0.5, color: [...MIST, 0.25], color1: [...MIST, 0], frame: FRAME.smoke + (k.rng() < 0.5 ? 1 : 0), drag: 2.5 });
    }
    // ice spikes stride out along the floor under the ray (near -> far), each cluster a slow zone + aura source
    if ((d.spT -= dt) <= 0) {
      d.spT = p.spikeEvery;
      const x = Math.min(d.spX, len - 0.3);
      if (x > 1.2) {
        _g.copy(eye).addScaledVector(_d, x);
        const fy = k.floorY(_g);
        if (_g.y - fy < 2.6) spikeCluster(g, _a.set(_g.x, fy, _g.z), k.rng, { n: 3 });
      }
      d.spX = d.spX + 0.85 > Math.min(len, 24) ? 1.6 + k.rng() * 0.6 : d.spX + 0.85;
    }
    if (!k.local) return;
    if ((d.acc += dt) >= p.tick) { d.acc -= p.tick; k.hitRay(eye, _d, len, p.dps * p.tick, { pierce: p.pierce, knock: 0.3, stagger: 0.4, headMul: 1.2 }); }
    if (g.shake < 0.05) g.addShake(0.05 - g.shake);   // a steady 0.05 trauma while it runs
  },
  end(k) {
    const g = k.game, d = k.data;
    d.beam?.stop(); d.s1?.stop(); d.s2?.stop();
    d.loop?.stop?.(0.2);
    d.tunnel?.stop?.(0.3);
    sfx(g, 'chiwen_ray_end', k.local ? { volume: 0.7 } : { pos: k.pos, volume: 0.7 });
    if (!k.local) return;
    g.arsenal?.fovHold?.(0, 0.3);
    g.hud?.border?.(CY, 0, 0.01);
    const cw = cwOfK(k);
    if (cw && cw.beam === k) cw.beam = null;
  },
});

// 潮球 (★ tap): a slow water orb along the floor, three pulling pulses, then it bursts.
registerSkill('tideOrb', {
  level: 'L2', defaults: { speed: 6, range: 12, pulses: 3, every: 0.6, r: 3, dmg: 120, pull: 1, zh: '潮球' },
  start(k) {
    const g = k.game, d = k.data, p = k.p;
    barrier(k);
    d.dir = _a.copy(k.dir).setY(0).normalize().clone();
    if (d.dir.lengthSq() < 0.5) d.dir.set(0, 0, -1);
    d.pos = k.muzzle(V3()).addScaledVector(d.dir, 0.5);
    d.h = d.pos.y - k.floorY(d.pos);
    d.n = 0; d.next = p.every; d.dist = 0; d.blocked = false; d.dripT = 0;
    k.dur = p.every * p.pulses + 0.3;
    d.ghost = g.fx?.summons?.ghost?.({ shape: 'orb', pos: d.pos, size: 0.6, base: [0.42, 0.72, 1.0], core: [1.0, 2.6, 3.8], rim: [1.5, 3.4, 5.4], edge: WHITE,
      opacity: 0.42, glaze: 1.7, flowSpeed: 1.4, appear: 0.12, life: Infinity, out: 0.25, motion: null, exit: { kind: 'spray', count: 28, speed: 3.6 }, seed: k.ev.seed });
    d.aura = { pos: d.pos, r: 4, until: Infinity };
    sys(g).auraSrc.add(d.aura);
    sfx(g, 'chiwen_orb_cast', k.local ? { volume: 0.9 } : { pos: d.pos, volume: 0.9 });
    if (k.local && g.arsenal?.state === 'idle' && !g.arsenal._inspecting) g.arsenal.playClip('chiwen_orb_push');
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p, P = g.fx?.particles;
    // roll forward (stops at a wall), riding ~ the cast height above the floor (0.6 .. 1.3 m)
    if (!d.blocked && d.dist < p.range) {
      const step = p.speed * dt;
      if (g.world?.collision?.raycast(d.pos, d.dir, step + 0.35)) d.blocked = true;
      else { d.pos.addScaledVector(d.dir, step); d.dist += step; }
    }
    const fy = k.floorY(d.pos);
    d.pos.y = damp(d.pos.y, fy + clamp(d.h, 0.6, 1.3), 6, dt);
    if (d.ghost) { d.ghost.obj.position.copy(d.pos); d.ghost.base.copy(d.pos); d.ghost.obj.rotation.y += dt * 4; d.ghost.obj.rotation.x += dt * 2.5; }
    // dripping, misting, a swirl of light inside
    if ((d.dripT -= dt) <= 0) {
      d.dripT = 0.04;
      const a = k.t * 9;
      P?.spawn({ additive: true, x: d.pos.x + Math.cos(a) * 0.18, y: d.pos.y + Math.sin(a * 1.3) * 0.12, z: d.pos.z + Math.sin(a) * 0.18, life: 0.18, size: 0.06, size1: 0.02, color: [...WHITE, 1], color1: [...ICE, 0], frame: FRAME.glow });
      P?.spawn({ x: d.pos.x + (k.rng() - 0.5) * 0.4, y: d.pos.y - 0.25, z: d.pos.z + (k.rng() - 0.5) * 0.4, vy: -0.5, life: 0.5, size: 0.02, stretch: 0.02, color: [0.88, 0.95, 1, 0.8], color1: [0.88, 0.95, 1, 0], frame: FRAME.drop, gravity: 9.8 });
      if (k.rng() < 0.35) P?.spawn({ x: d.pos.x, y: d.pos.y, z: d.pos.z, vy: 0.1, life: 0.7, size: 0.25, size1: 0.6, sizePow: 0.5, color: [...MIST, 0.16], color1: [...MIST, 0], frame: FRAME.puff + ((k.rng() * 4) | 0), lit: true, drag: 2 });
    }
    while (d.n < p.pulses && k.t >= d.next) { d.n++; d.next += p.every; pulse(k, d.n === p.pulses); }
    return true;
  },
  end(k) {
    const g = k.game, d = k.data;
    sys(g).auraSrc.delete(d.aura);
    // a short-lived aura where it burst, so a teammate reloading there keeps the bonus for a moment
    sys(g).auraSrc.add({ pos: d.pos.clone(), r: 4, until: g.time + 1.5 });
    d.ghost?.dissolveOut?.(0.25);
    const at = _b.set(d.pos.x, k.floorY(d.pos), d.pos.z);
    g.fx?.impact?.(SURF.water, at, UP, _c.set(0, -1, 0), { decal: false, big: 1.6 });
    splashFx(g, d.pos, 1.6);
    g.fx?.decals?.add(at, UP, { frame: DECAL.pool, size: 2.2, tint: DECAL_TINT.none, alpha: 0.35, life: 4, fade: 2 });
    sfx(g, 'chiwen_orb_burst', k.local ? { volume: 0.9 } : { pos: d.pos, volume: 0.9 });
  },
});
function pulse(k, last) {
  const g = k.game, d = k.data, p = k.p, fx = g.fx, c = d.pos;
  const fy = k.floorY(c);
  fx?.shockwave(_a.set(c.x, fy + 0.05, c.z), { normal: UP, r0: 0.3, r1: p.r, life: 0.42, color: [1.2, 2.8, 3.8], thin: false });
  fx?.shockwave(c, { r0: 0.3, r1: 1.2, life: 0.3, color: [2, 3.6, 4.6], thin: true });
  d.ghost?.flash?.(1);
  splashFx(g, _a.set(c.x, fy, c.z), 1.1);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.283;
    fx?.particles.spawn({ x: c.x + Math.cos(a) * p.r, y: fy + 0.1, z: c.z + Math.sin(a) * p.r, vx: -Math.cos(a) * 4.5, vy: 0.6, vz: -Math.sin(a) * 4.5, life: 0.55, size: 0.04, stretch: 0.05, color: [0.88, 0.95, 1, 0.7], color1: [0.88, 0.95, 1, 0], frame: FRAME.drop, drag: 1.5, gravity: 3 });
  }
  sfx(g, 'chiwen_orb_pulse', k.local ? { volume: 0.8 } : { pos: c, volume: 0.8 });
  if (!k.local) return;
  // pull ~1 m toward the centre (knock < 0) with the damage; falloff keeps the edge meaningful
  k.hurt(_a.set(c.x, fy + 0.9, c.z), p.r, p.dmg, { knock: -p.pull * 7 / 1.2, stagger: 0.7, falloffMin: 0.6, explosive: false });
  g.addShake(last ? 0.12 : 0.06);
}

// 吞潮 (★ held, ultimate): the 5-beat summon (§1.7.3) at the aimed floor point.
registerSkill('swallowTide', {
  level: 'L3', aim: true, defaults: { range: 28, r: 6.5, pullR: 12, pullDist: 4, bite: 500, biteR: 6, spit: 400, spitR: 4, dur: 3.7, zh: '吞潮' },
  start(k) {
    const g = k.game, d = k.data;
    d.c = (k.at || k.feet()).clone();
    d.beat = 0; d.spits = 0; d.inT = 0;
    k.dur = k.p.dur;
    // the spirit faces the caster
    const cp = k.feet(V3());
    d.yaw = Math.atan2(-(cp.x - d.c.x), -(cp.z - d.c.z));
    sfx(g, 'chiwen_ult_inhale', k.local ? { volume: 1 } : { pos: d.c });
    if (!k.local) return;
    const cw = cwOfK(k);
    if (cw) cw.ult = k;
    g.hud?.card?.(k.cardText(), { color: BL, sub: k.def.en });
    g.hud?.border?.(CY, 0.25, k.p.dur);
    g.arsenal?.fovKick?.(3, 0.6);
    if (g.arsenal?.state === 'idle') g.arsenal.playClip('chiwen_ult_cast');
  },
  update(k, dt) {
    runLater2(k);
    const g = k.game, fx = g.fx, d = k.data, p = k.p, t = k.t, c = d.c;
    // ① 0-0.3 inhale: spray streams converge on the caster's muzzle
    if (t < 0.32 && (d.inT -= dt) <= 0) {
      d.inT = 0.03;
      const m = k.muzzle(_a);
      for (let i = 0; i < 3; i++) {
        const a = k.rng() * 6.283, r = 1.2 + k.rng() * 1.2;
        _b.set(m.x + Math.cos(a) * r, m.y + (k.rng() - 0.3) * 1.2, m.z + Math.sin(a) * r);
        _c.subVectors(m, _b).multiplyScalar(3.2);
        fx?.particles.spawn({ x: _b.x, y: _b.y, z: _b.z, vx: _c.x, vy: _c.y, vz: _c.z, life: 0.3, size: 0.02, stretch: 0.05, color: [0.88, 0.96, 1, 0.8], color1: [0.88, 0.96, 1, 0.2], frame: FRAME.drop });
      }
    }
    // ② 0.3 the reversed water vortex on the floor
    if (d.beat < 1 && t >= 0.3) {
      d.beat = 1;
      d.sigil = fx?.sigils?.sigil?.(c, { design: 'vortex', radius: p.r, color: ICE, color1: DEEP, intensity: 1.3, life: 3.3, grow: 0.3, spin: -1.6, seed: k.ev.seed });
      fx?.sigils?.ring?.(c, { r1: p.r, color: [1.4, 3, 4], life: 0.5 });
      sfx(g, 'chiwen_ult_vortex', { pos: c, volume: 0.9 });
      if (k.local) g.addShake(0.1);
    }
    // ③ 0.6 the water 螭吻 bursts out of it (rising GHOST), water and rubble thrown up, the screen streaks (caster)
    if (d.beat < 2 && t >= 0.6) {
      d.beat = 2;
      const big = k.level >= 3;
      d.ghost = fx?.summons?.ghost?.({ shape: 'serpent', pos: c, yaw: d.yaw, size: big ? 9.5 : 6, motion: 'rise', appear: 0.42, life: Infinity, out: 0.55,
        base: [0.5, 0.74, 1.0], core: [1.0, 2.8, 4.2], rim: [1.2, 3.0, 5.2], edge: WHITE, opacity: 0.52, glaze: 1.4, flowSpeed: 0.9,
        wave: { amp: 0.05, hz: 0.6, axis: [1, 0, 0], len: 1.2 }, exit: { kind: 'spray', count: big ? 70 : 30, speed: 5 }, seed: k.ev.seed });
      if (d.ghost) d.ghost.obj.rotation.order = 'YXZ';
      burstUp(k, c, big ? 1 : 0.6);
      sfx(g, 'chiwen_ult_roar', k.local ? { volume: 1 } : { pos: c });
      if (k.local) { g.addShake(0.3); if (clipComfort.overlay) fx?.overlay?.radial?.(0.85, 0.5, { color: [0.7, 1.4, 2] }); }
    }
    const h = d.ghost;
    if (h?.alive) {
      // posture: rise, lean to roar (1.0), duck and bite (1.1-1.7), rear back and spit (1.8-3.0), sink (3.0+)
      const lean = t < 1.0 ? 0 : t < 1.6 ? -0.28 * Math.sin((t - 1.0) / 0.6 * Math.PI) : t < 3.0 ? 0.12 * Math.sin((t - 1.8) * 7.85) * Math.max(0, 1 - (t - 2.8) * 4) : 0;
      h.obj.rotation.x = damp(h.obj.rotation.x, lean, 10, dt);
      if (t >= 1.05 && !d.ducked) { d.ducked = true; h.lunge?.(_a.set(c.x, c.y - 2.6, c.z), 0.6); }
    }
    // ④a 1.1-1.6 吞: everything within 12 m is dragged toward the mouth; 1.6 the bite
    if (d.beat < 3 && t >= 1.1) {
      d.beat = 3;
      vortexStreams(k, c, p.pullR);
      if (k.local) pullIn(k, c, p.pullR, p.pullDist);
      sfx(g, 'chiwen_ult_bite', { pos: c, volume: 0.6 });
    }
    if (d.beat < 4 && t >= 1.62) {
      d.beat = 4;
      fx?.shockwave(_a.set(c.x, c.y + 0.08, c.z), { normal: UP, r0: 0.5, r1: p.biteR + 1, life: 0.45, color: [2, 3.6, 4.6], thin: false });
      splashFx(g, _a.set(c.x, c.y + 0.2, c.z), 3);
      fx?.impact?.(SURF.water, _b.set(c.x, c.y + 0.02, c.z), UP, _c.set(0, -1, 0), { decal: false, big: 3 });
      groundDust(k, c, 2.5, 10);
      h?.flash?.(1.5);
      sfx(g, 'chiwen_ult_bite', { pos: c, volume: 1 });
      if (k.local) { k.hurt(_a.set(c.x, c.y + 0.9, c.z), p.biteR, p.bite, { knock: 3, stagger: 1, falloffMin: 1, explosive: false }); g.hitStop?.(clipComfort.hitstop ? 0.1 : 0); g.addShake(0.4); }
    }
    // ④b 1.8 / 2.2 / 2.6 吐: three water columns on the densest groups
    if (d.beat >= 4 && d.spits < 3 && t >= 1.8 + d.spits * 0.4) {
      if (!d.targets) d.targets = densest(g, c, k.dir, 3, p.spitR);
      const tp = d.targets[d.spits++];
      spit(k, tp);
    }
    // ⑤ 3.0 it sinks back as spray and ice; the floor frosts 3 s (slow)
    if (d.beat < 5 && t >= 3.0) {
      d.beat = 5;
      h?.dissolveOut?.(0.55);
      splashFx(g, _a.set(c.x, c.y + 0.3, c.z), 3.2);
      fx?.impact?.(SURF.water, _b.set(c.x, c.y + 0.02, c.z), UP, _c.set(0, -1, 0), { decal: false, big: 2.5 });
      fx?.motes?.burst?.('frost', _a.set(c.x, c.y + 1.5, c.z), 22, { speed: 3, radius: 1.5, seed: k.ev.seed + 5 });
      fx?.motes?.burst?.('shard', _a.set(c.x, c.y + 1.2, c.z), 10, { palette: [[0.14, 0.29, 0.65], [0.91, 0.96, 1], [0.18, 0.56, 0.31]], speed: 4, spread: 1, radius: 0.8, seed: k.ev.seed + 6 });
      d.frost = fx?.sigils?.sigil?.(c, { design: 'vortex', radius: p.r * 0.85, color: [1.4, 2.0, 2.4], color1: [0.6, 1.2, 2.0], intensity: 0.5, life: 3, grow: 0.1, spin: 0.15, seed: k.ev.seed + 7 });
      for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.283 + k.rng() * 0.2, r = p.r * (0.35 + k.rng() * 0.55); spikeCluster(g, _a.set(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r), k.rng, { n: 2, life: 3, r: 1.6, aura: false }); }
      sys(g).zones.push({ pos: c.clone(), r: p.r, until: g.time + 3, slow: 0.4 });
      g.fx?.decals?.add(c, UP, { frame: DECAL.pool, size: p.r * 1.3, tint: DECAL_TINT.none, alpha: 0.3, life: 4, fade: 2 });
      sfx(g, 'chiwen_ult_fall', { pos: c, volume: 0.9 });
    }
    return t < k.dur;
  },
  end(k) {
    const d = k.data, g = k.game;
    d.sigil?.stop?.(0.4);
    if (d.ghost?.alive) d.ghost.dissolveOut(0.4);
    sfx(g, 'chiwen_ult_end', k.local ? { volume: 0.7 } : { pos: d.c, volume: 0.7 });
    if (!k.local) return;
    const cw = cwOfK(k);
    if (cw && cw.ult === k) cw.ult = null;
  },
});

/** Water bursting up out of the vortex + realistic anchoring: dust, rubble, a wet stain (§1.1 #5). */
function burstUp(k, c, s = 1) {
  const g = k.game, fx = g.fx, P = fx?.particles;
  fx?.impact?.(SURF.water, _a.set(c.x, c.y + 0.02, c.z), UP, _b.set(0, -1, 0), { decal: false, big: 3.5 * s });
  for (let i = 0; i < 26 * s; i++) {
    const a = k.rng() * 6.283, r = k.rng() * 2.2;
    P?.spawn({ x: c.x + Math.cos(a) * r, y: c.y + 0.2, z: c.z + Math.sin(a) * r, vx: Math.cos(a) * 2, vy: 6 + k.rng() * 7, vz: Math.sin(a) * 2, life: 1 + k.rng() * 0.5, size: 0.05, stretch: 0.04, color: [0.88, 0.95, 1, 0.9], color1: [0.88, 0.95, 1, 0], frame: FRAME.drop, gravity: 9.8 });
  }
  for (let i = 0; i < 8 * s; i++) {
    const a = k.rng() * 6.283;
    P?.spawn({ x: c.x + Math.cos(a) * 1.2, y: c.y + 0.5, z: c.z + Math.sin(a) * 1.2, vx: Math.cos(a) * 1.2, vy: 1 + k.rng(), vz: Math.sin(a) * 1.2, life: 1.6, size: 0.8, size1: 2.6, sizePow: 0.5, color: [...MIST, 0.35], color1: [...MIST, 0], frame: FRAME.puff + ((k.rng() * 4) | 0), lit: true, drag: 1.4 });
  }
  groundDust(k, c, 2.8, 12);
  fx?.gibs?.(_a.set(c.x, c.y + 0.3, c.z), UP, Math.round(8 * s), [0.32, 0.3, 0.28], 1.4);   // rubble chips
  fx?.decals?.add(c, UP, { frame: DECAL.pool, size: 3.4 * s, tint: DECAL_TINT.none, alpha: 0.45, life: 6, fade: 2 });   // wet ground
  fx?.lights?.flash(_a.set(c.x, c.y + 2, c.z), CY, 60, 14, 0.5);
}
function groundDust(k, c, r, n) {
  const fx = k.game.fx;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + k.rng() * 0.4;
    fx?.knockDust(_a.set(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r), _b.set(Math.cos(a) * 5, 0, Math.sin(a) * 5), 1.2);
  }
}
/** Spiralling streams sucked into the vortex (every client). */
function vortexStreams(k, c, R0) {
  const P = k.game.fx?.particles;
  for (let i = 0; i < 36; i++) {
    const a = k.rng() * 6.283, r = R0 * (0.4 + k.rng() * 0.6);
    const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    // inward + swirling (counter-clockwise, the reversed vortex)
    const vx = -Math.cos(a) * r * 1.6 - Math.sin(a) * 5, vz = -Math.sin(a) * r * 1.6 + Math.cos(a) * 5;
    P?.spawn({ x, y: c.y + 0.3 + k.rng() * 0.6, z, vx, vy: 0.4, vz, life: 0.55, size: 0.08, stretch: 0.06, color: [0.88, 0.95, 1, 0.75], color1: [0.88, 0.95, 1, 0], frame: FRAME.drop, drag: 0.5 });
    if (i % 3 === 0) P?.spawn({ x, y: c.y + 0.2, z, vx: vx * 0.5, vy: 0.2, vz: vz * 0.5, life: 0.8, size: 0.5, size1: 1.2, sizePow: 0.5, color: [...MIST, 0.22], color1: [...MIST, 0], frame: FRAME.puff + (i % 4), lit: true, drag: 1 });
  }
}
/** 吞: drag every zombie within R toward c by `dist` metres (host shoves; a guest's tiny hit carries it). */
function pullIn(k, c, R0, dist) {
  const g = k.game;
  for (const z of g.zombies?.inRadius(c, R0) || []) {
    const dir = _a.set(c.x - z.pos.x, 0, c.z - z.pos.z);
    const d = dir.length();
    if (d < 0.6) continue;
    dir.multiplyScalar(1 / d);
    const want = Math.min(dist, d - 0.8) * 7;    // knock velocity that travels `dist` (decay exp(-7 t))
    if (g.zombies.authority && z.kvel) { if (!z.def?.boss) { z.kvel.x += dir.x * want; z.kvel.z += dir.z * want; } continue; }
    z.damage({ amount: 1, part: 'body', point: z.center(V3()), dir: dir.clone(), knock: z.def?.boss ? 0 : want / 1.2, stagger: 1, weapon: ID, shooter: g.localId, skill: 'swallowTide' });
  }
}
/** The three densest groups ahead of the caster (greedy 4 m clusters); falls back round the vortex. */
function densest(g, c, dir, n, r) {
  const zs = (g.zombies?.list || []).filter((z) => z.alive && z.pos.distanceTo(c) < 18);
  const out = [];
  while (out.length < n && zs.length) {
    let best = null, bc = 0;
    for (const a of zs) { let cnt = 0; for (const b of zs) if (a.pos.distanceToSquared(b.pos) < r * r) cnt++; if (cnt > bc) { bc = cnt; best = a; } }
    const grp = zs.filter((b) => b.pos.distanceToSquared(best.pos) < r * r);
    const p = V3();
    for (const b of grp) p.add(b.pos);
    out.push(p.multiplyScalar(1 / grp.length));
    for (const b of grp) zs.splice(zs.indexOf(b), 1);
  }
  const f = _a.set(dir.x, 0, dir.z).normalize();
  const side = _b.set(-f.z, 0, f.x);
  const fills = [[2.5, 0], [4.5, -3], [4.5, 3]];
  for (let i = 0; out.length < n; i++) out.push(V3().copy(c).addScaledVector(f, fills[i % 3][0]).addScaledVector(side, fills[i % 3][1]));
  return out;
}
/** 吐: a jet from the spirit's head to `tp`, then a water pillar there (400 in 4 m, tossed up). */
function spit(k, tp) {
  const g = k.game, fx = g.fx, d = k.data, p = k.p;
  const at = V3().set(tp.x, k.floorY(_a.set(tp.x, tp.y + 1, tp.z)), tp.z);
  const head = V3();
  if (d.ghost?.alive) d.ghost.obj.localToWorld(head.set(0, 1.0, -0.12)); else head.set(d.c.x, d.c.y + 6, d.c.z);
  fx?.beam?.(head, _a.set(at.x, at.y + 0.5, at.z), { core: WHITE, glow: [0.5, 1.4, 2.8], wCore: 0.12, wGlow: 0.5, life: 0.28, shrink: 0.2 });
  for (let i = 0; i < 10; i++) {
    const u = k.rng();
    _b.lerpVectors(head, at, u);
    fx?.particles.spawn({ x: _b.x, y: _b.y, z: _b.z, vx: (k.rng() - 0.5) * 2, vy: k.rng() * 2, vz: (k.rng() - 0.5) * 2, life: 0.5, size: 0.06, stretch: 0.04, color: [0.88, 0.95, 1, 0.85], color1: [0.88, 0.95, 1, 0], frame: FRAME.drop, gravity: 9.8 });
  }
  later2(k, 0.12, () => {
    fx?.sigils?.pillar?.(at, { radius: 1.3, height: 9, color: [1.2, 3.2, 4.6], color1: [3, 4.6, 5.6], life: 0.8, rise: true, motes: 10, ring: true });
    fx?.impact?.(SURF.water, _a.set(at.x, at.y + 0.02, at.z), UP, _b.set(0, -1, 0), { decal: false, big: 2.6 });
    splashFx(g, _a.set(at.x, at.y + 0.3, at.z), 2.2);
    groundDust(k, at, 1.6, 7);
    fx?.decals?.add(at, UP, { frame: DECAL.pool, size: 2.4, tint: DECAL_TINT.none, alpha: 0.3, life: 4, fade: 2 });
    sfx(g, 'chiwen_ult_spit', k.local ? { pos: at, volume: 1 } : { pos: at, volume: 0.9 });
    if (!k.local) return;
    k.hurt(_a.set(at.x, at.y + 0.9, at.z), p.spitR, p.spit, { knock: 5, stagger: 1, falloffMin: 0.55, explosive: false });
    // 拋起: the host tosses them up (a guest's caster only shoves)
    if (g.zombies?.authority) for (const z of g.zombies.inRadius(at, p.spitR)) if (z.alive && z.kvel && !z.def?.boss) z.kvel.y = Math.max(z.kvel.y || 0, 5.5);
    g.addShake(0.25);
    g.arsenal?._clipEvent?.('haptic', 'thud');
  });
}
/** Skill-time delayed calls: queued on the instance, run by its own update (they die with it). */
function later2(k, sec, fn) { (k.data.q ||= []).push([k.t + sec, fn]); }
function runLater2(k) { const q = k.data.q; if (!q) return; for (let i = q.length - 1; i >= 0; i--) if (k.t >= q[i][0]) { const f = q[i][1]; q.splice(i, 1); f(); } }

// 螭吻護甲 (crisis, via crisis.js `fx`): a water dragon coils round the player as the armour breaks.
registerSkill('chiwen_crisis', {
  level: 'L1',
  start(k) {
    const g = k.game, fx = g.fx, c = k.feet(V3());
    const h = fx?.summons?.ghost?.({ shape: 'serpent', pos: c, size: 2.6, motion: 'rise', appear: 0.18, life: 0.85, out: 0.35, base: [0.5, 0.75, 1], core: [1, 2.6, 4],
      rim: [1.4, 3.2, 5], edge: WHITE, opacity: 0.48, glaze: 1.4, wave: { amp: 0.1, hz: 1.4, axis: [1, 0, 0], len: 1 }, exit: { kind: 'spray', count: 24, speed: 4 }, seed: k.ev.seed });
    // two water ribbons spiral up round the player for a second
    const rib = [0, 1].map(() => fx?.trail?.({ width: 0.14, life: 0.32, color: [1.8, 3.6, 4.6, 0.9], color1: [0.4, 1.1, 2.4, 0], segs: 20 }));
    let t = 0;
    const run = { update: (dt) => {
      t += dt;
      if (h?.alive) h.obj.rotation.y += dt * 9;
      rib.forEach((r, i) => { const a = t * 11 + i * Math.PI, rr = 0.95 + 0.25 * Math.sin(t * 6); r?.push(_a.set(c.x + Math.cos(a) * rr, c.y + 0.15 + t * 1.9, c.z + Math.sin(a) * rr)); });
      if (t > 1.0) { rib.forEach((r) => r?.stop()); g.systems.splice(g.systems.indexOf(run), 1); }
    } };
    g.systems.push(run);
    fx?.impact?.(SURF.water, _a.set(c.x, c.y + 0.02, c.z), UP, _b.set(0, -1, 0), { decal: false, big: 1.8 });
    splashFx(g, _a.set(c.x, c.y + 0.4, c.z), 1.8);
    sfx(g, 'chiwen_crisis', k.local ? { volume: 0.9 } : { pos: c, volume: 0.9 });
  },
});

// KE_FINAL (§1.10): the wave's last kill -- one water column there (no damage); teammates see a thin cyan column.
registerSkill('chiwen_final', {
  level: 'L2', dur: 1.2,
  start(k) {
    const g = k.game, fx = g.fx, c = k.pos.clone();
    c.y = k.floorY(_a.set(c.x, c.y + 1, c.z));
    if (!k.local) { fx?.sigils?.pillar?.(c, { radius: 0.45, height: 7, color: [0.8, 2.4, 3.4], life: 0.7, motes: 4, ring: false }); return; }
    fx?.sigils?.sigil?.(c, { design: 'vortex', radius: 2.2, color: ICE, color1: DEEP, life: 1.2, spin: -1.2, seed: k.ev.seed });
    fx?.sigils?.pillar?.(c, { radius: 0.9, height: 8, color: [1.2, 3.2, 4.6], color1: [3, 4.6, 5.6], life: 0.9, rise: true, motes: 10 });
    fx?.impact?.(SURF.water, _b.set(c.x, c.y + 0.02, c.z), UP, _e.set(0, -1, 0), { decal: false, big: 2 });
    splashFx(g, _b.set(c.x, c.y + 0.3, c.z), 1.8);
    sfx(g, 'chiwen_final', { pos: c, volume: 0.9 });
  },
});

// ------------------------------------------------------------------------------------------ clips
const Z3 = [0, 0, 0];
const scaleWave = (t0, step, up = 0.05, down = 0.1) => {
  const tr = {};
  for (let i = 1; i <= 6; i++) { const a = t0 + (i - 1) * step; tr['fx_scale' + i] = [[0, 0], [a, 0], [a + up, 1, 'out3'], [a + up + down, 0, 'in3'], [1, 0]]; }
  return tr;
};
/**
 * First draw (1.5 s, once a match, fire cancels): the rifle flips in from the right (0-0.4 s), the six scale
 * groups lift 4° tail -> head with the seams flaring and droplets shaken off (0.4-0.8), the water starts to
 * circulate in the tube (0.8-1.2), the 螭吻 jaw opens and shuts (1.4) and the pose holds.
 */
registerClip('chiwen_first', (vm) => ({
  duration: 1.5,
  tracks: {
    gunPos: [[0, [0.13, -0.05, 0.05]], [0.26, [0.004, 0.006, 0], 'out3'], [0.45, [-0.03, 0.026, 0.018], 'inOut'], [0.72, [-0.034, 0.03, 0.02]], [0.86, [0, 0.003, 0], 'out3'], [0.94, [0, 0.002, 0]], [1, Z3]],
    gunRot: [[0, [8, -42, 150]], [0.26, [2, 3, -8], 'out3'], [0.45, [8, 30, -26], 'inOut'], [0.72, [9, 33, -28]], [0.86, [1, -1, 1], 'out3'], [0.94, [1, -1, 1]], [1, Z3]],
    fx_jaw: [[0, 0], [0.88, 0], [0.915, 0.75, 'out3'], [0.95, 0, 'in3'], [1, 0]],
    ...scaleWave(0.27, 0.042),
  },
  events: [
    [0, 'anchorL', ['rest', 0.05]], [0, 'glow', { to: 0.25, sec: 0 }], [0.02, 'cw', 'first'], [0.18, 'haptic', 'tick'],
    [0.27, 'cw', 'scales'], [0.3, 'glow', { to: 1.7, sec: 0.2 }], [0.32, 'cw', { do: 'droplets', n: 10 }], [0.53, 'cw', { do: 'flow', sec: 0.9 }],
    [0.62, 'glow', { to: 1, sec: 0.5 }], [0.74, 'anchorL', ['grip_l', 0.14]], [0.78, 'poseL', vm?.supportGrip?.pose || 'cradle'],
    [0.88, 'cw', 'roar'], [0.9, 'haptic', 'tick'],
  ],
}));

/**
 * Inspect (4.6 s; holding loops the opening tilt): a slow CS2 tilt so the glaze sweep crosses the scales (0-0.8 s),
 * roll to the water tube and run the fingers along it -- the water races (1.4-2.4), lift the gun so the 螭吻 faces
 * the camera and blows a bubble (3.0), hold the pose (3.8-4.6). Mythic: the world dims into sea mist for 2.5 s.
 */
registerClip('chiwen_inspect', (vm) => ({
  duration: 4.6, loop: [0.06, 0.17],
  tracks: {
    gunPos: [[0, Z3], [0.08, [-0.03, 0.02, 0.03]], [0.13, [-0.04, 0.026, 0.024]], [0.17, [-0.03, 0.02, 0.03]],
      [0.26, [-0.05, 0.035, 0.05], 'inOut'], [0.5, [-0.054, 0.038, 0.054]],
      [0.6, [0.03, 0.05, -0.01], 'inOut'], [0.65, [0.034, 0.052, -0.014]], [0.83, [0.032, 0.05, -0.012]],
      [0.93, [0, 0.004, 0], 'inOut'], [1, Z3]],
    gunRot: [[0, Z3], [0.08, [8, 28, -24]], [0.13, [11, 36, -32]], [0.17, [8, 28, -24]],
      [0.26, [-4, 20, -56], 'inOut'], [0.5, [-2, 23, -52]],
      [0.6, [12, 92, -6], 'inOut'], [0.65, [14, 96, -8]], [0.83, [13, 94, -7]],
      [0.93, [1, -2, 2], 'inOut'], [1, Z3]],
    fx_jaw: [[0, 0], [0.64, 0], [0.655, 0.5, 'out3'], [0.7, 0.12], [0.76, 0], [1, 0]],
    env: [[0, 0], [0.1, 1], [0.88, 1], [1, 0]],
    ...scaleWave(0.09, 0.012, 0.03, 0.06),
  },
  events: [
    [0.02, 'cw', 'world'], [0.04, 'snd', 'cloth'], [0.22, 'snd', 'cloth'],
    [0.27, 'anchorL', ['tube_b', 0.18]], [0.31, 'anchorL', ['tube_a', 0.9]], [0.31, 'cw', { do: 'flow', sec: 1.3 }], [0.31, 'haptic', 'tick'],
    [0.52, 'anchorL', ['grip_l', 0.22]], [0.55, 'poseL', vm?.supportGrip?.pose || 'cradle'], [0.56, 'snd', 'cloth'],
    [0.652, 'cw', 'bubble'], [0.66, 'cw', { do: 'eyes', k: 1.4 }], [0.84, 'haptic', 'tick'],
  ],
}));

/** Rare inspect (1/10): the 螭吻 blows a big bubble at the camera, a finger pokes it, it splashes on the glove. */
registerClip('chiwen_bubble_mirror', (vm) => ({
  duration: 4.6, loop: [0.05, 0.14],
  tracks: {
    gunPos: [[0, Z3], [0.07, [-0.03, 0.02, 0.03]], [0.11, [-0.038, 0.025, 0.026]], [0.14, [-0.03, 0.02, 0.03]],
      [0.26, [0.03, 0.05, -0.01], 'inOut'], [0.72, [0.034, 0.052, -0.012]], [0.84, [0.03, 0.05, -0.01]], [0.94, [0, 0.004, 0], 'inOut'], [1, Z3]],
    gunRot: [[0, Z3], [0.07, [8, 28, -24]], [0.11, [10, 34, -30]], [0.14, [8, 28, -24]],
      [0.26, [12, 92, -6], 'inOut'], [0.72, [14, 96, -8]], [0.84, [13, 94, -7]], [0.94, [1, -2, 2], 'inOut'], [1, Z3]],
    fx_jaw: [[0, 0], [0.3, 0], [0.34, 0.6, 'out3'], [0.5, 0.45], [0.56, 0.1], [0.62, 0], [1, 0]],
    env: [[0, 0], [0.1, 1], [0.88, 1], [1, 0]],
  },
  events: [
    [0.02, 'cw', 'world'], [0.04, 'snd', 'cloth'], [0.24, 'snd', 'cloth'], [0.33, 'cw', 'bigbubble'],
    [0.5, 'anchorL', ['mouth', 0.3]], [0.54, 'poseL', 'point'], [0.6, 'cw', 'pop'], [0.6, 'haptic', 'tick'],
    [0.68, 'anchorL', ['grip_l', 0.25]], [0.72, 'poseL', vm?.supportGrip?.pose || 'cradle'], [0.74, 'cw', { do: 'droplets', n: 6 }],
  ],
}));

/** Rare reload (1/8): the water in the tube whirls as the new tank seats (the rounds land when the normal clip's do). */
registerClip('chiwen_vortex', (vm, o = {}) => {
  const c = magReload(vm, o);
  return { ...c, extra: 0.1, events: [...c.events, [0.67, 'cw', 'vortex'], [0.68, 'cw', { do: 'tail', v: 20 }]] };
});

// ready layer idle extra (every 2.5 s while the ultimate is ready): a shiver down the scales, the jaw twitches
registerClip('chiwen_shiver', {
  duration: 0.6,
  tracks: {
    gunRot: [[0, Z3], [0.15, [1.2, -0.6, 1.6], 'out3'], [0.32, [-0.8, 0.4, -1]], [0.5, [0.4, -0.2, 0.5]], [1, Z3]],
    fx_jaw: [[0, 0], [0.1, 0.32, 'out3'], [0.3, 0.05, 'in3'], [1, 0]],
    ...scaleWave(0.05, 0.05, 0.08, 0.14),
  },
  events: [[0.02, 'cw', { do: 'eyes', k: 0.7 }]],
});
// idle tier 34-99 % (§1.17): the tail flicks, a ripple runs along the scales
registerClip('chiwen_flick', {
  duration: 0.9,
  tracks: { gunRot: [[0, Z3], [0.2, [0.6, 0.8, 1.2], 'out3'], [0.5, [-0.3, -0.4, -0.6]], [1, Z3]], ...scaleWave(0.1, 0.06, 0.06, 0.12) },
  events: [[0.04, 'cw', { do: 'tail', v: 18 }], [0.24, 'cw', { do: 'tail', v: -16 }]],
});
// rare idle (every 12 s at rest): the 螭吻 turns a little and blows a bubble
registerClip('chiwen_bubble', {
  duration: 1.4,
  tracks: {
    gunPos: [[0, Z3], [0.25, [0.004, 0.006, -0.004], 'inOut'], [0.75, [0.004, 0.006, -0.004]], [1, Z3, 'inOut']],
    gunRot: [[0, Z3], [0.25, [3, 12, -7], 'inOut'], [0.75, [3, 12, -7]], [1, Z3, 'inOut']],
    fx_jaw: [[0, 0], [0.3, 0], [0.37, 0.4, 'out3'], [0.5, 0.08], [1, 0]],
  },
  events: [[0.36, 'cw', 'bubble']],
});
// 吞潮 cast: the muzzle dips forward-down, the jaw gapes
registerClip('chiwen_ult_cast', {
  duration: 0.75,
  tracks: {
    gunPos: [[0, Z3], [0.3, [0, -0.03, -0.035], 'out3'], [0.7, [0, -0.02, -0.025]], [1, Z3, 'inOut']],
    gunRot: [[0, Z3], [0.3, [-18, 0, 5], 'out3'], [0.7, [-14, 0, 4]], [1, Z3, 'inOut']],
    fx_jaw: [[0, 0], [0.25, 1, 'out3'], [0.9, 1], [1, 0]],
  },
  events: [[0.05, 'haptic', 'thud'], [0.1, 'cw', { do: 'droplets', n: 8 }]],
});
// 潮球 cast: the gun pushes the orb out
registerClip('chiwen_orb_push', {
  duration: 0.45,
  tracks: { gunPos: [[0, Z3], [0.25, [0, 0.006, -0.045], 'out3'], [1, Z3, 'inOut']], gunRot: [[0, Z3], [0.25, [-3, 0, 1]], [1, Z3]], fx_jaw: [[0, 0], [0.2, 0.6, 'out3'], [0.6, 0], [1, 0]] },
  events: [[0.05, 'haptic', 'tick']],
});

// ------------------------------------------------------------------------------------------ crosshair (§1.9 #2)
// xh_wave: three short wave crests round a centre point (top, lower right, lower left), each curling at its lead;
// stroke only, hit-reactive (class "a"); ready lights the 4 nodes.
registerCrosshair('xh_wave', {
  draw(gap, c, s, c2 = c) {
    const R = Math.min(21, 11.5 + gap * 0.55), D = Math.PI / 180;
    let out = '';
    for (let k = 0; k < 3; k++) {
      const a0 = (-90 + k * 120) * D, pts = [];
      for (let i = 0; i <= 18; i++) {
        const u = i / 18, a = a0 + (u - 0.5) * 50 * D, r = R + Math.sin(u * Math.PI * 2) * 1.9 * Math.sin(u * Math.PI);
        pts.push(`${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`);
      }
      // the curl at the leading end: a small hook turning inward
      const ae = a0 + 25 * D, ex = Math.cos(ae), ey = Math.sin(ae);
      const hook = `Q${((R + 3.6) * ex - 2.6 * ey).toFixed(2)} ${((R + 3.6) * ey + 2.6 * ex).toFixed(2)} ${((R + 1.2) * ex - 3.2 * ey).toFixed(2)} ${((R + 1.2) * ey + 3.2 * ex).toFixed(2)}`;
      out += `<path class="a" d="M${pts.join(' L')} ${hook}" fill="none" stroke="${k ? c : c2}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return out + `<circle class="a" r="1.15" fill="${c}"/>`;
  },
  nodes: 28,
});
injectCSS('cf-xh-wave', '.xh2.act .a { filter: drop-shadow(0 0 2px currentColor); }');

// ------------------------------------------------------------------------------------------ kill mark (§1.9 #8)
// km_chiwen: (1) ink-wash wave strokes sweep in and curl, (2) the 螭吻 head rises out of the wave and takes its glaze
// (white porcelain, cobalt scales, jade fin, gilt lines), (3) full glow, (4) 點睛: the eye flashes with the ding.
// Headshot: a cross-star from the eye + an ice ring. All drawn procedurally (original art).
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
function headPath(S) {
  const P = (x, y) => [x * S, y * S];
  const p = new Path2D();
  const q = (cx, cy, x, y) => p.quadraticCurveTo(...P(cx, cy), ...P(x, y));
  p.moveTo(...P(0.27, 0.66)); q(0.2, 0.52, 0.3, 0.42);    // back of the neck
  q(0.36, 0.3, 0.47, 0.3);                                // crown
  q(0.58, 0.29, 0.63, 0.35);                              // forehead
  q(0.72, 0.36, 0.79, 0.34);                              // snout ridge
  q(0.86, 0.33, 0.87, 0.41);                              // nose
  q(0.88, 0.47, 0.8, 0.49);                               // upper lip
  p.lineTo(...P(0.6, 0.5));                               // mouth corner
  p.lineTo(...P(0.79, 0.555));                            // lower lip
  q(0.84, 0.6, 0.77, 0.63);                               // chin
  q(0.6, 0.68, 0.45, 0.66);                               // throat
  q(0.36, 0.7, 0.27, 0.66);
  p.closePath();
  return p;
}
registerKillMark('km_chiwen', {
  draw(ctx, S, t, o) {
    const p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const X = (x) => x * S;
    // (1) ink-wash wave: three brush strokes drawn in (dash), a curl on the left
    const strokes = [
      [[0.08, 0.86], [0.3, 0.74], [0.5, 0.82], [0.72, 0.76], [0.94, 0.84]],
      [[0.12, 0.78], [0.18, 0.66], [0.3, 0.64], [0.34, 0.74], [0.26, 0.78]],
      [[0.36, 0.9], [0.56, 0.86], [0.76, 0.9], [0.9, 0.88]],
    ];
    strokes.forEach((pts, i) => {
      const u = seg(t, i * 0.08, 0.3 + i * 0.08);
      if (u <= 0) return;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(X(pts[0][0]), X(pts[0][1]));
      for (let j = 1; j < pts.length - 1; j++) ctx.quadraticCurveTo(X(pts[j][0]), X(pts[j][1]), X((pts[j][0] + pts[j + 1][0]) / 2), X((pts[j][1] + pts[j + 1][1]) / 2));
      ctx.lineTo(X(pts.at(-1)[0]), X(pts.at(-1)[1]));
      ctx.setLineDash([S * 2 * u, S * 2]);
      ctx.lineWidth = S * (i ? 0.035 : 0.06); ctx.strokeStyle = 'rgba(12,26,52,0.92)'; ctx.stroke();
      ctx.lineWidth = S * (i ? 0.014 : 0.022); ctx.strokeStyle = p2 > 0 ? `rgba(111,227,255,${(0.35 + 0.6 * p2).toFixed(2)})` : 'rgba(60,110,170,0.8)'; ctx.stroke();
      ctx.restore();
    });
    // foam flecks on the crest
    if (p1 > 0.6) {
      ctx.fillStyle = `rgba(232,244,255,${((p1 - 0.6) * 2.5).toFixed(2)})`;
      for (const [x, y, r] of [[0.31, 0.71, 0.012], [0.52, 0.79, 0.01], [0.74, 0.73, 0.012], [0.2, 0.62, 0.009]]) { ctx.beginPath(); ctx.arc(X(x), X(y), S * r, 0, 6.283); ctx.fill(); }
    }
    // (2) the head rises out of the wave and fills (clip reveal from the bottom)
    if (p2 > 0) {
      const head = headPath(S), rise = (1 - p2) * 0.12;
      ctx.save();
      ctx.translate(0, X(rise));
      ctx.beginPath(); ctx.rect(0, X(0.18), S, X(0.74) * Math.min(1, p2 * 1.4)); ctx.clip();
      // jade gill fin behind the head, gilt edge
      ctx.beginPath(); ctx.moveTo(X(0.3), X(0.46)); ctx.quadraticCurveTo(X(0.16), X(0.4), X(0.1), X(0.48)); ctx.quadraticCurveTo(X(0.18), X(0.52), X(0.12), X(0.6)); ctx.quadraticCurveTo(X(0.2), X(0.62), X(0.28), X(0.6)); ctx.closePath();
      ctx.fillStyle = '#2f8f4e'; ctx.fill(); ctx.lineWidth = S * 0.01; ctx.strokeStyle = '#e3b04b'; ctx.stroke();
      // porcelain head with a cool gradient, cobalt scale arcs on the neck, red lacquer mouth
      const gr = ctx.createLinearGradient(0, X(0.3), 0, X(0.68));
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#e8f4ff'); gr.addColorStop(1, '#a9c7e8');
      ctx.fillStyle = gr; ctx.fill(head);
      ctx.save(); ctx.clip(head);
      ctx.strokeStyle = '#244aa5'; ctx.lineWidth = S * 0.011;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const x = 0.3 + c * 0.06 + (r % 2) * 0.03, y = 0.5 + r * 0.05; ctx.beginPath(); ctx.arc(X(x), X(y), S * 0.03, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
      ctx.fillStyle = '#9a1420'; ctx.beginPath(); ctx.moveTo(X(0.6), X(0.5)); ctx.lineTo(X(0.8), X(0.49)); ctx.lineTo(X(0.79), X(0.555)); ctx.closePath(); ctx.fill();
      ctx.restore();
      // gilt outline, flame brow, horn
      ctx.lineWidth = S * 0.016; ctx.strokeStyle = '#e3b04b'; ctx.stroke(head);
      ctx.beginPath(); ctx.moveTo(X(0.47), X(0.36)); ctx.lineTo(X(0.45), X(0.24)); ctx.lineTo(X(0.52), X(0.33)); ctx.lineTo(X(0.55), X(0.22)); ctx.lineTo(X(0.59), X(0.33)); ctx.lineTo(X(0.64), X(0.27)); ctx.lineTo(X(0.63), X(0.36));
      ctx.lineWidth = S * 0.014; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(0.42), X(0.32)); ctx.quadraticCurveTo(X(0.3), X(0.2), X(0.2), X(0.27)); ctx.quadraticCurveTo(X(0.16), X(0.31), X(0.21), X(0.33)); ctx.lineWidth = S * 0.018; ctx.stroke();
      ctx.restore();
    }
    // (3) glow round the head
    if (p3 > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = CY; ctx.shadowBlur = S * 0.06 * p3;
      ctx.globalAlpha = 0.35 * p3; ctx.lineWidth = S * 0.01; ctx.strokeStyle = CY; ctx.stroke(headPath(S)); ctx.restore();
    }
    // (4) 點睛: the eye
    const ex = X(0.585), ey = X(0.385);
    if (p2 > 0.5) { ctx.fillStyle = '#0b1d3a'; ctx.beginPath(); ctx.arc(ex, ey, S * 0.026, 0, 6.283); ctx.fill(); }
    const fl = Math.sin(Math.PI * p4) + (o.head ? Math.max(0, 1 - Math.abs(t - 1.1) / 0.08) * 0.8 : 0);
    if (p3 > 0 || fl > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gw = ctx.createRadialGradient(ex, ey, 0, ex, ey, S * (0.03 + 0.06 * fl));
      gw.addColorStop(0, `rgba(255,255,255,${(0.6 * p3 + 0.4 * Math.min(1, fl)).toFixed(2)})`); gw.addColorStop(0.4, 'rgba(111,227,255,0.6)'); gw.addColorStop(1, 'rgba(111,227,255,0)');
      ctx.fillStyle = gw; ctx.fillRect(ex - S * 0.12, ey - S * 0.12, S * 0.24, S * 0.24);
      if (fl > 0.01) {
        const L = S * (0.04 + fl * (o.head ? 0.14 : 0.06));
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = S * 0.008; ctx.globalAlpha = Math.min(1, fl);
        ctx.beginPath(); ctx.moveTo(ex - L, ey); ctx.lineTo(ex + L, ey); ctx.moveTo(ex, ey - L * 0.7); ctx.lineTo(ex, ey + L * 0.7); ctx.stroke();
      }
      ctx.restore();
    }
    if (o.head && t > 1.0) {
      const u = Math.min(1, (t - 1.0) / 0.17);
      ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = o.tint || CY; ctx.lineWidth = S * 0.012;
      ctx.beginPath(); ctx.arc(ex, ey, S * (0.04 + 0.4 * u), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  },
});

export { SFX as CHIWEN_SFX };
