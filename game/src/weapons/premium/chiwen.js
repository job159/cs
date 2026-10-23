// 螭吻．吞潮 Chiwen Tidewarden — 神兵 M07 (docs/PREMIUM_WEAPONS.md M07 card; the Appendix A def is in defs.js, the
// model tools/assets/weapons/chiwen.mjs). Mechanics on the specials v2 engine (registerSpecial 'chiwen' + skills)
// and the presentation (viewmodel driver, clips, crosshair, kill mark, FX) live in this file; the summoned 螭吻
// spirit's geometry is chiwen_fx.js.
//   fire     潮彈: 46 + 20 splash within 1.5 m of the impact; a 24 cm ice-cyan hollow crown 5 cm ahead of the jaw, water
//            mist and a 45 ms cyan light that flashes the porcelain head, the jaw snaps open 3° a shot; every body hit
//            draws the splash at its real size (a flat water crown out to 1.5 m, a 1.2 m burst, drops at 3-5 m/s, a
//            spray off each zombie the splash catches). A hit may mark 寒潮 (25 %, 10 s: three 20 cm cobalt-glazed
//            scales circle the target's chest, a frost ring at its feet); the next hit on it bursts (the scales fly
//            off as shards, ice spikes pop for 0.4 s, a 2 m frost crackle; 80 in 2 m, +4 % tide). Kills +4 % tide,
//            30 % loose a homing water bead (60). KE_FROST: the body frosts white for 0.3 s, then SHATTERS (the corpse
//            is removed: glaze shards, ice slivers, a flash, a crack; bosses keep their body); headshot / multi-kill
//            stops 65-70 ms with a FOV punch. The wave's last kill raises a water column
//   ◎ held   冰流光束 frostRay (20 % tide, <= 2.5 s): white-cored ice beam 280/s piercing 3, a line of ice spikes
//            on the floor (3 s, zombies slowed 40 %), the caster inside the 浪管 wave pipe (TUNNEL L4), FOV -2°
//   ★ tap    潮球 tideOrb (15 %): a slow water orb (6 m/s, 12 m); three pulses 0.6 s apart (120 in 3 m, pull 1 m)
//   both     水幕反衝: a water wall bursts round the caster, zombies within 3 m are shoved 4 m and take 40
//   ★ held   吞潮 swallowTide (ult, ~4,000 damage): cast (the gun dips, CARD) -> a reversed vortex sigil -> the glazed
//            water 螭吻 (chiwen_fx.js spirit: cobalt flanks, white belly, jade horns / fins, gold whiskers) bursts out
//            of it, roars, its fish tail breaches behind -> 吞: everything within 12 m is pulled 4 m, the head dives
//            to ~2 m over the crowd and bites (500 in 3.6 m: a white flash, a 0.12 s stop, a FOV punch, a cracked wet
//            floor) as the tail slaps the water -> 吐: three water pillars, each on the densest group still standing
//            (400 in 4 m, tossed) -> it sinks back, the ground frosts 3 s (slow). Its pieces are built and drawn once
//            when the gun is first held (prewarm: the first cast no longer hitches)
//   crisis   螭吻護甲: a water-dragon vortex wraps the player, knockback 6 m (crisis.js + 'chiwen_crisis')
//   aura     潮汐回流: anyone within 4 m of the ice line or the orb reloads 20 % faster (each client, its own player)
// Teammates replay every skill from its network event (visuals, their own aura; the host applies the slows).
// Sound cues (§1.12): see SFX; built by tools/audio/producers/premium_chiwen.mjs (manifest.premium_chiwen.json, the
// gun's own chiwen_close / _tail / _far / _mech set too); a missing one falls back to an existing sample or stays silent.
import * as THREE from 'three';
import { registerSpecial, registerSkill, startSkill, meterEvent, meterAdd, canCast, addAura, paletteOf } from '../specials.js';
import { registerClip, magReload } from '../../player/clips.js';
import { registerCrosshair, injectCSS } from '../../ui/crosshairs.js';
import { registerKillMark } from '../../ui/killmarks.js';
import { FRAME, DECAL, DECAL_TINT } from '../../fx/fx.js';
import { SHELL } from '../../fx/zfx.js';
import { SURF } from '../../world/collision.js';
import { clipComfort } from '../arsenal.js';
import { chiwenSpirit, spiritParts } from './chiwen_fx.js';

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
/** screen shake, off with the comfort setting (§1.14 #6) */
const shake = (g, a) => { if (clipComfort.shake) g.addShake?.(a); };
// sound cues: name -> fallback (existing sample) | null
const SFX = {
  chiwen_fire: null, chiwen_mark: null, chiwen_mark_burst: 'impact_glass', chiwen_splash: 'impact_water', chiwen_bead: null,
  chiwen_frost_kill: 'impact_glass', chiwen_ray_start: 'impact_water', chiwen_ray_loop: null, chiwen_ray_end: null, chiwen_barrier: 'impact_water',
  chiwen_orb_cast: 'impact_water', chiwen_orb_pulse: 'impact_water', chiwen_orb_burst: 'impact_water', chiwen_ult_inhale: null,
  chiwen_ult_vortex: null, chiwen_ult_roar: 'explosion_far', chiwen_ult_bite: 'bone_crunch', chiwen_ult_spit: 'explosion_small',
  chiwen_ult_fall: 'debris_fall', chiwen_ult_end: null, chiwen_ult_tail: 'impact_water', chiwen_draw_first: 'cloth', chiwen_scales: null, chiwen_gurgle: null,
  chiwen_roar_low: null, chiwen_bubble: null, chiwen_tank: 'magIn', chiwen_eyes: null, chiwen_inspect: null, chiwen_crisis: 'impact_water',
  chiwen_final: 'impact_water', chiwen_idle: null, chiwen_head: 'impact_glass',
  chiwen_hit: null, chiwen_ult_gulp: 'chiwen_ult_bite', chiwen_ult_bed: null,
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
  // 寒潮 mark scales: a 20 cm cobalt-glazed fish scale (lit, faintly self-lit so it reads at night) on a white rim,
  // double sided; glints ride on them (sysUpdate)
  const fishShape = (L, H) => {
    const sh = new THREE.Shape(), r = H / 2;
    sh.moveTo(L / 2, -r); sh.lineTo(L / 2, r); sh.lineTo(-L / 2 + r, r); sh.absarc(-L / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5, false); sh.lineTo(L / 2, -r);
    // a slight cup: the scale's centre bulges forward (it catches the light like glaze)
    const g0 = new THREE.ShapeGeometry(sh, 8), q = g0.attributes.position;
    for (let i = 0; i < q.count; i++) { const x = q.getX(i), y = q.getY(i); q.setZ(i, 0.018 * (1 - Math.min(1, (x * x) / (L * L / 4) + (y * y) / (r * r)))); }
    g0.computeVertexNormals();
    return g0;
  };
  S.scaleMesh = new THREE.InstancedMesh(fishShape(0.2, 0.17), new THREE.MeshStandardMaterial({ color: 0x244aa5, emissive: 0x1d3c8f, emissiveIntensity: 0.55,
    roughness: 0.12, metalness: 0.0, side: THREE.DoubleSide }), SCALE_MAX);
  S.scaleRim = new THREE.InstancedMesh(fishShape(0.235, 0.205).translate(0, 0, -0.004), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.8, 2.1), side: THREE.DoubleSide }), SCALE_MAX);
  for (const m of [S.scaleMesh, S.scaleRim]) { m.frustumCulled = false; m.count = 0; g.scene.add(m); }
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
  // ---- 寒潮 mark scales round every marked zombie of the local weapon (chest height), a frost ring at its feet
  let m = 0;
  const ws = S.marksWs, P = g.fx?.particles;
  const glint = (S.glintT = (S.glintT ?? 0) - dt) <= 0;
  if (glint) S.glintT = 0.16;
  if (ws?.sp?.cw) {
    for (const [z, mk] of ws.sp.cw.marks) {
      if (m + 3 > SCALE_MAX) break;
      for (let j = 0; j < 3; j++) {
        const ang = scalePos(z, mk, now, j, _b);
        // tangent-facing, tilted like a scale lifting off the body
        _q.setFromEuler(new THREE.Euler(0.3, -ang + Math.PI / 2, 0.25 * Math.sin(now * 3 + j)));
        const pop = Math.min(1, (now - mk.born) / 0.18);
        _m.compose(_b, _q, _s.setScalar((0.35 + 0.65 * pop) * (1 + 0.06 * Math.sin(now * 5 + j))));
        S.scaleRim.setMatrixAt(m, _m);
        S.scaleMesh.setMatrixAt(m++, _m);
        if (glint && (j + ((now * 6) | 0)) % 3 === 0) P?.spawn({ additive: true, x: _b.x, y: _b.y + 0.03, z: _b.z, life: 0.22, size: 0.16, size1: 0.03, color: [...WHITE, 1], color1: [...ICE, 0], frame: FRAME.glint, rot: R() * 6 });
      }
      if ((mk.ringT = (mk.ringT ?? 0) - dt) <= 0) {
        mk.ringT = 0.55;
        P?.spawn({ additive: true, x: z.pos.x, y: z.pos.y + 0.04, z: z.pos.z, mode: 'flat', dir: [0, 1, 0], life: 0.7, size: 0.7, size1: 1.25, sizePow: 0.6, color: [0.5, 0.85, 1.1, 0.55], color1: [0.3, 0.6, 1, 0], frame: FRAME.thinRing, rot: R() * 6 });
      }
    }
  }
  for (const k of [S.scaleMesh, S.scaleRim]) { k.count = m; k.instanceMatrix.needsUpdate = true; }
}

/** Ice-spike cluster on the floor at p (3 s); host slow zone + aura source; a puff of frost mist. */
function spikeCluster(g, p, rand = R, { n = 3, life = 3, r = 1.0, slow = 0.4, aura = true, size = 1, spread = 0.28, mist = true } = {}) {
  const S = sys(g), now = g.time;
  for (let i = 0; i < n; i++) {
    const a = rand() * 6.283, d = (spread > 0.3 ? 0.35 + 0.65 * rand() : rand()) * spread * size;
    S.spikes.push({ pos: new THREE.Vector3(p.x + Math.cos(a) * d, p.y - 0.03, p.z + Math.sin(a) * d), born: now + i * 0.03, until: now + life + rand() * 0.3,
      h: (0.55 + rand() * 0.75) * size, w: 0.8 + rand() * 0.6, tx: (rand() - 0.5) * 0.7, tz: (rand() - 0.5) * 0.7, ry: rand() * 6.283 });
  }
  if (S.spikes.length > SPIKE_MAX) S.spikes.splice(0, S.spikes.length - SPIKE_MAX);
  const z = { pos: p.clone(), r, until: now + life, slow };
  if (slow > 0) S.zones.push(z);
  if (aura) S.auraSrc.add({ pos: z.pos, r: 4, until: z.until });
  const P = g.fx?.particles;
  if (!mist) return;
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
    if (tag === 'splash') sprayOn(g, z);
    n++;
  }
  return n;
}

/** where mark scale j (0..2) of zombie z is (out); returns its orbit angle */
function scalePos(z, mk, now, j, out) {
  z.center(out);
  out.y += 0.12;
  const rr = Math.max(0.5, (z.radius ?? 0.35) + 0.24), ang = mk.a0 + now * 1.4 + j * 2.0944;
  out.set(out.x + Math.cos(ang) * rr, out.y + Math.sin(now * 2.1 + j * 2) * 0.08, out.z + Math.sin(ang) * rr);
  return ang;
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
/** 寒潮 burst: the three scales fly off as big glaze shards, ice spikes pop out of the ground round it (0.4 s), a 2 m
 * frost crackle on the floor; 80 in 2 m, +4 % tide. */
function detonate(ws, g, z) {
  const cw = cwOf(ws), mk = ws.def.special.passive?.mark || {}, mm = cw.marks.get(z);
  cw.marks.delete(z);
  const c = z.center(V3()), fx = g.fx, r = mk.r ?? 2, now = g.time;
  if (mm) for (let j = 0; j < 3; j++) {
    scalePos(z, mm, now, j, _b);
    const d = _c.subVectors(_b, c).setY(0).normalize().multiplyScalar(5).setY(1.6);
    fx?.motes?.spawn?.('shard', _b, { vel: d.clone(), color: j % 2 ? [0.91, 0.96, 1] : [0.14, 0.29, 0.65], color2: [0.93, 0.95, 0.98], scale: 2.6, life: 1.2 });
    fx?.particles.spawn({ additive: true, x: _b.x, y: _b.y, z: _b.z, life: 0.18, size: 0.35, size1: 0.05, color: [...WHITE, 1], color1: [...ICE, 0], frame: FRAME.glint, rot: R() * 6 });
  }
  fx?.motes?.burst?.('shard', c, 6, { palette: GLAZE, speed: 3.6, spread: 0.9, radius: 0.15, scale: 1.3 });
  fx?.motes?.burst?.('frost', c, 10, { speed: 1.6, radius: 0.45 });
  const feet = V3().set(z.pos.x, z.pos.y, z.pos.z);
  spikeCluster(g, feet, R, { n: 6, life: 0.4, r: 0.01, slow: 0, aura: false, size: 1.5, spread: 0.55, mist: false });
  fx?.zfx?.ground?.add?.('crack', _e.set(feet.x, feet.y + 0.02, feet.z), { r, life: 2.4, col: [0.66, 0.86, 1.0], alpha: 0.6, fadeIn: 0.02, fadeOut: 1.2 });
  fx?.shockwave(_e.set(feet.x, feet.y + 0.05, feet.z), { normal: UP, r0: 0.2, r1: r, life: 0.4, color: [1.4, 2.6, 3.4] });
  fx?.particles.spawn({ additive: true, x: c.x, y: c.y, z: c.z, life: 0.12, size: 0.9, size1: 0.3, color: [4, 5, 5.6, 1], color1: [...ICE, 0], frame: FRAME.glow });
  fx?.sparkBurst(c, { color: WHITE, color1: ICE, count: 10, speed: 4.5, glow: 0.4 });
  sfx(g, 'chiwen_mark_burst', { pos: c, volume: 0.85 });
  areaHit(ws, g, c, r, mk.burst ?? 80, { knock: 3, falloff: 0.6, tag: 'burst' });
  meterEvent(ws, 'detonate');
  heavy(ws, g, 0.04, 0.09);
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

/**
 * Mouth crown for each shot (§1.7.1 beat 4: "冰青光冠，中心挖空＋小水霧"): two hollow ice rings (0.24 / 0.14 m) punched
 * out 5 cm ahead of the 螭吻's jaw, eight short rays (white / ice), a crown of water drops thrown forward, a breath of
 * mist, and a 45 ms cyan light just ahead of the mouth so the porcelain head flashes on every shot. Viewmodel layer;
 * the gun's own fireball is kept small (def.fx.flashScale) so this reads as the muzzle.
 */
function crown(g, n) {
  const vm = g.vm, P = g.fx?.particles, c0 = vm?.socketCam?.('muzzle', _a);
  if (!P || !c0) return;
  const f = _b.set(0, 0, -1).applyQuaternion(vm.gunRoot.quaternion);
  const u = _c.set(0, 1, 0).applyQuaternion(vm.gunRoot.quaternion), w = _d.crossVectors(f, u).normalize();
  const c = _g.copy(c0).addScaledVector(f, 0.05);
  const rot = (n % 2) * 0.3927;
  for (let i = 0; i < 8; i++) {
    const a = rot + i * 0.7854, col = i % 2 ? ICE : WHITE, L = i % 2 ? 1 : 1.35;
    _e.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
    P.spawn({ additive: true, vm: true, x: c.x + _e.x * 0.03, y: c.y + _e.y * 0.03, z: c.z + _e.z * 0.03,
      vx: (_e.x * 3.4 + f.x * 1.2) * L, vy: (_e.y * 3.4 + f.y * 1.2) * L, vz: (_e.z * 3.4 + f.z * 1.2) * L, life: 0.075, size: 0.007, stretch: 0.034 * L,
      color: [col[0] * 1.6, col[1] * 1.6, col[2] * 1.6, 1], color1: [col[0] * 0.2, col[1] * 0.2, col[2] * 0.2, 0], frame: FRAME.spark, drag: 9 });
  }
  // the crown: an outer ice ring and an inner white one, both hollow (the centre stays clear)
  P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, mode: 'flat', dir: [f.x, f.y, f.z], life: 0.1,
    size: 0.06, size1: 0.24, sizePow: 0.45, color: [ICE[0], ICE[1], ICE[2], 1], color1: [DEEP[0] * 0.3, DEEP[1] * 0.3, DEEP[2] * 0.3, 0], frame: FRAME.thinRing, rot });
  P.spawn({ additive: true, vm: true, x: c.x + f.x * 0.025, y: c.y + f.y * 0.025, z: c.z + f.z * 0.025, mode: 'flat', dir: [f.x, f.y, f.z], life: 0.07,
    size: 0.035, size1: 0.14, sizePow: 0.5, color: [WHITE[0] * 0.8, WHITE[1] * 0.8, WHITE[2] * 0.8, 1], color1: [ICE[0] * 0.2, ICE[1] * 0.2, ICE[2] * 0.2, 0], frame: FRAME.thinRing, rot: rot + 0.4 });
  P.spawn({ additive: true, vm: true, x: c0.x, y: c0.y, z: c0.z, life: 0.04, size: 0.05, size1: 0.02, color: [5, 6.5, 7, 1], color1: [1, 2.5, 3.5, 0], frame: FRAME.glow });
  // water crown: drops thrown forward and out of the mouth (they keep part of the camera motion: they hang)
  for (let i = 0; i < 7; i++) {
    const a = R() * 6.283, sp = 0.9 + R() * 1.1;
    _e.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
    P.spawn({ vm: true, x: c0.x + f.x * 0.02, y: c0.y + f.y * 0.02, z: c0.z + f.z * 0.02, vx: f.x * 1.8 + _e.x * sp, vy: f.y * 1.8 + _e.y * sp + 0.25, vz: f.z * 1.8 + _e.z * sp,
      life: 0.3 + R() * 0.15, size: 0.0034, stretch: 0.014, color: [0.9, 0.96, 1, 0.95], color1: [0.9, 0.96, 1, 0], frame: FRAME.drop, gravity: 4, inertia: 0.45 });
  }
  // a breath of mist out of the mouth
  P.spawn({ vm: true, x: c.x, y: c.y, z: c.z, vx: f.x * 0.5 + (R() - 0.5) * 0.1, vy: f.y * 0.5 + 0.05, vz: f.z * 0.5,
    life: 0.4, size: 0.03, size1: 0.11, sizePow: 0.5, color: [...MIST, 0.24], color1: [...MIST, 0], frame: FRAME.smoke + ((R() * 2) | 0), drag: 3, inertia: 0.6 });
  // the head lights up: a 45 ms cyan point light a hand ahead of / above the mouth (the real gun's position)
  const mw = vm.socketWorld?.('muzzle', _f);
  if (mw && g.fx?.lights) { const fw = vm.socketDir?.('muzzle', _e) || _e.set(0, 0, -1); mw.addScaledVector(fw, 0.1); mw.y += 0.05; g.fx.lights.flash(mw, 0x6fe3ff, 0.55, 1.4, 0.045); }
}

/**
 * 潮彈 impact on a body. The 1.5 m splash is a real mechanic, so it is drawn at its real size: a flat hollow water
 * crown expanding to the splash radius round the hit (0.18 s), a 1.2 m burst of water standing up out of the body,
 * drops flung out at 3-5 m/s, a white glint, and a hollow ice ring (x1.3 + a second ring on a headshot, §1.10).
 */
function impact(g, p, head = false, r = 1.5) {
  const P = g.fx?.particles;
  splashFx(g, p, head ? 0.6 : 0.45);
  if (!P) return;
  const k = head ? 1.3 : 1;
  // the splash area: a flat ring at hit height out to r, a lower faint fill, a ring of small rising splashes on its edge
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, mode: 'flat', dir: [0, 1, 0], life: 0.18, size: 0.5, size1: r * 2, sizePow: 0.35,
    color: [ICE[0] * 0.5, ICE[1] * 0.5, ICE[2] * 0.5, 0.85], color1: [DEEP[0] * 0.15, DEEP[1] * 0.15, DEEP[2] * 0.15, 0], frame: FRAME.thinRing, rot: R() * 6 });
  P.spawn({ x: p.x, y: p.y - 0.1, z: p.z, mode: 'flat', dir: [0, 1, 0], life: 0.22, size: 0.6, size1: r * 1.8, sizePow: 0.4,
    color: [0.86, 0.94, 1, 0.22], color1: [0.86, 0.94, 1, 0], frame: FRAME.puff + ((R() * 4) | 0) });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 6.283 + R() * 0.4, rr = r * (0.75 + R() * 0.2);
    P.spawn({ x: p.x + Math.cos(a) * rr, y: p.y - 0.15, z: p.z + Math.sin(a) * rr, delay: 0.03 + R() * 0.04, mode: 'align', dir: [0, 1, 0], aspect: 1.4, anchor: 0.45, life: 0.26,
      size: 0.14, size1: 0.42, sizePow: 0.5, color: [0.88, 0.95, 1, 0.55], color1: [0.88, 0.95, 1, 0], frame: FRAME.splash, mirror: R() < 0.5 });
  }
  // the burst standing up out of the body, and drops thrown out of it
  P.spawn({ x: p.x, y: p.y - 0.2, z: p.z, mode: 'align', dir: [0, 1, 0], aspect: 1.45, anchor: 0.42, life: 0.3, size: 0.45 * k, size1: 1.25 * k, sizePow: 0.45,
    color: [0.9, 0.96, 1, 0.75], color1: [0.9, 0.96, 1, 0], frame: FRAME.splash, mirror: R() < 0.5 });
  for (let i = 0; i < 8; i++) {
    const a = R() * 6.283, sp = 3 + R() * 2;
    P.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * sp, vy: 1.5 + R() * 2.5, vz: Math.sin(a) * sp, life: 0.5 + R() * 0.25, size: 0.022, stretch: 0.03,
      color: [0.88, 0.95, 1, 0.9], color1: [0.88, 0.95, 1, 0], frame: FRAME.drop, gravity: 9.8 });
  }
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.13, size: 0.14 * k, size1: 0.6 * k, sizePow: 0.5, color: [ICE[0] * 0.7, ICE[1] * 0.7, ICE[2] * 0.7, 0.9], color1: [DEEP[0] * 0.2, DEEP[1] * 0.2, DEEP[2] * 0.2, 0], frame: FRAME.thinRing, rot: R() * 6 });
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.08, size: 0.3 * k, size1: 0.1, color: [...WHITE, 1], color1: [...ICE, 0], frame: FRAME.glint, rot: R() * 6 });
  if (head) P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.15, size: 0.2, size1: 0.9, sizePow: 0.4, color: [...ICE, 0.8], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: R() * 6 });
}
/** a small spray off each zombie the splash catches (it reads that the area hit it, not just the round) */
function sprayOn(g, z) {
  const P = g.fx?.particles;
  if (!P) return;
  z.center(_e);
  P.spawn({ x: _e.x, y: _e.y - 0.1, z: _e.z, mode: 'align', dir: [0, 1, 0], aspect: 1.4, anchor: 0.45, life: 0.24, size: 0.2, size1: 0.6, sizePow: 0.5,
    color: [0.88, 0.95, 1, 0.6], color1: [0.88, 0.95, 1, 0], frame: FRAME.splash, mirror: R() < 0.5 });
  for (let i = 0; i < 3; i++) {
    const a = R() * 6.283;
    P.spawn({ x: _e.x, y: _e.y, z: _e.z, vx: Math.cos(a) * 2, vy: 1.5 + R() * 1.5, vz: Math.sin(a) * 2, life: 0.45, size: 0.016, stretch: 0.025, color: [0.88, 0.95, 1, 0.85], color1: [0.88, 0.95, 1, 0], frame: FRAME.drop, gravity: 9.8 });
  }
}
/** Heavy-hit feel: a short hit-stop (rate-limited so a spray never stutters) and a bump of shake. big: a headshot or
 * multi-kill -- a longer stop and a FOV punch, allowed sooner (0.12 s) than the spray limit (0.28 s). */
function heavy(ws, g, stop, trauma, big = false) {
  const cw = cwOf(ws);
  if (big ? g.time - (cw.bigAt ?? -9) > 0.12 : g.time - (cw.stopAt ?? -9) > 0.28) {
    cw.stopAt = g.time;
    if (big) cw.bigAt = g.time;
    if (clipComfort.hitstop) g.hitStop?.(stop);   // (game.hitStop keeps the longer of two)
    if (big) g.arsenal?.fovKick?.(-2.2, 0.16);
  }
  shake(g, trauma);
}

const GLAZE = [[0.14, 0.29, 0.65], [0.91, 0.96, 1], [0.2, 0.4, 0.86], [0.95, 0.97, 1], [0.09, 0.2, 0.52]];
// KE_FROST coat: a near-flat ice-white body shell (the zfx 'frozen' status is only a rim); registered once into the
// shared shell table, under the killing-blow flash
SHELL.chiwen_frost ??= { col: [1.5, 1.95, 2.4], amt: 0.85, fres: 0.3, exp: 1.6, prio: 8 };
/**
 * KE_FROST (§1.10): white frost covers the body for 0.3 s, then it SHATTERS -- the corpse is gone, 14-20 cobalt and
 * white glaze shards (4-10 cm, spinning, they bounce once), a white flash, frost crystals and a crack. Bosses keep their
 * body (a frost burst only). A guest's unconfirmed (predicted) kill is never removed.
 */
function killFx(ws, g, z, p, bullet) {
  const boss = !!z.def?.boss;
  g.zombies?.status?.(z, boss ? 'frozen' : 'chiwen_frost', boss ? 0.45 : 0.34);
  const at = p.clone();
  later(ws, 0.3, () => {
    const fx = g.fx, c = z.center(V3());
    const gone = !boss && !z.alive && !(z.puppet && z.predictedDeath) && z.root;
    if (gone) {
      // the body is gone this frame (the manager drops it at deathT 7)
      z.root.scale.setScalar(1e-3);
      z.deathT = Math.max(z.deathT || 0, 6.999);
      const top = V3().set(c.x, c.y + (z.height ?? 1.8) * 0.22, c.z), low = V3().set(c.x, c.y - (z.height ?? 1.8) * 0.2, c.z);
      fx?.motes?.burst?.('shard', top, 11, { palette: GLAZE, speed: 4.8, spread: 1, radius: 0.22, scale: 1.7 });
      fx?.motes?.burst?.('shard', low, 7, { palette: GLAZE, speed: 3.6, spread: 1, radius: 0.25, scale: 1.5 });
      fx?.motes?.burst?.('frost', c, 14, { speed: 2.4, radius: 0.45 });
      // bright ice slivers among the glaze (they catch the light at any range), bouncing once
      for (let i = 0; i < 8; i++) {
        const a = R() * 6.283, sp = 3 + R() * 2.5;
        fx?.particles.spawn({ x: c.x, y: c.y + (R() - 0.3) * 0.5, z: c.z, vx: Math.cos(a) * sp, vy: 2 + R() * 3, vz: Math.sin(a) * sp, life: 0.9 + R() * 0.4, size: 0.08 + R() * 0.05,
          color: [1.6, 2.2, 2.8, 1], color1: [0.6, 1, 1.6, 0], frame: FRAME.shard, rot: R() * 6, spin: (R() - 0.5) * 20, gravity: 9.8, collide: true, bounce: 0.3, additive: true });
      }
      fx?.particles.spawn({ additive: true, x: c.x, y: c.y, z: c.z, life: 0.14, size: 1.5, size1: 0.6, color: [5, 6, 6.5, 1], color1: [...ICE, 0], frame: FRAME.glow });
      fx?.particles.spawn({ additive: true, x: c.x, y: c.y, z: c.z, life: 0.24, size: 0.4, size1: 1.9, sizePow: 0.45, color: [...ICE, 0.9], color1: [...DEEP, 0], frame: FRAME.thinRing, rot: R() * 6 });
      fx?.particles.spawn({ x: c.x, y: c.y - 0.3, z: c.z, vy: 0.3, life: 0.8, size: 0.6, size1: 1.6, sizePow: 0.5, color: [0.5, 0.8, 1.1, 0.35], color1: [0.4, 0.7, 1, 0], frame: FRAME.puff + ((R() * 4) | 0), additive: true, drag: 2 });
      fx?.lights?.flash(_e.set(c.x, c.y + 0.4, c.z), 0xdff6ff, 14, 5, 0.08);
      sfx(g, 'chiwen_frost_kill', { pos: c, volume: 0.95 });
      if (!g.audio?.has?.('chiwen_frost_kill')) g.audio?.play('impact_glass', { pos: c, volume: 0.9 });
    } else {
      fx?.motes?.burst?.('frost', at, 10, { speed: 1.8, radius: 0.35 });
      fx?.motes?.burst?.('shard', at, 4, { palette: GLAZE, speed: 2.6, spread: 0.8, radius: 0.15 });
      fx?.particles.spawn({ additive: true, x: at.x, y: at.y, z: at.z, life: 0.22, size: 0.7, size1: 0.2, color: [...WHITE, 1], color1: [...ICE, 0], frame: FRAME.glint, rot: R() * 6 });
      sfx(g, 'chiwen_frost_kill', { pos: at, volume: 0.6 });
    }
  });
  const pr = ws.def.special.passive?.orb;
  if (pr && R() < (pr.chance ?? 0.3)) spawnBead(ws, g, p);
  // KE_FINAL (§1.10): the wave's last kill raises one water column there (no damage, once a wave)
  const m = g.match, cw = cwOf(ws);
  cw.shotKills = (cw.shotKills || 0) + 1;
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
function bubble(ws, g, big = false, autoPop = false) {
  const vm = g.vm, P = g.fx?.particles, c = vm?.socketCam?.('mouth', _a);
  if (!P || !c) return;
  const f = _b.set(0, 0, -1).applyQuaternion(vm.gunRoot.quaternion);
  const life = big ? 1.1 : 1.0, s0 = big ? 0.008 : 0.004, s1 = big ? 0.036 : 0.014;
  const vx = f.x * 0.03, vy = big ? 0.02 : 0.07, vz = f.z * 0.03;
  // ring (the bubble skin) + a highlight glint that rides on it
  P.spawn({ additive: true, vm: true, x: c.x, y: c.y + 0.004, z: c.z, vx, vy, vz, life, size: s0, size1: s1, sizePow: 0.35, color: [0.9, 1.4, 1.8, 0.9], color1: [0.7, 1.2, 1.6, 0.9], frame: FRAME.thinRing, inertia: 0.7 });
  P.spawn({ additive: true, vm: true, x: c.x - s1 * 0.25, y: c.y + 0.004 + s1 * 0.25, z: c.z, vx, vy, vz, life, size: s0 * 0.5, size1: s1 * 0.3, sizePow: 0.35, color: [2, 2.4, 2.6, 1], color1: [2, 2.4, 2.6, 0.8], frame: FRAME.glint, inertia: 0.7 });
  sfx(g, 'chiwen_bubble', { volume: 0.5 });
  ps(vm, 'fx_jaw').kick = 2.2;
  const end = V3().set(c.x + vx * life, c.y + vy * life + 0.004, c.z + vz * life);
  if (!big) later(ws, life, () => pop(g, end, 0.6));
  else if (autoPop) later(ws, life, () => { pop(g, end, 1.6); sfx(g, 'chiwen_splash', { volume: 0.3 }); });
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
function ripple(g, k = 1, rest = 0) {
  const vm = g.vm;
  if (!vm?.weapon?.parts?.fx_scale1) return;
  vm.setPart('fx_scale*', k, 0.07, 0.045);
  vm.glowTo(2.6 * k, 0.08, { mat: 'glow_ice' });
  // back to rest: closed, or (ready) held a little open so the lit seams show (§1.17: a full meter moves a part)
  const back = () => { vm.setPart('fx_scale*', rest, 0.16, 0.045); vm.glowTo(rest ? 1.5 : 1, 0.4, { mat: 'glow_ice' }); };
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
  // idle hum (§1.12: 55-110 Hz + a swept band of noise, 24-30 dB under the shot): while held, stopped in tick()
  if (!cw.hum && g.audio?.has?.('chiwen_idle')) cw.hum = sfx(g, 'chiwen_idle', { loop: true, volume: 0.1, fadeIn: 0.4 });
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
  // ---- the scales breathe (0.4 Hz, ~0.5°) at rest; held a little open while ready (unless a ripple / clip moves them)
  const sb = ready && !act ? 0.4 : 0.06 + 0.06 * Math.sin(v.t * 2.513);
  for (let i = 1; i <= 6; i++) { const q = ps(vm, 'fx_scale' + i); if (!q.tw) q.v = sb; }
  // ---- ready (§1.7.1 beat 7): eyes light + the scales flare in a wave, droplets; again every 2.5 s
  if (ready && !act) {
    if (!cw.readyN) { cw.readyN = true; cw.readyT = 0; eyes(g); ripple(g, 1, 0.4); droplets(g, 8); sfx(g, 'chiwen_eyes', { volume: 0.5 }); }
    else if ((cw.readyT += dt) >= 2.5) {
      cw.readyT = 0;
      // at rest the ready layer's 'chiwen_shiver' clip runs the scale wave; in a fight the ripple does
      const calm = ar?.state === 'idle' && (ar.sinceShot ?? 9) > 1;
      if (g.hud?.settings?.readyReminder !== false) { eyes(g, 0.8); if (!calm) ripple(g, 0.8, 0.4); droplets(g, 4, ['mouth']); }
    }
  } else if (cw.readyN) { cw.readyN = false; vm.setPart('fx_scale*', 0, 0.3, 0.03); vm.glowTo(1, 0.3, { mat: 'glow_ice' }); }
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
  else if (what === 'inspbubble') bubble(ws, g, true, true);
  else if (what === 'pop') { const c = vm.socketCam('mouth', _a); if (c) pop(g, c.add(_b.set(0, 0.012, 0)), 1.6); sfx(g, 'chiwen_splash', { volume: 0.4 }); }
  else if (what === 'eyes') eyes(g, a?.k ?? 1);
  else if (what === 'vortex') {
    // rare reload: the water in the tube whirls as the tank seats
    cw.view.flowBoost = 0.6;
    const c = vm.socketCam('tube', _a);
    if (c) for (let i = 0; i < 3; i++) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, delay: i * 0.08, mode: 'flat', dir: [1, 0, 0], life: 0.35, size: 0.01, size1: 0.05, color: [...ICE, 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: i });
    sfx(g, 'chiwen_gurgle', { volume: 0.6 });
  } else if (what === 'world') { worldInspect(ws, g); sfx(g, 'chiwen_inspect', { volume: 0.6 }); }
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

/**
 * The first 吞潮 hitched (120-300 ms frames) in a fresh match: the spirit's geometry, its ghost buffers, the vortex
 * sigil atlas and the pillar program were all built on first use. Build them once a game when the gun is first
 * held: a tiny spirit, a sigil and a pillar 500 m under the map for a few frames (drawn, so compiled and uploaded).
 */
function prewarm(g) {
  g._cwWarm = true;
  const fx = g.fx, far = V3().set(0, -500, 0);
  try {
    fx.sigils?.preload?.(['vortex']);
    fx.summons.ghost({ mesh: chiwenSpirit(), pos: far, size: 0.02, appear: 0.01, life: 0.2, out: 0.01, big: false, opacity: 0.5 });
    fx.sigils?.sigil?.(far, { design: 'vortex', radius: 0.1, color: ICE, color1: DEEP, life: 0.2 });
    fx.sigils?.pillar?.(far, { radius: 0.05, height: 0.1, life: 0.2, motes: 0, ring: false, light: 0 });
    // the beam's ray / strands and the 浪管 tunnel program (a first frame of the tunnel cost ~130 ms)
    const far2 = far.clone().setY(-499);
    fx.beam?.(far, far2, { core: WHITE, glow: [0.5, 1.5, 2.8], wCore: 0.01, wGlow: 0.01, life: 0.1 });
    fx.bolt?.(far, far2, { col: ICE, glow: [0.25, 0.7, 1.5], width: 0.01, core: 0.12, levels: 2, jitter: 0.01, branches: 0, life: 0.1 });
    fx.overlay?.tunnel?.(0.15, { look: 'wave', amt: 0.004, fadeIn: 0, fadeOut: 0.01 });
    fx.shockwave?.(far, { r1: 0.05, life: 0.1 });
    fx.shockwave?.(far, { normal: UP, r1: 0.05, life: 0.1, thin: false });
  } catch (e) { console.warn('chiwen prewarm', e); }
}

// ------------------------------------------------------------------------------------------ the special (engine overrides)
registerSpecial(ID, {
  init(ws) {
    cwOf(ws); if (ws.game?.scene) sys(ws.game).marksWs = ws;
    // decode the weapon's cues up front (samples are fetched on first play: the first beam / ultimate would start late)
    const au = ws.game?.audio;
    if (au?.defs && !au._cwPre) { au._cwPre = true; au.preload?.(Object.keys(au.defs).filter((n) => /^(chiwen_|ready_chiwen)/.test(n) && !n.endsWith('_searing')))?.catch?.(() => {}); }
  },
  onFire(ws, ctx) {
    const g = ctx.game, cw = cwOf(ws);
    if (g.arsenal?.current === ws) { crown(g, ws.shots); if (g.vm?.partState) ps(g.vm, 'fx_jaw').kick = 1; }
    sfx(g, 'chiwen_fire', { volume: 0.3 });   // theme overtone ~13 dB under the shot (§1.12 20-30 %)
    shake(g, 0.025);
    // a round that struck no body still splashes where it lands (wall / floor), not in open sky
    if (!cw.shotHit && ctx.end && ctx.end.distanceTo(ctx.origin) < (ws.def.range?.[1] ?? 90)) {
      splashFx(g, ctx.end, 0.55);
      sfx(g, 'chiwen_hit', { pos: ctx.end, volume: 0.22 });
      const sp = ws.def.splash;
      if (sp) areaHit(ws, g, ctx.end, sp.r, sp.dmg, { knock: 0.6, falloff: 0.5, tag: 'splash' });
    }
    cw.shotHit = false;
    // a shot that killed two or more (pierce, splash): the multi-kill stop
    if ((cw.shotKills || 0) >= 2) heavy(ws, g, 0.07, 0.14, true);
    cw.shotKills = 0;
    // the spec's 2.5° per-shot kick lives on the camera (def.recoil climbs only ~0.8° a shot for the rounds)
    g.punch?.impulse?.(-0.5 * 0.10472, (R() - 0.5) * 0.004, 0);
  },
  onHit(ws, info, res, target) {
    if (info.skill || info.cw) return;   // marks, splash and beads come from the gun's own rounds
    const g = ws.game, cw = cwOf(ws), z = target?.zombie || target;
    if (!z?.center) return;
    cw.shotHit = true;
    const p = info.point || z.center(V3());
    impact(g, p, !!info.headshot, ws.def.splash?.r ?? 1.5);
    sfx(g, info.headshot ? 'chiwen_head' : 'chiwen_hit', { pos: p, volume: info.headshot ? 0.35 : 0.3 });   // the water round bursting (over the flesh hit)
    const sp = ws.def.splash;
    if (sp) areaHit(ws, g, p, sp.r, sp.dmg, { exclude: z, knock: 0.6, falloff: 0.5, tag: 'splash' });
    if (cw.marks.has(z)) detonate(ws, g, z);
    else if (z.alive && R() < (ws.def.special.passive?.mark?.chance ?? 0.25)) mark(ws, g, z);
    if (res?.killed) { killFx(ws, g, z, p, true); heavy(ws, g, info.headshot ? 0.065 : 0.03, info.headshot ? 0.12 : 0.06, !!info.headshot); }
  },
  update(ws, dt, g) { if (!g._cwWarm && g.fx?.summons) prewarm(g); view(ws, g, dt); },
  tick(ws, dt, g) {
    const cw = cwOf(ws);
    cw.shotKills = 0;   // the multi-kill count is per shot (a frame); beads / bursts between shots do not carry over
    if (cw.hum && g.arsenal?.current !== ws) { cw.hum.stop?.(0.2); cw.hum = null; }
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
    cw.hum?.stop?.(0.1); cw.hum = null;
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
    if (k.level >= 4 && clipComfort.overlay) d.tunnel = g.fx?.overlay?.tunnel?.(Infinity, { look: 'wave', amt: 0.8 });
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
      d.beam = fx.beam(m.clone(), end.clone(), { core: WHITE, glow: [0.5, 1.5, 2.8], wCore: 0.07, wGlow: 0.32, life: Infinity, scroll: 3 });
      d.s1 = fx.bolt?.(m.clone(), end.clone(), { col: ICE, glow: [0.25, 0.7, 1.5], width: 0.11, core: 0.12, levels: 4, jitter: 0.012, branches: 0, regen: 0.045, life: Infinity });
      d.s2 = fx.bolt?.(m.clone(), end.clone(), { col: [0.9, 2.2, 4], glow: [0.15, 0.4, 1.2], width: 0.07, core: 0.15, levels: 3, jitter: 0.02, branches: 0, regen: 0.06, life: Infinity });
    }
    d.beam?.set(m, end); d.s1?.set(m, end); d.s2?.set(m, end);
    // the struck end: a white-hot bloom, an ice ring every 0.25 s, frost sparks, spray and mist
    if ((d.ringT = (d.ringT ?? 0) - dt) <= 0) {
      d.ringT = 0.25;
      fx?.particles.spawn({ additive: true, x: end.x, y: end.y, z: end.z, life: 0.22, size: 0.25, size1: 1.1, sizePow: 0.5, color: [...ICE, 0.9], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: k.rng() * 6 });
    }
    if ((d.endT -= dt) <= 0) {
      d.endT = 0.05;
      fx?.particles.spawn({ additive: true, x: end.x, y: end.y, z: end.z, life: 0.08, size: 0.55 + k.rng() * 0.2, size1: 0.4, color: [WHITE[0] * 0.6, WHITE[1] * 0.6, WHITE[2] * 0.6, 1], color1: [...ICE, 0], frame: FRAME.glow });
      fx?.sparkBurst(end, { color: WHITE, color1: ICE, count: 3, speed: 4, glow: 0.3 });
      if (k.rng() < 0.4) splashFx(g, end, 0.6);
      if (k.rng() < 0.3) fx?.motes?.burst?.('frost', end, 2, { speed: 1.2, radius: 0.2, seed: k.ev.seed + ((k.t * 100) | 0) });
    }
    // mist off the mouth (world layer, it drifts back over the hands) and the mouth's glow
    if ((d.mistT -= dt) <= 0) {
      d.mistT = 0.07;
      fx?.particles.spawn({ additive: true, x: m.x, y: m.y, z: m.z, life: 0.09, size: 0.09, size1: 0.07, color: [WHITE[0] * 0.5, WHITE[1] * 0.5, WHITE[2] * 0.5, 1], color1: [...ICE, 0], frame: FRAME.glow });
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
    if (g.shake < 0.05) shake(g, 0.05 - g.shake);   // a steady 0.05 trauma while it runs
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
    // roll forward riding ~ the cast height above the floor (0.6 .. 1.3 m); it climbs over a lip / kerb / crate (clear
    // 1 m higher) and stops at a wall
    if (!d.blocked && d.dist < p.range) {
      const step = p.speed * dt, col = g.world?.collision;
      if (col?.raycast(d.pos, d.dir, step + 0.35)) {
        if (!col.raycast(_b.copy(d.pos).setY(d.pos.y + 1.0), d.dir, step + 0.35) && (d.lift || 0) < 1.6) d.lift = (d.lift || 0) + 4 * dt;
        else d.blocked = true;
      } else { d.pos.addScaledVector(d.dir, step); d.dist += step; d.lift = Math.max(0, (d.lift || 0) - 1.5 * dt); }
    }
    const fy = k.floorY(d.pos);
    const ride = fy + clamp(d.h, 0.6, 1.3) + (d.lift || 0);
    d.pos.y = d.lift > 0 && d.pos.y < ride ? Math.min(ride, d.pos.y + 3 * dt) : damp(d.pos.y, ride, 6, dt);
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
  const g = k.game, d = k.data, p = k.p, fx = g.fx, c = d.pos, P = fx?.particles;
  const fy = k.floorY(c), big = last ? 1.5 : 1;
  // the pull, drawn: a swirling vortex glyph on the floor out to the pulse radius, water streaks dragged in from the
  // 3 m edge, a ring on the ground and one round the orb; the orb swells 15 % a pulse
  fx?.zfx?.ground?.add?.('glyph', _a.set(c.x, fy + 0.03, c.z), { r: p.r, life: 0.75, col: [0.5, 1.5, 2.4], alpha: 0.75, rot: k.rng() * 6, rotV: -7, fadeIn: 0.04, fadeOut: 0.45 });
  fx?.shockwave(_a.set(c.x, fy + 0.05, c.z), { normal: UP, r0: p.r, r1: 0.4, life: 0.42, color: [1.2, 2.8, 3.8], thin: false });
  fx?.shockwave(c, { r0: 0.3, r1: 1.2 * big, life: 0.3, color: [2, 3.6, 4.6], thin: true });
  d.ghost?.flash?.(1);
  if (d.ghost) d.ghost.obj.scale.multiplyScalar(1.15);
  splashFx(g, _a.set(c.x, fy, c.z), 1.1 * big);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * 6.283 + k.rng() * 0.2, sw = 2.2;   // inward + a swirl (counter-clockwise)
    const vx = -Math.cos(a) * 5 - Math.sin(a) * sw, vz = -Math.sin(a) * 5 + Math.cos(a) * sw;
    P?.spawn({ x: c.x + Math.cos(a) * p.r, y: fy + 0.12 + k.rng() * 0.3, z: c.z + Math.sin(a) * p.r, vx, vy: 0.5, vz, life: 0.55, size: 0.045, stretch: 0.08, color: [0.88, 0.95, 1, 0.8], color1: [0.88, 0.95, 1, 0], frame: FRAME.drop, drag: 1.2, gravity: 2 });
    if (i % 3 === 0) P?.spawn({ x: c.x + Math.cos(a) * p.r * 0.9, y: fy + 0.1, z: c.z + Math.sin(a) * p.r * 0.9, mode: 'align', dir: [0, 1, 0], aspect: 1.6, anchor: 0.45, life: 0.32, size: 0.25, size1: 0.6, sizePow: 0.5, color: [0.88, 0.95, 1, 0.6], color1: [0.88, 0.95, 1, 0], frame: FRAME.splash, mirror: k.rng() < 0.5 });
  }
  if (last) {
    // the burst: a short geyser, a white bloom, a ring on the ground out past the pull radius
    geyser(k, _a.set(c.x, fy, c.z), 0.55);
    P?.spawn({ additive: true, x: c.x, y: c.y, z: c.z, life: 0.14, size: 2.2, size1: 0.8, color: [3, 4.4, 5, 1], color1: [...ICE, 0], frame: FRAME.glow });
    fx?.shockwave(_a.set(c.x, fy + 0.06, c.z), { normal: UP, r0: 0.4, r1: p.r * 1.4, life: 0.5, color: [1.6, 3, 4], thin: false });
  }
  sfx(g, 'chiwen_orb_pulse', k.local ? { volume: 0.8 } : { pos: c, volume: 0.8 });
  if (!k.local) return;
  // pull ~1 m toward the centre (knock < 0) with the damage; falloff keeps the edge meaningful
  k.hurt(_a.set(c.x, fy + 0.9, c.z), p.r, p.dmg, { knock: -p.pull * 7 / 1.2, stagger: 0.7, falloffMin: 0.6, explosive: false });
  shake(g, last ? 0.14 : 0.06);
}

// 吞潮 (★ held, ultimate): the 5-beat summon (§1.7.3) at the aimed floor point.
registerSkill('swallowTide', {
  level: 'L3', aim: true, defaults: { range: 28, r: 6.5, pullR: 12, pullDist: 4, bite: 500, biteR: 3.6, spit: 400, spitR: 4, dur: 3.7, zh: '吞潮' },
  start(k) {
    const g = k.game, d = k.data;
    d.c = (k.at || k.feet()).clone();
    d.beat = 0; d.spits = 0; d.inT = 0;
    k.dur = k.p.dur;
    // the spirit faces the caster
    const cp = k.feet(V3());
    d.yaw = Math.atan2(-(cp.x - d.c.x), -(cp.z - d.c.z));
    sfx(g, 'chiwen_ult_inhale', k.local ? { volume: 1 } : { pos: d.c });
    // §1.12 layer 3: the 北管鑼鼓 + choir bed, scored to this skill's 3.7 s timeline
    sfx(g, 'chiwen_ult_bed', k.local ? { volume: 0.8 } : { pos: d.c, volume: 0.8 });
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
      if (k.local) shake(g, 0.1);
    }
    // ③ 0.6 the water 螭吻 bursts out of it (rising GHOST), water and rubble thrown up, the screen streaks (caster)
    if (d.beat < 2 && t >= 0.6) {
      d.beat = 2;
      const big = k.level >= 3;
      // 8-10 m of spirit, but its head (0.79 of its height) is kept where the caster can see it: <= ~20° above eye
      // level at the vortex distance (a 10 m spirit cast at 10 m would roar off the top of the screen)
      const dist = Math.hypot(c.x - k.pos.x, c.z - k.pos.z);
      const size = big ? Math.min(10, Math.max(6.2, (1.7 + dist * Math.tan(20 * Math.PI / 180)) / 0.79)) : 5.5;
      d.ghost = fx?.summons?.ghost?.({ mesh: chiwenSpirit(), pos: c, yaw: d.yaw, size, motion: 'rise', appear: 0.42, life: Infinity, out: 0.55,
        base: [0.5, 0.74, 1.0], core: [1.0, 2.6, 4.0], rim: [0.5, 1.3, 2.5], edge: WHITE, opacity: 0.66, glaze: 1.7, flowSpeed: 0.9, rimPower: 3.4,
        wave: { amp: 0.035, hz: 0.55, axis: [1, 0, 0], len: 1.1 }, exit: { kind: 'spray', count: big ? 80 : 34, speed: 5 }, seed: k.ev.seed });
      if (d.ghost) { d.ghost.obj.rotation.order = 'YXZ'; d.parts = spiritParts(d.ghost); d.parts.setJaw(0); d.parts.setTail(0); }
      burstUp(k, c, big ? 1 : 0.6);
      sfx(g, 'chiwen_ult_roar', k.local ? { volume: 1 } : { pos: c });
      if (k.local) { shake(g, 0.3); if (clipComfort.overlay) fx?.overlay?.radial?.(0.85, 0.5, { color: [0.7, 1.4, 2] }); }
    }
    const h = d.ghost;
    if (h?.alive) {
      // posture (rotation.x > 0 rears back): rise and rear to roar (0.6-1.1), dive at the vortex with the jaws wide
      // (1.1-1.55), snap shut (1.62), rear up, a forward jerk for each spit (1.8 / 2.2 / 2.6), settle and sink (3.0+)
      const sp = (a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
      const spitK = d.spits > 0 ? Math.max(0, 1 - (t - (1.8 + (d.spits - 1) * 0.4)) / 0.3) : 0;
      const lean = t < 1.1 ? 0.18 * sp(0.6, 1.0) : t < 1.62 ? 0.18 - 0.72 * Math.sin(sp(1.1, 1.5) * Math.PI * 0.5) : t < 1.8 ? -0.54 + 0.72 * sp(1.68, 2.0) : t < 3.0 ? 0.18 - 0.22 * spitK : 0.18 - 0.3 * sp(3.0, 3.5);
      h.obj.rotation.x = damp(h.obj.rotation.x, lean, 14, dt);
      if (t >= 1.12 && !d.ducked) {
        // where the head would be in the dive pose; the whole spirit drops (and steps back) so it ends ~2 m over the
        // vortex centre -- the bite reads from the caster's view, the jaws close over the crowd
        d.ducked = true;
        const hd = chiwenSpirit().userData.headAt, sz = h.obj.scale.x;
        const off = _b.set(hd.x, hd.y, hd.z).multiplyScalar(sz).applyEuler(new THREE.Euler(-0.54, h.obj.rotation.y, 0, 'YXZ'));
        h.lunge?.(_a.set(c.x - off.x, Math.min(c.y, c.y + 2.0 - off.y), c.z - off.z), 1.0);
      }
      const jaw = t < 0.75 ? 0 : t < 1.1 ? 0.55 * sp(0.75, 0.95) : t < 1.56 ? 0.55 + 0.4 * sp(1.1, 1.35) : t < 1.62 ? 0.95 * (1 - sp(1.56, 1.62)) : t < 3.0 ? 0.08 + 0.5 * spitK : 0.1;
      d.jaw = damp(d.jaw ?? 0, jaw, t > 1.5 && t < 1.66 ? 70 : 16, dt);
      d.parts?.setJaw(d.jaw);
      // the fish tail breaches behind it (1.15-1.45), sways, slaps the water with the bite, sinks at 3.0
      const rise = t < 1.15 ? 0 : t < 3.0 ? sp(1.15, 1.45) : 1 - sp(3.0, 3.4);
      const slap = t > 1.5 && t < 1.95 ? Math.sin(sp(1.5, 1.95) * Math.PI) * 0.7 : 0;
      d.parts?.setTail(rise, Math.sin(t * 3.1) * 0.35, slap);
      if (!d.tailUp && t >= 1.18) { d.tailUp = true; tailSplash(k, h, 1); }
      if (!d.tailSlap && t >= 1.72) { d.tailSlap = true; tailSplash(k, h, 1.6); }
    }
    // ④a 1.1-1.6 吞: everything within 12 m is dragged toward the mouth; 1.6 the bite
    if (d.beat < 3 && t >= 1.1) {
      d.beat = 3;
      vortexStreams(k, c, p.pullR);
      if (k.local) pullIn(k, c, p.pullR, p.pullDist);
      sfx(g, 'chiwen_ult_gulp', { pos: c, volume: 0.8 });   // 吞「咕嚕」(the bite itself lands at 1.62)
    }
    if (d.beat < 4 && t >= 1.62) {
      d.beat = 4;
      fx?.shockwave(_a.set(c.x, c.y + 0.08, c.z), { normal: UP, r0: 0.5, r1: p.biteR + 1, life: 0.45, color: [2, 3.6, 4.6], thin: false });
      splashFx(g, _a.set(c.x, c.y + 0.2, c.z), 3);
      fx?.impact?.(SURF.water, _b.set(c.x, c.y + 0.02, c.z), UP, _c.set(0, -1, 0), { decal: false, big: 3 });
      groundDust(k, c, 2.5, 10);
      h?.flash?.(2.2);
      if (h?.alive) {
        const hp = h.obj.localToWorld(_b.copy(chiwenSpirit().userData.headAt));
        fx?.particles.spawn({ additive: true, x: hp.x, y: hp.y, z: hp.z, life: 0.16, size: 4, size1: 1.5, color: [5, 6, 6.5, 1], color1: [...ICE, 0], frame: FRAME.glow });
        fx?.particles.spawn({ additive: true, x: hp.x, y: hp.y, z: hp.z, life: 0.3, size: 1, size1: 6, sizePow: 0.4, color: [...WHITE, 0.9], color1: [...ICE, 0], frame: FRAME.thinRing, rot: k.rng() * 6 });
        fx?.lights?.flash(hp, 0xe8fbff, 80, 14, 0.12);
      }
      fx?.zfx?.ground?.add?.('crack', _a.set(c.x, c.y + 0.02, c.z), { r: p.biteR + 0.5, life: 5, col: [0.04, 0.05, 0.06], alpha: 0.85, fadeIn: 0.02, fadeOut: 2 });
      fx?.decals?.add(_a.set(c.x, c.y, c.z), UP, { frame: DECAL.pool, size: p.biteR * 2.2, tint: DECAL_TINT.none, alpha: 0.5, life: 6, fade: 2 });
      sfx(g, 'chiwen_ult_bite', { pos: c, volume: 1 });
      if (k.local) {
        k.hurt(_a.set(c.x, c.y + 0.9, c.z), p.biteR, p.bite, { knock: 3, stagger: 1, falloffMin: 1, explosive: false });
        g.hitStop?.(clipComfort.hitstop ? 0.12 : 0); shake(g, 0.45);
        if (clipComfort.overlay) fx?.overlay?.tint?.([1, 1, 1], 0.32, 0.14, { fadeIn: 0.01, fadeOut: 0.12 });
        g.arsenal?.fovKick?.(-3, 0.2);
      }
    }
    // ④b 1.8 / 2.2 / 2.6 吐: three water columns on the densest groups
    if (d.beat >= 4 && d.spits < 3 && t >= 1.8 + d.spits * 0.4) {
      // re-picked per spit from the zombies still standing (the bite's survivors, the pulled outer ring); a lone
      // survivor group takes more than one; nothing left: the column rises where the last one did
      const tp = densest(g, c, k.dir, 1, p.spitR, d.last)[0];
      d.last = tp;
      d.spits++;
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
/** The n densest live groups within 20 m of c (greedy r clusters); with none left, `prev` or points round c. */
function densest(g, c, dir, n, r, prev = null) {
  const zs = (g.zombies?.list || []).filter((z) => z.alive && z.pos.distanceTo(c) < 20);
  if (!zs.length && prev) return [prev.clone()];
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
  if (d.ghost?.alive) d.ghost.obj.localToWorld(head.set(0, 0.71, -0.36)); else head.set(d.c.x, d.c.y + 6, d.c.z);
  fx?.beam?.(head, _a.set(at.x, at.y + 0.5, at.z), { core: WHITE, glow: [0.5, 1.4, 2.8], wCore: 0.12, wGlow: 0.5, life: 0.28, shrink: 0.2 });
  for (let i = 0; i < 10; i++) {
    const u = k.rng();
    _b.lerpVectors(head, at, u);
    fx?.particles.spawn({ x: _b.x, y: _b.y, z: _b.z, vx: (k.rng() - 0.5) * 2, vy: k.rng() * 2, vz: (k.rng() - 0.5) * 2, life: 0.5, size: 0.06, stretch: 0.04, color: [0.88, 0.95, 1, 0.85], color1: [0.88, 0.95, 1, 0], frame: FRAME.drop, gravity: 9.8 });
  }
  later2(k, 0.12, () => {
    fx?.sigils?.pillar?.(at, { radius: 1.3, height: 9, color: [1.2, 3.2, 4.6], color1: [3, 4.6, 5.6], life: 0.8, rise: true, motes: 10, ring: true });
    geyser(k, at, 1);
    fx?.impact?.(SURF.water, _a.set(at.x, at.y + 0.02, at.z), UP, _b.set(0, -1, 0), { decal: false, big: 2.6 });
    splashFx(g, _a.set(at.x, at.y + 0.3, at.z), 2.2);
    groundDust(k, at, 1.6, 7);
    fx?.decals?.add(at, UP, { frame: DECAL.pool, size: 2.4, tint: DECAL_TINT.none, alpha: 0.3, life: 4, fade: 2 });
    sfx(g, 'chiwen_ult_spit', k.local ? { pos: at, volume: 1 } : { pos: at, volume: 0.9 });
    if (!k.local) return;
    k.hurt(_a.set(at.x, at.y + 0.9, at.z), p.spitR, p.spit, { knock: 5, stagger: 1, falloffMin: 0.55, explosive: false });
    // 拋起: the host tosses them up (a guest's caster only shoves)
    if (g.zombies?.authority) for (const z of g.zombies.inRadius(at, p.spitR)) if (z.alive && z.kvel && !z.def?.boss) z.kvel.y = Math.max(z.kvel.y || 0, 5.5);
    shake(g, 0.25);
    g.arsenal?._clipEvent?.('haptic', 'thud');
  });
}
/** A water column bursting up: a sheath of streaking drops, a foaming cap that falls back, mist (every client). */
function geyser(k, at, s = 1) {
  const P = k.game.fx?.particles;
  if (!P) return;
  for (let i = 0; i < 46 * s; i++) {
    const a = k.rng() * 6.283, r = k.rng() * 1.1 * s, up = 7 + k.rng() * 9;
    P.spawn({ x: at.x + Math.cos(a) * r, y: at.y + 0.2, z: at.z + Math.sin(a) * r, vx: Math.cos(a) * (0.6 + k.rng() * 1.6), vy: up, vz: Math.sin(a) * (0.6 + k.rng() * 1.6),
      life: 1.1 + k.rng() * 0.6, size: 0.05 + k.rng() * 0.05, stretch: 0.06, color: [0.88, 0.95, 1, 0.9], color1: [0.88, 0.95, 1, 0], frame: FRAME.drop, gravity: 9.8 });
  }
  for (let i = 0; i < 7 * s; i++) {
    const a = (i / 7) * 6.283;
    P.spawn({ x: at.x + Math.cos(a) * 0.6, y: at.y + 1 + k.rng() * 5, z: at.z + Math.sin(a) * 0.6, vx: Math.cos(a) * 0.8, vy: 1.5 + k.rng() * 2, vz: Math.sin(a) * 0.8,
      life: 1.4, size: 0.7 * s, size1: 1.9 * s, sizePow: 0.5, color: [...MIST, 0.32], color1: [...MIST, 0], frame: FRAME.puff + (i % 4), lit: true, drag: 1.2, gravity: 1.5 });
  }
}
/** The spirit's tail breaking / slapping the water behind it. */
function tailSplash(k, h, s = 1) {
  const fx = k.game.fx, p = h.obj.localToWorld(_d.set(0.05, 0.02, 0.62));
  p.y = k.floorY(_e.set(p.x, p.y + 1, p.z));
  fx?.impact?.(SURF.water, _e.set(p.x, p.y + 0.02, p.z), UP, _f.set(0, -1, 0), { decal: false, big: 2.2 * s });
  splashFx(k.game, _e.set(p.x, p.y + 0.3, p.z), 1.8 * s);
  fx?.shockwave(_e.set(p.x, p.y + 0.06, p.z), { normal: UP, r0: 0.4, r1: 2.6 * s, life: 0.5, color: [1.2, 2.6, 3.4], thin: false });
  groundDust(k, p, 1.4, 6);
  sfx(k.game, 'chiwen_ult_tail', { pos: p, volume: 0.8 * s });
  if (k.local && s > 1) shake(k.game, 0.12);
}
/** Skill-time delayed calls: queued on the instance, run by its own update (they die with it). */
function later2(k, sec, fn) { (k.data.q ||= []).push([k.t + sec, fn]); }
function runLater2(k) { const q = k.data.q; if (!q) return; for (let i = q.length - 1; i >= 0; i--) if (k.t >= q[i][0]) { const f = q[i][1]; q.splice(i, 1); f(); } }

// 螭吻護甲 (crisis, via crisis.js `fx`): a water dragon coils round the player as the armour breaks.
registerSkill('chiwen_crisis', {
  level: 'L1',
  start(k) {
    const g = k.game, fx = g.fx, c = k.feet(V3());
    // the water dragon circles the player 1.5 m out (centred on the player it would sweep through the camera)
    const h = fx?.summons?.ghost?.({ shape: 'serpent', pos: _a.set(c.x + 1.5, c.y, c.z), size: 2.3, motion: 'rise', appear: 0.18, life: 0.85, out: 0.35, base: [0.5, 0.75, 1], core: [1, 2.6, 4],
      rim: [1.4, 3.2, 5], edge: WHITE, opacity: k.local ? 0.36 : 0.48, glaze: 1.4, wave: { amp: 0.1, hz: 1.4, axis: [1, 0, 0], len: 1 }, exit: { kind: 'spray', count: 24, speed: 4 }, seed: k.ev.seed, big: false });
    // two water ribbons spiral up round the player for a second
    const rib = [0, 1].map(() => fx?.trail?.({ width: 0.14, life: 0.32, color: [1.8, 3.6, 4.6, 0.9], color1: [0.4, 1.1, 2.4, 0], segs: 20 }));
    let t = 0;
    const run = { update: (dt) => {
      t += dt;
      if (h?.alive) { const a = t * 6.5; h.base.set(c.x + Math.cos(a) * 1.5, c.y, c.z + Math.sin(a) * 1.5); h.obj.rotation.y = -a; }
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
    geyser(k, c, 0.7);
    fx?.impact?.(SURF.water, _b.set(c.x, c.y + 0.02, c.z), UP, _e.set(0, -1, 0), { decal: false, big: 2 });
    splashFx(g, _b.set(c.x, c.y + 0.3, c.z), 1.8);
    sfx(g, 'chiwen_final', { pos: c, volume: 0.9 });
  },
});

// ------------------------------------------------------------------------------------------ clips
const Z3 = [0, 0, 0];
// inspect "lift": the gun swung round 157° (about the grip) and pitched up 10°, pushed 0.6 m out, so the 螭吻 looks
// back at the camera from ~38 cm (3/4 front, just left of centre) while the rest of the rifle recedes behind it. The
// right hand lets go for it (the grip is a metre out) and the left one cradles the front of the handguard (tube_b).
const LIFT_P = [0.036, -0.008, -0.6], LIFT_R = [10, 157, 0];
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
      [0.6, LIFT_P, 'inOut'], [0.65, [LIFT_P[0] - 0.003, LIFT_P[1] + 0.003, LIFT_P[2]]], [0.83, LIFT_P],
      [0.93, [0, 0.004, 0], 'inOut'], [1, Z3]],
    gunRot: [[0, Z3], [0.08, [8, 28, -24]], [0.13, [11, 36, -32]], [0.17, [8, 28, -24]],
      [0.26, [-4, 20, -56], 'inOut'], [0.5, [-2, 23, -52]],
      [0.6, LIFT_R, 'inOut'], [0.65, [LIFT_R[0] + 2, LIFT_R[1] + 3, LIFT_R[2] - 2]], [0.83, LIFT_R],
      [0.93, [1, -2, 2], 'inOut'], [1, Z3]],
    fx_jaw: [[0, 0], [0.64, 0], [0.655, 0.5, 'out3'], [0.7, 0.12], [0.76, 0], [1, 0]],
    env: [[0, 0], [0.1, 1], [0.88, 1], [1, 0]],
    ...scaleWave(0.09, 0.012, 0.03, 0.06),
  },
  events: [
    [0.02, 'cw', 'world'], [0.04, 'snd', 'cloth'], [0.22, 'snd', 'cloth'],
    [0.27, 'anchorL', ['tube_b', 0.18]], [0.31, 'anchorL', ['tube_a', 0.9]], [0.31, 'cw', { do: 'flow', sec: 1.3 }], [0.31, 'haptic', 'tick'],
    [0.52, 'anchorL', ['grip_l', 0.22]], [0.55, 'poseL', vm?.supportGrip?.pose || 'cradle'], [0.56, 'snd', 'cloth'],
    [0.54, 'anchorR', ['rest', 0.22]], [0.57, 'anchorL', ['tube_b', 0.2]],
    [0.652, 'cw', 'inspbubble'], [0.66, 'cw', { do: 'eyes', k: 1.4 }], [0.84, 'haptic', 'tick'],
    [0.84, 'anchorR', ['grip_r', 0.16]], [0.86, 'anchorL', ['grip_l', 0.18]], [0.88, 'poseL', vm?.supportGrip?.pose || 'cradle'],
  ],
}));

/** Rare inspect (1/10): the 螭吻 blows a big bubble at the camera, a finger pokes it, it splashes on the glove. */
registerClip('chiwen_bubble_mirror', (vm) => ({
  duration: 4.6, loop: [0.05, 0.14],
  tracks: {
    gunPos: [[0, Z3], [0.07, [-0.03, 0.02, 0.03]], [0.11, [-0.038, 0.025, 0.026]], [0.14, [-0.03, 0.02, 0.03]],
      [0.26, LIFT_P, 'inOut'], [0.72, [LIFT_P[0] - 0.003, LIFT_P[1] + 0.003, LIFT_P[2]]], [0.84, LIFT_P], [0.94, [0, 0.004, 0], 'inOut'], [1, Z3]],
    gunRot: [[0, Z3], [0.07, [8, 28, -24]], [0.11, [10, 34, -30]], [0.14, [8, 28, -24]],
      [0.26, LIFT_R, 'inOut'], [0.72, [LIFT_R[0] + 2, LIFT_R[1] + 3, LIFT_R[2] - 2]], [0.84, LIFT_R], [0.94, [1, -2, 2], 'inOut'], [1, Z3]],
    fx_jaw: [[0, 0], [0.3, 0], [0.34, 0.6, 'out3'], [0.5, 0.45], [0.56, 0.1], [0.62, 0], [1, 0]],
    env: [[0, 0], [0.1, 1], [0.88, 1], [1, 0]],
  },
  events: [
    [0.02, 'cw', 'world'], [0.04, 'snd', 'cloth'], [0.24, 'snd', 'cloth'], [0.2, 'anchorR', ['rest', 0.2]], [0.22, 'anchorL', ['tube_b', 0.2]], [0.33, 'cw', 'bigbubble'],
    [0.5, 'anchorL', ['mouth', 0.3]], [0.54, 'poseL', 'point'], [0.6, 'cw', 'pop'], [0.6, 'haptic', 'tick'],
    [0.66, 'anchorL', ['tube_b', 0.2]], [0.7, 'poseL', vm?.supportGrip?.pose || 'cradle'], [0.74, 'cw', { do: 'droplets', n: 6 }],
    [0.85, 'anchorR', ['grip_r', 0.16]], [0.87, 'anchorL', ['grip_l', 0.18]],
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
// km_chiwen: a 瓦當 (roof-tile end) roundel -- the ridge the 螭吻 guards. (1) an ink brush draws the ring and three
// wave strokes, (2) the cobalt field rises like a tide, the porcelain 螭吻 head (open jaws, upturned snout, horns,
// flame mane, jade gill fin) surfaces out of it and the gilt ring with its 連珠 beads closes round it, (3) full glow,
// (4) 點睛: the eye flashes with the ding. Headshot: a cross-star from the eye + an ice ring. All original, procedural.
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
/** The head in profile (facing right) in roundel units (centre 0, radius 1, y down). */
function headPath(c, R) {
  const P = (x, y) => [c + x * R, c + y * R];
  const p = new Path2D();
  const q = (cx, cy, x, y) => p.quadraticCurveTo(...P(cx, cy), ...P(x, y));
  p.moveTo(...P(-0.44, 0.46));
  q(-0.64, 0.2, -0.5, -0.06);     // back of the neck
  q(-0.4, -0.3, -0.12, -0.33);    // crown
  q(0.04, -0.36, 0.13, -0.27);    // brow ridge
  q(0.31, -0.23, 0.47, -0.21);    // snout
  q(0.62, -0.28, 0.67, -0.17);    // upturned nose
  q(0.72, -0.06, 0.61, -0.03);    // nose tip down to the lip
  q(0.42, 0.0, 0.1, 0.06);        // upper jaw back to the corner of the mouth
  p.lineTo(...P(0.5, 0.25));      // open lower jaw
  q(0.58, 0.31, 0.47, 0.36);      // chin
  q(0.2, 0.41, 0.0, 0.43);        // jaw underside
  q(-0.2, 0.5, -0.44, 0.46);      // throat
  p.closePath();
  return p;
}
/** a mane lock: a tapered flame tongue from (x, y) along ang (rad), length len, half width w (roundel units) */
function flame(c, R, x, y, len, ang, w) {
  const P = (u, o) => [c + (x + Math.cos(ang) * u * len - Math.sin(ang) * o) * R, c + (y + Math.sin(ang) * u * len + Math.cos(ang) * o) * R];
  const p = new Path2D();
  p.moveTo(...P(0, -w)); p.quadraticCurveTo(...P(0.55, -w * 1.3), ...P(1, -w * 0.2 - 0.05 / len));
  p.quadraticCurveTo(...P(0.7, w * 0.2), ...P(0.62, w * 0.7)); p.quadraticCurveTo(...P(0.4, w * 0.4), ...P(0, w));
  p.closePath();
  return p;
}
registerKillMark('km_chiwen', {
  draw(ctx, S, t, o) {
    const p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
    const c = S / 2, R = S * 0.4, X = (u) => c + u * R;
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // (2) the tide: a cobalt field rising inside the ring, a foaming wavy surface
    if (p2 > 0) {
      ctx.save();
      ctx.beginPath(); ctx.arc(c, c, R * 0.86, 0, Math.PI * 2); ctx.clip();
      const lvl = 1 - 2.1 * p2;
      const gr = ctx.createRadialGradient(c, c - R * 0.4, R * 0.1, c, c, R);
      gr.addColorStop(0, '#3a6fd0'); gr.addColorStop(0.6, '#244aa5'); gr.addColorStop(1, '#0f2560');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(0, S);
      for (let i = 0; i <= 24; i++) { const u = i / 24; ctx.lineTo(u * S, X(lvl) + Math.sin(u * 12 + t * 9) * R * 0.04); }
      ctx.lineTo(S, S); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // (1) ink: the ring and three wave strokes, brushed in (dash reveal); the waves turn to foam once the tide rises
    const ink = 'rgba(10,20,40,0.92)';
    const peri = Math.PI * 2 * R * 0.93;
    ctx.save();
    ctx.setLineDash([peri * Math.min(1, p1 * 1.15), peri]);
    ctx.beginPath(); ctx.arc(c, c, R * 0.93, Math.PI * 0.62, Math.PI * 2.62); ctx.lineWidth = S * 0.05; ctx.strokeStyle = ink; ctx.stroke();
    ctx.restore();
    const waves = [[[-0.78, 0.5], [-0.45, 0.36], [-0.12, 0.52], [0.2, 0.38], [0.52, 0.5], [0.8, 0.4]], [[-0.7, 0.66], [-0.3, 0.58], [0.1, 0.7], [0.5, 0.6], [0.72, 0.66]], [[-0.5, 0.8], [0, 0.76], [0.45, 0.82]]];
    waves.forEach((pts, i) => {
      const u = seg(t, 0.1 + i * 0.08, 0.42 + i * 0.06);
      if (u <= 0) return;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(X(pts[0][0]), X(pts[0][1]));
      for (let j = 1; j < pts.length - 1; j++) ctx.quadraticCurveTo(X(pts[j][0]), X(pts[j][1]), X((pts[j][0] + pts[j + 1][0]) / 2), X((pts[j][1] + pts[j + 1][1]) / 2));
      ctx.lineTo(X(pts.at(-1)[0]), X(pts.at(-1)[1]));
      ctx.setLineDash([S * 2 * u, S * 2]);
      ctx.lineWidth = S * (i ? 0.024 : 0.034); ctx.strokeStyle = p2 > 0.3 ? `rgba(232,244,255,${(0.5 + 0.5 * p2).toFixed(2)})` : ink; ctx.stroke();
      ctx.restore();
    });
    // the 螭吻 surfaces out of the tide (clip reveal from the waterline up) and takes its glaze
    if (p2 > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, X(0.55 - 1.3 * Math.min(1, p2 * 1.25)), S, S); ctx.clip();
      ctx.translate(0, R * 0.12 * (1 - p2));
      // horns (gilt), behind the head
      ctx.lineWidth = S * 0.026; ctx.strokeStyle = '#e3b04b';
      ctx.beginPath(); ctx.moveTo(X(-0.1), X(-0.3)); ctx.quadraticCurveTo(X(-0.35), X(-0.62), X(-0.62), X(-0.6)); ctx.quadraticCurveTo(X(-0.72), X(-0.5), X(-0.62), X(-0.46)); ctx.stroke();
      ctx.lineWidth = S * 0.018;
      ctx.beginPath(); ctx.moveTo(X(-0.3), X(-0.5)); ctx.quadraticCurveTo(X(-0.28), X(-0.72), X(-0.18), X(-0.76)); ctx.stroke();
      // flame mane (cobalt with a gilt edge)
      for (const [x, y, L, a, w] of [[-0.42, -0.2, 0.42, Math.PI * 1.06, 0.1], [-0.52, 0.06, 0.4, Math.PI * 0.98, 0.1], [-0.48, 0.3, 0.34, Math.PI * 0.9, 0.09]]) {
        const f = flame(c, R, x, y, L, a, w);
        ctx.fillStyle = '#8fb6ee'; ctx.fill(f); ctx.lineWidth = S * 0.009; ctx.strokeStyle = '#e3b04b'; ctx.stroke(f);
      }
      // porcelain head, cool shading, red mouth, cobalt scale arcs on the neck, jade gill fin
      const head = headPath(c, R);
      const hg = ctx.createLinearGradient(0, X(-0.35), 0, X(0.45));
      hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.55, '#e8f4ff'); hg.addColorStop(1, '#9ebfe6');
      ctx.fillStyle = hg; ctx.fill(head);
      ctx.save(); ctx.clip(head);
      ctx.fillStyle = '#9a1420';
      ctx.beginPath(); ctx.moveTo(X(0.1), X(0.06)); ctx.lineTo(X(0.62), X(0.0)); ctx.lineTo(X(0.5), X(0.25)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#244aa5'; ctx.lineWidth = S * 0.011;
      for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) { const x = -0.42 + k * 0.11 + (r % 2) * 0.055, y = 0.08 + r * 0.1; ctx.beginPath(); ctx.arc(X(x), X(y), R * 0.06, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = '#2f8f4e';
      ctx.beginPath(); ctx.moveTo(X(-0.18), X(0.1)); ctx.quadraticCurveTo(X(-0.36), X(0.0), X(-0.46), X(0.12)); ctx.quadraticCurveTo(X(-0.34), X(0.18), X(-0.44), X(0.3)); ctx.quadraticCurveTo(X(-0.28), X(0.3), X(-0.16), X(0.22)); ctx.closePath(); ctx.fill();
      ctx.lineWidth = S * 0.007; ctx.strokeStyle = '#e3b04b'; ctx.stroke();
      // teeth
      ctx.fillStyle = '#ffffff';
      for (const [x, y, d] of [[0.5, 0.0, 1], [0.32, 0.03, 1], [0.44, 0.22, -1], [0.27, 0.15, -1]]) { ctx.beginPath(); ctx.moveTo(X(x - 0.035), X(y)); ctx.lineTo(X(x + 0.035), X(y)); ctx.lineTo(X(x), X(y + d * 0.08)); ctx.closePath(); ctx.fill(); }
      // gilt outline, flame brow, whisker curl
      ctx.lineWidth = S * 0.015; ctx.strokeStyle = '#e3b04b'; ctx.stroke(head);
      ctx.beginPath(); ctx.moveTo(X(-0.04), X(-0.25)); ctx.lineTo(X(-0.02), X(-0.4)); ctx.lineTo(X(0.06), X(-0.3)); ctx.lineTo(X(0.12), X(-0.42)); ctx.lineTo(X(0.17), X(-0.29)); ctx.lineWidth = S * 0.013; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(0.58), X(-0.04)); ctx.quadraticCurveTo(X(0.48), X(0.14), X(0.28), X(0.12)); ctx.quadraticCurveTo(X(0.18), X(0.1), X(0.22), X(0.04)); ctx.lineWidth = S * 0.01; ctx.stroke();
      ctx.restore();
    }
    // the gilt ring closing round it: outer band, 連珠 beads, inner line
    if (p2 > 0.2) {
      const u = seg(p2, 0.2, 1);
      ctx.save();
      ctx.globalAlpha = u;
      ctx.lineWidth = S * 0.038; ctx.strokeStyle = '#d9a948';
      ctx.beginPath(); ctx.arc(c, c, R * 0.93, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * u); ctx.stroke();
      ctx.lineWidth = S * 0.008; ctx.strokeStyle = '#fff1b8';
      ctx.beginPath(); ctx.arc(c, c, R * 0.86, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * u); ctx.stroke();
      ctx.fillStyle = '#fff1b8';
      const n = Math.floor(18 * u);
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / 18) * Math.PI * 2; ctx.beginPath(); ctx.arc(X(Math.cos(a) * 0.93), X(Math.sin(a) * 0.93), S * 0.009, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    // (3) full glow: an ice rim round the ring and the head
    if (p3 > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = CY; ctx.shadowBlur = S * 0.07 * p3;
      ctx.globalAlpha = 0.45 * p3; ctx.lineWidth = S * 0.012; ctx.strokeStyle = CY;
      ctx.beginPath(); ctx.arc(c, c, R * 0.97, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.3 * p3; ctx.stroke(headPath(c, R));
      ctx.restore();
    }
    // (4) 點睛: the eye
    const ex = X(0.07), ey = X(-0.18);
    if (p2 > 0.6) { ctx.fillStyle = '#0b1d3a'; ctx.beginPath(); ctx.arc(ex, ey, S * 0.024, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#e3b04b'; ctx.lineWidth = S * 0.007; ctx.stroke(); }
    const fl = Math.sin(Math.PI * p4) + (o.head ? Math.max(0, 1 - Math.abs(t - 1.1) / 0.08) * 0.8 : 0);
    if (p3 > 0 || fl > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gw = ctx.createRadialGradient(ex, ey, 0, ex, ey, S * (0.03 + 0.07 * fl));
      gw.addColorStop(0, `rgba(255,255,255,${(0.6 * p3 + 0.4 * Math.min(1, fl)).toFixed(2)})`); gw.addColorStop(0.4, 'rgba(111,227,255,0.6)'); gw.addColorStop(1, 'rgba(111,227,255,0)');
      ctx.fillStyle = gw; ctx.fillRect(ex - S * 0.14, ey - S * 0.14, S * 0.28, S * 0.28);
      if (fl > 0.01) {
        const L = S * (0.05 + fl * (o.head ? 0.16 : 0.07));
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = S * 0.008; ctx.globalAlpha = Math.min(1, fl);
        ctx.beginPath(); ctx.moveTo(ex - L, ey); ctx.lineTo(ex + L, ey); ctx.moveTo(ex, ey - L * 0.7); ctx.lineTo(ex, ey + L * 0.7);
        if (o.head) { const d = L * 0.4; ctx.moveTo(ex - d, ey - d); ctx.lineTo(ex + d, ey + d); ctx.moveTo(ex + d, ey - d); ctx.lineTo(ex - d, ey + d); }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (o.head && t > 1.0) {
      const u = Math.min(1, (t - 1.0) / 0.17);
      ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = o.tint || CY; ctx.lineWidth = S * 0.012;
      ctx.beginPath(); ctx.arc(ex, ey, S * (0.04 + 0.42 * u), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  },
});

export { SFX as CHIWEN_SFX };
