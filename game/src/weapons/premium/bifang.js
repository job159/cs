// M03 畢方．焚翼 Bifang Pyrewing ／ 鬼車．晦翼 Guiche Gloomwing — 神兵 光暗雙生 (docs/PREMIUM_WEAPONS.md M03, §2.25,
// §2.26). Mechanics on the specials v2 engine (registerSpecial 'bifang' + four skills) and the whole presentation:
// viewmodel driver, clips, light wings, crosshair, kill marks. Effect primitives: bifang_fx.js. Model:
// tools/assets/weapons/bifang.mjs (guiche.mjs = the twin). The twin keeps every number; defs.js special.look picks
// the names / colours / signature (LOOKS in bifang_fx.js).
//
//   fire        8 pellets x 20 (hitscan for the feel), a cannon's weight: a heavy view punch / viewmodel kick but little
//               aim drift (recoil settles between shots), stagger + knockback on every pellet; 4+ pellets in one body
//               = 30 ms hit-stop + shake, a kill 40 ms, 2+ kills 60 ms + a bell; one sizzle (滋滋) + bell tick per target.
//               Look: 冠羽扇 crest fan at the beak (2-frame white core, ~0.55 m flame feathers), 4 feather-vein
//               ribbons a volley, a gold-vermilion splash with fire-feather shards on every pellet hit, the lower jaw
//               kicks 4°; every pellet stacks 灼羽 (≤ 5, 8/s each, 3 s): a thin flickering rim (under the elite rim),
//               body flames and rising feather licks, stack pips; DOT numbers summed once a second
//   ◎ 焚翼      ≥ 40 % 羽能: bones swing open 69°, cloisonné light wings spread (outBack 0.25 s), 6 s or ◎ again, 10 %/s:
//               3 m burn 40/s, slows cleared / ignored, +10 % speed, teammates within 4 m cleansed (every 6 s).
//               First person the fans grow from the bone tips and open upwards (left fan to the upper left, right to
//               the upper right): the centre 20 % stays clear. Once 40 % is spent the bones flick past 90° and hold at
//               ~78°, the fan edges burn white-hot and pulse ("fold now"); folding (fans first, then the bones) fires
//               焚天光: a fat feather-vein shaft from the beak (3.8 m glow), 600 + 120/s for 1.2 s, 30 m x 1.4 m,
//               piercing, the street under it catching fire, a pillar + debris where it ends. 鬼車 晦天墜: a ghost-fire
//               meteor falls slantwise onto the line's end (smoke, wisps, a crater), then the seam burns
//   ★ 羽落      25 %: 12 burning feather lances (white-hot heads, vermilion trails) in 6 m round the crosshair over
//               1.2 s, planted ~1 s as flame feathers, 60 + 2 stacks each, a ring + dust + a thump near the crosshair
//   ★ held      畢方降臨 (天火 from damage): card, a dim gold-vermilion sigil, pillar, the porcelain one-legged crane
//               (≈ 6 m tall, vermilion beak, red crown / crest, teal / vermilion feather plates, gold edges; the gun's
//               cloisonné light wings on its wrists: ≈ 9 m span) lands ≥ 12 m away (seen whole), one wing beat (60°
//               cone, 300 + 3 stacks, knockback), then a banking 25 m dive that sweeps across the view, leaving 1.5-2 m
//               flames (4 s, 30/s), a burning ribbon and a riding light; it bursts into fire feathers (shockwave, dust,
//               pillar) at the end of the run. 鬼車夜啼: the nine-headed bird circles, the horde turns and flees 1.5 s
//               (fear first), the scream hurts (120), then the dive
//   crisis 羽衣  the light wings wrap the player (cocoon) and burst into feathers (crisis.js does the blocking)
//   kill        KE_PLUME (three 0.5 m fire feathers + scorch; the corpse gets a warm rim flash, not the white body flash)
//               (鬼車: KE_SOUL ghost-fire wisp to the gun, +2 % 晦羽); km_bifang / km_guiche: ~180 px cloisonné emblems
// Sound cues are named per §1.12 (bifang_* / ready_*); the twin plays the same cues -4 semitones with an echo.
import * as THREE from 'three';
import { registerSpecial, registerSkill, startSkill, endSkill, meterAdd, canCast, chargeState } from '../specials.js';
import { registerClip } from '../../player/clips.js';
import { registerCrosshair, injectCSS } from '../../ui/crosshairs.js';
import { registerKillMark } from '../../ui/killmarks.js';
import { FRAME, DECAL } from '../../fx/fx.js';
import { haptic, clipComfort } from '../arsenal.js';
import { LOOKS, lookOf, sfx, CRANE_WRIST, crestFan, veinTongue, veinEmber, featherTracer, plume, emberHit, featherLick, killPlume, soulWisp, FeatherLance, debris, FirePath, craneGeo, nineHeadGeo, BurnPips } from './bifang_fx.js';

const D2R = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const Z3 = [0, 0, 0];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Quaternion();
const R = Math.random;
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

const ps = (vm, name) => vm.partState[name] || (vm.partState[name] = { v: 0 });
const mine = (g, ws) => !!g.vm?.weapon && g.vm.weapon.def === ws.def;     // the viewmodel shows this weapon
const hexOf = (c) => '#' + new THREE.Color(Math.min(1, c[0] / Math.max(c[0], c[1], c[2])), Math.min(1, c[1] / Math.max(c[0], c[1], c[2])), Math.min(1, c[2] / Math.max(c[0], c[1], c[2]))).getHexString();
/** Game-time delayed call (hitstop / stepped frames safe), run from the special's tick. */
function later(ws, sec, fn) { (ws.sp.q ||= []).push([sec, fn]); }
/** A gun clip only when nothing else is playing that matters (never cuts a reload's ammo event). */
function gunClip(g, ws, id) { const ar = g.arsenal; if (ar?.current === ws && ar.state === 'idle') ar.playClip(id); }
let pips = null;

// ------------------------------------------------------------------------------------- light wings on the bones
/**
 * One feather fan per wing bone, rooted at its rivets (S_wingL / S_wingR = the open pose) and parented to the bone, so
 * it opens / folds with it: the fan group carries the inverse of the full-open rotation, at v = 1 it stands in the
 * gun's frame. opts: style 'glow' | 'cloisonne', count, scale, dur (open), spacing, sweep.
 */
function vmWings(g, ws, opts = {}) {
  const s = ws.sp, w = g.vm?.weapon, kit = g.fx?.wings, L = lookOf(ws.def);
  if (!w?.parts?.fx_wingRootR || !kit) return null;
  dropWings(s);
  const out = { gun: w, list: [], closeAt: -1 };
  for (const side of ['L', 'R']) {
    const part = w.parts['fx_wingRoot' + side], sock = w.sockets['wing' + side];
    if (!part || !sock) continue;
    const ex = part.extras, h = ex.hinge || [0, 0, 1];
    const qOpen = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(h[2], h[1], -h[0]).normalize(), (ex.open || 0) * D2R);
    // first person the fans grow from the bone tips (the middle rivet sits near the crosshair with the gun on the
    // right): both fans open upwards, the left one towards the upper left, the right one towards the upper right,
    // so the central 20 % stays clear (§1.7.5 WING, §1.14)
    // (clips that swing the gun round -- first draw, inspect -- pass fan: false: the kit's face-on fan at the rivet)
    const fanOn = opts.fan !== false;
    const anchor = sock.pos.clone().sub(part.pos).multiplyScalar(opts.tip ?? (fanOn ? 1.95 : 1));
    const cl = opts.style === 'cloisonne';
    const fan = !fanOn ? null : side === 'L' ? { L: { a: [0.12, 1, 0.42], o: [-1, 0.12, 0.3] } } : { R: { a: [-0.08, 1, 0.42], o: [1, -0.05, 0.3] } };
    const wg = kit.attach(part.node, { vm: true, side, anchors: { [side]: anchor }, style: opts.style || 'glow', count: opts.count ?? 7, scale: opts.scale ?? 0.7,
      spacing: opts.spacing ?? 13, sweep: opts.sweep ?? 25, open: false, core: L.wing.core, tip: L.wing.tip, enamel: L.wing.enamel, gold: L.wing.gold, shape: cl ? 1 : 0,
      fan, alpha: opts.alpha ?? (cl ? Math.min(0.62, L.wing.alpha ?? 1) : 0.92), tipMix: L.wing.tipMix ?? 0, guardMin: 0.2 });
    wg.group.quaternion.copy(qOpen).invert();
    wg.openWing(opts.dur ?? 0.25);
    out.list.push(wg);
  }
  s.vmw = out;
  return out;
}
/** Fold (fold s > 0: animate, detach 0.35 s later) or drop the first-person wings now. */
function dropWings(s, fold = 0, now = 0) {
  const v = s.vmw;
  if (!v) return;
  if (fold > 0) { for (const w of v.list) w.close(fold); v.closeAt = now + fold + 0.15; return; }
  for (const w of v.list) w.detach();
  s.vmw = null;
}

/** Third-person / teammates: wings on the caster's back (§1.16 背飾 grammar: 2.4 m span when spread). */
function backWings(g, by, L, scale = 2.2) {
  const r = g.net?.remotes?.get?.(by);
  const kit = g.fx?.wings;
  if (!r?.root || !kit) return null;
  const mount = new THREE.Group();
  mount.position.set(0, 1.36, -0.14);        // between the shoulder blades (model faces +Z)
  mount.rotation.y = Math.PI;                // the wing kit's 'back' frame leans towards +Z
  r.root.add(mount);
  const w = kit.attach(mount, { preset: 'back', anchors: { L: new THREE.Vector3(-0.1, 0, 0), R: new THREE.Vector3(0.1, 0, 0) }, count: 6, scale,
    style: 'cloisonne', core: L.wing.core, tip: L.wing.tip, enamel: L.wing.enamel, gold: L.wing.gold, tipMix: L.wing.tipMix ?? 0, alpha: L.wing.alpha ?? 0.92, open: false });
  w.openWing(0.3);
  return { w, mount, remove() { w.detach(); mount.removeFromParent(); } };
}

// ------------------------------------------------------------------------------------- damage helpers (caster only)
function hitInfo(k, t, dmg, dir, o) {
  const g = k.game;
  return { amount: dmg * (g.arsenal?.dmgMul ?? 1), part: 'body', point: t.center(new THREE.Vector3()), dir: dir.clone(), knock: o.knock ?? 3, stagger: o.stagger ?? 0.8,
    weapon: k.def.id, shooter: g.localId, skill: k.id, burn: !!o.burn, explosive: !!o.explosive, burnAdd: o.burnAdd ?? 0, elem: o.burn ? k.data.L?.elem : undefined,
    burnFx: k.data.L?.burnFx };
}
/** Flat area damage (no falloff) round c. Returns the targets hit. */
function hurtArea(k, c, r, dmg, o = {}) {
  const g = k.game;
  if (!k.local || !g.targets) return [];
  const out = [];
  for (const t of g.targets.inRadius(c, r)) {
    const dir = t.center(_e).sub(c).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(k.dir.x, 0, k.dir.z);
    dir.normalize();
    const info = hitInfo(k, t, dmg, dir, o);
    k._feedback(info, t.damage(info), t);
    out.push(t);
  }
  return out;
}
/** Damage along a segment (beams, the fire path): targets whose centre lies within halfW (+0.35 body) of a..b. */
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sd = new THREE.Vector3(), _sm = new THREE.Vector3(), _sp = new THREE.Vector3(), _sq = new THREE.Vector3();
function hurtSeg(k, a0, b0, halfW, dmg, o = {}) {
  const g = k.game;
  if (!k.local || !g.targets) return 0;
  const a = _sa.copy(a0), b = _sb.copy(b0);       // callers pass shared temporaries
  const ab = _sd.subVectors(b, a), len = ab.length();
  if (len < 1e-3) return 0;
  ab.multiplyScalar(1 / len);
  const mid = _sm.copy(a).addScaledVector(ab, len / 2);
  const dir = ab.clone();
  let n = 0;
  for (const t of g.targets.inRadius(mid, len / 2 + halfW + 1)) {
    const p = t.center(_sp), u = Math.max(0, Math.min(len, _sq.subVectors(p, a).dot(ab)));
    if (_sq.copy(a).addScaledVector(ab, u).distanceTo(p) > halfW + 0.35) continue;
    const info = hitInfo(k, t, dmg, dir, o);
    k._feedback(info, t.damage(info), t);
    n++;
  }
  return n;
}
/** Damage along a ground polyline (the fire path): each target once, within halfW (+0.35 body) of any segment. */
function hurtPath(k, pts, halfW, dmg, o = {}) {
  const g = k.game;
  if (!k.local || !g.targets || !pts.length) return 0;
  const box = new THREE.Box3().setFromPoints(pts), c = box.getCenter(new THREE.Vector3()), R0 = box.getSize(new THREE.Vector3()).length() / 2 + halfW + 2;
  let n = 0;
  for (const t of g.targets.inRadius(c, R0)) {
    const p = t.center(_sp);
    let best = Infinity, dir = null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)];
      _sd.subVectors(b, a).setY(0); const L2 = _sd.lengthSq();
      const u = L2 > 1e-6 ? Math.max(0, Math.min(1, ((p.x - a.x) * _sd.x + (p.z - a.z) * _sd.z) / L2)) : 0;
      const dx = p.x - (a.x + _sd.x * u), dz = p.z - (a.z + _sd.z * u), dy = p.y - (a.y + 0.9);
      const dd = Math.hypot(dx, dz);
      if (dd < best && Math.abs(dy) < 2) { best = dd; dir = L2 > 1e-6 ? _sd.clone().normalize() : UP; }
    }
    if (best > halfW + 0.35) continue;
    const info = hitInfo(k, t, dmg, dir, o);
    k._feedback(info, t.damage(info), t);
    n++;
  }
  return n;
}
/** Cone (wing beat): within r of c and half-angle `deg` of the horizontal dir. */
function hurtCone(k, c, dir, r, deg, dmg, o = {}) {
  const g = k.game;
  if (!k.local || !g.targets) return 0;
  const cos = Math.cos(deg * D2R);
  let n = 0;
  for (const t of g.targets.inRadius(c, r)) {
    const p = t.center(_e).sub(c).setY(0);
    const l = p.length();
    if (l > 0.8 && p.dot(dir) / l < cos) continue;
    const d2 = l > 1e-4 ? p.multiplyScalar(1 / l) : dir.clone();
    const info = hitInfo(k, t, dmg * Math.max(0.5, 1 - l / r * 0.5), d2, o);
    k._feedback(info, t.damage(info), t);
    n++;
  }
  return n;
}

// ------------------------------------------------------------------------------------- 灼羽 burn stacks
function addBurn(ws, z, n) {
  if (!n || !z || z.alive === false) return;
  const P = ws.def.special.burn || {}, b = ws.sp.burn;
  let e = b.get(z);
  if (!e) { e = { n: 0, until: 0, acc: 0, tick: 0.5, num: 0, numT: 1, lick: 0 }; b.set(z, e); }
  e.n = Math.min(P.max ?? 5, e.n + n);
  e.until = (ws.game?.time ?? 0) + (P.dur ?? 3);
}
function burnTick(ws, g, dt) {
  const s = ws.sp, P = ws.def.special.burn || {}, L = lookOf(ws.def), list = [];
  const per = ws.def.special.meters?.ult?.per || 9000;
  for (const [z, e] of s.burn) {
    if (!z.alive || g.time > e.until) { s.burn.delete(z); continue; }
    e.acc += e.n * (P.dps ?? 8) * dt;
    if ((e.tick -= dt) <= 0) {
      e.tick = 0.5;
      const amount = e.acc * (g.arsenal?.dmgMul ?? 1);
      e.acc = 0;
      const point = z.center(new THREE.Vector3());
      // a DOT tick: no knockback, no blood (burn), the zombie's rim flickers; numbers (merged, 1 s), no hit marker
      const info = { amount, part: 'body', point, dir: UP, knock: 0.01, stagger: 0, weapon: ws.def.id, shooter: g.localId, burn: true, burnFx: L.burnFx, skill: 'bf_dot', elem: L.elem };
      const res = z.damage(info);
      // the 灼羽 rim: thin, stronger with more stacks (0.15 -> 0.3), always under the elite rim (zfx prio)
      g.fx?.zfx?.status?.(z, L.burnFx, 0.9, 0.42 + 0.116 * e.n);
      // DOT feeds 天火 like any damage, except while the ultimate itself runs (v2Hit's rule)
      if (res?.damage > 0 && ![...s.run].some((k) => k.slot === 'ult' && !k.done)) meterAdd(ws, 'ult', res.damage / per * 100, true);
      if (res?.killed) { g.hud?.onHit?.(info, res, z); killFx(ws, g, L, z, point); s.burn.delete(z); continue; }
      e.num += res?.damage || 0;
    }
    // DOT numbers once a second per target (the ticks between are summed)
    if ((e.numT -= dt) <= 0) {
      e.numT = 1;
      if (e.num > 0.5 && g.hud?.settings?.damageNumbers !== false) g.hud?.nums?.add?.(z.center(new THREE.Vector3()), e.num, { elem: L.elem, skin: 'mythic', target: z });
      e.num = 0;
    }
    const near = z.pos.distanceTo(g.camera.position) < 32;
    // the burn's read: rising feather licks off the body (more with more stacks; zfx adds the body flames)
    if (near && (e.lick -= dt) <= 0) { e.lick = 0.3 / e.n + R() * 0.1; featherLick(g, L, _b.set(z.pos.x + (R() - 0.5) * 0.5, z.pos.y + 0.6 + R() * 0.9, z.pos.z + (R() - 0.5) * 0.5), e.n); }
    if (list.length < 12 && near) list.push({ pos: z.center(new THREE.Vector3()).add(_a.set(0, 0.88, 0)), n: e.n, color: L.xh });
  }
  if (list.length || pips) (pips ||= new BurnPips(g)).update(list);
}

/** Kill feedback in the world: KE_PLUME, or the twin's KE_SOUL wisp back to the gun (+2 % 晦羽 when it lands). */
function killFx(ws, g, L, z, point) {
  const p = point || z?.center?.(new THREE.Vector3());
  if (!p) return;
  // the corpse catches fire: a warm rim flash instead of the shared white body flash, the burn rim off
  const zf = g.fx?.zfx;
  if (zf && z) { zf.clearStatus(z, 'kill'); zf.clearStatus(z, L.burnFx); zf.status(z, 'emberkill', 0.3); }
  if (L.id === 'guiche') {
    const tick = soulWisp(g, L, p, (out) => (mine(g, ws) ? g.vm.socketApparent('pearl', out) : null) || out.copy(g.camera.position).add(_a.set(0, -0.3, 0)),
      () => { meterAdd(ws, 'feather', 2); if (mine(g, ws)) { g.vm.glowTo(1.8, 0.05); later(ws, 0.12, () => g.vm?.glowTo(1, 0.3)); } sfx(g, L, 'bifang_soul', 'xh_node', { volume: 0.4, pitch: 0.7 }); });
    ws.sp.wisps.push(tick);
  } else {
    const fy = g.world?.collision?.floorBelow?.(_a.set(p.x, p.y + 0.3, p.z), 0.4, 3);
    killPlume(g, L, p, fy);
  }
}

// ------------------------------------------------------------------------------------- the special (v2 overrides)
registerSpecial('bifang', {
  init(ws) {
    Object.assign(ws.sp, { burn: new Map(), q: [], wisps: [], hitPts: [], shot: 0, view: null, vmw: null, wingK: null, wingsOn: false, idleT: 0, wc: null, wasReady: false,
      shotHit: new Map(), shotKills: 0 });
  },
  // every pellet hit: 灼羽 stack, a small fire feather; no 羽能 while the wings are spread; kills: KE_PLUME / KE_SOUL
  onHit(ws, info, res, target) {
    const g = ws.game, s = ws.sp, L = lookOf(ws.def), z = target?.zombie || target;
    if (!g || !res || info.skill === 'bf_dot' || info.skill === 'crisis') return;
    if (s.wingsOn) meterAdd(ws, 'feather', -(ws.def.special.meters?.feather?.onHit ?? 0.6), true);
    const stacks = info.skill ? info.burnAdd || 0 : 1;
    if (z && !res.killed) addBurn(ws, z, stacks);
    if (!info.skill && info.point) {
      if (s.hitPts.length < 8) s.hitPts.push(info.point.clone());
      emberHit(g, L, info.point, info.dir);
      // per-shot tally for the weight of the shot (onFire): pellets per target, kills; one rising feather a target
      if (z) { const e = s.shotHit.get(z); if (e) e.n++; else { s.shotHit.set(z, { n: 1, p: info.point.clone() }); plume(g, L, info.point, 'bfp' + g.localId); } }
      if (res.killed) s.shotKills++;
    }
    if (res.killed) killFx(ws, g, L, z, info.point);
  },
  onFire(ws, ctx) {
    const g = ctx.game, s = ws.sp, L = lookOf(ws.def), vm = g.vm;
    s.shot++;
    const own = mine(g, ws);
    if (own) { crestFan(g, L, s.shot, 1); s.beakKick = 1; }
    // theme layer over the gun (§1.12: bell overtone + flame breath + luxury transient, ~12 dB under the shot)
    sfx(g, L, 'bifang_fire', 'fire_burst', { volume: g.audio?.has?.('bifang_fire') ? 0.25 : 0.16 });
    // a cannon, not a rifle: the weight goes into the view punch (a pitch kick that springs back, a roll), not into
    // aim drift (recoil.up stays low and recovers between shots)
    if (own) g.punch?.impulse(-0.2 - R() * 0.05, (R() - 0.5) * 0.04, (R() - 0.5) * 0.12);
    // weight of the shot: 4+ pellets in one body stops time for a beat; a kill longer; 2+ kills longest + a bell
    let most = 0;
    for (const e of s.shotHit.values()) most = Math.max(most, e.n);
    const kills = s.shotKills;
    // one sizzle (+ a bell tick) per target hit this volley (the closest three)
    const tg = [...s.shotHit.values()].sort((a, b) => b.n - a.n).slice(0, 3);
    tg.forEach((e, i) => sfx(g, L, 'bifang_sizzle', 'impact_flesh', { pos: e.p, volume: 0.55 + 0.06 * Math.min(5, e.n), delay: i * 0.02 }));
    s.shotHit.clear(); s.shotKills = 0;
    if (kills >= 2) {
      g.arsenal?._clipEvent?.('hitstop', 60);
      g.arsenal?._clipEvent?.('shake', 0.2 + 0.04 * Math.min(3, kills - 2));
      sfx(g, L, 'bifang_kill', 'kill_confirm_thud', { volume: 0.75 });
      sfx(g, L, 'bifang_bell', 'magIn', { volume: 0.6, delay: 0.05 });
      if (own) { g.vm.glowTo(2, 0.04); later(ws, 0.1, () => g.vm?.glowTo(1, 0.3)); }
    } else if (kills === 1 || most >= 4) {
      g.arsenal?._clipEvent?.('hitstop', kills ? 40 : 30);
      g.arsenal?._clipEvent?.('shake', 0.12);
      if (kills) { sfx(g, L, 'bifang_kill', 'kill_confirm_thud', { volume: 0.6 }); if (own) { g.vm.glowTo(1.7, 0.04); later(ws, 0.08, () => g.vm?.glowTo(1, 0.25)); } }
      else sfx(g, L, 'bifang_hit_heavy', 'melee_heavy_hit', { volume: 0.45 });
    }
    // feather ribbons: 4 a volley, to the pellets that hit (their real points), else rays inside the cone
    const from = vm?.socketApparent?.('muzzle', new THREE.Vector3()) || ctx.origin.clone();
    const hits = s.hitPts.splice(0);
    const spread = (g.arsenal?.spreadDeg?.() ?? 4) * D2R;
    _b.set(1, 0, 0).applyQuaternion(g.camera.quaternion); _c.set(0, 1, 0).applyQuaternion(g.camera.quaternion);
    for (let i = 0; i < 4; i++) {
      let end = hits[i * 2] || hits[i];
      if (!end) {
        const r = Math.sqrt(R()) * spread, a = R() * Math.PI * 2;
        const d = _d.copy(ctx.dir).addScaledVector(_b, Math.cos(a) * Math.tan(r)).addScaledVector(_c, Math.sin(a) * Math.tan(r)).normalize();
        const hit = g.world?.collision?.raycast(ctx.origin, d, 36);
        end = ctx.origin.clone().addScaledVector(d, hit ? hit.dist : 36);
      }
      featherTracer(g, L, from, end, i < 2 && s.shot % 2 === 0, 'bf' + g.localId);
    }
  },
  update(ws, dt, g) {
    const s = ws.sp;
    if (!mine(g, ws)) return;
    view(ws, g, dt);
    // ◎ again folds the wings (the press is ours: the arsenal must not start another cast from it)
    const inp = g.input?.state, wk = s.wingK && !s.wingK.done ? s.wingK : null;
    if (wk && inp?.pressed?.alt) { inp.pressed.alt = false; endSkill(wk); }
  },
  tick(ws, dt, g) {
    const s = ws.sp, q = s.q;
    for (let i = q.length - 1; i >= 0; i--) if ((q[i][0] -= dt) <= 0) { const f = q[i][1]; q.splice(i, 1); f(); }
    for (let i = s.wisps.length - 1; i >= 0; i--) if (!s.wisps[i](dt)) s.wisps.splice(i, 1);
    burnTick(ws, g, dt);
    // idle hum (§1.12) only while held
    if (s.hum && g.arsenal?.current !== ws) { s.hum.stop?.(0.2); s.hum = null; }
    // ready edge: a twin without a ready sample of its own -> the original's -4 st + echo (§1.12)
    const ready = canCast(ws, 'ult').ok, held = g.arsenal?.current === ws, L = lookOf(ws.def);
    if (ready && !s.wasReady && held) {
      const cue = ws.def.premium?.ready?.sfx;
      if (cue && g.audio?.has && !g.audio.has(cue)) sfx(g, L, 'ready_bifang', 'killmark_ding', { volume: 0.8, pitch: 0.75 });
      if (mine(g, ws)) { g.vm.setPart('fx_wingRoot*', READY_OPEN, 0.3, 0.05); g.vm.glowTo(2.2, 0.08); later(ws, 0.15, () => g.vm?.glowTo(1, 0.4)); tipGlint(g, L, 10); vmFeathers(g, ws, L, 2); }
    }
    s.wasReady = ready;
  },
  dispose(ws, g) { dropWings(ws.sp); worldInspect(ws, g, 0, true); pips?.update([]); ws.sp.hum?.stop?.(0.1); ws.sp.hum = null; },
  /** Clip events: ['bf', { wing: 'open' | 'close', style, count, scale, dur } | { sparkle } | { feathers } | { orbit } | { puff } | { vein } | { cry } | { mini }] */
  onClipEvent(ws, name, arg, g) {
    if (name !== 'bf' || !arg) return;
    const s = ws.sp, L = lookOf(ws.def);
    if (arg.wing === 'open') vmWings(g, ws, arg);
    else if (arg.wing === 'close') dropWings(s, arg.dur ?? 0.25, g.time);
    if (arg.sparkle) vmSparkle(ws, arg.sparkle);
    if (arg.glint) tipGlint(g, L, arg.glint);
    if (arg.feathers) vmFeathers(g, ws, L, arg.feathers);
    if (arg.orbit) s.orbit = { t: 0, dur: arg.orbit };
    if (arg.puff) magPuff(g);
    if (arg.vein) { veinTongue(g, L, 'r', L.root, 0.35, true); veinTongue(g, L, 'l', L.root, 0.35, true); }
    if (arg.cry) sfx(g, L, 'bifang_crane_cry', null, { volume: arg.cry });
    if (arg.bell) sfx(g, L, 'bifang_bell', 'magIn', { volume: arg.bell });
    // the weapon's own foley (draw, feathers, gate, feather cell, inspect phrase): through sfx(), so 鬼車 hears it
    // -4 st with the echo like every other cue; fb = the stock foley when the bank is missing
    if (arg.snd) sfx(g, L, arg.snd, arg.fb ?? null, { volume: arg.vol ?? 0.9 });
    if (arg.mini) miniCrane(g, ws, L, arg.mini);
  },
});

// ------------------------------------------------------------------------------------- viewmodel driver
function view(ws, g, dt) {
  const s = ws.sp, vm = g.vm, w = vm.weapon, L = lookOf(ws.def), ar = g.arsenal;
  const v = s.view || (s.view = { w: null, t: 0, ember: 0.5, shim: 0 });
  if (v.w !== w) {
    v.w = w; v.t = 0; s.beakKick = 0; s.idleT = 0;
    dropWings(s);
    for (const n of ['fx_wingRootL', 'fx_wingRootR']) { const st = ps(vm, n); st.tw = null; st.v = 0; }
    prewarm(g, L);
  }
  v.t += dt;
  // 待機嗡鳴 (§1.12): an F2 hum, a band of noise swept at 0.2 Hz, faint flame breathing; ~26 dB under the shot,
  // 0.4 s fade-in, stopped in tick() when the gun is put away
  if (!s.hum && g.audio?.has?.('bifang_idle')) s.hum = sfx(g, L, 'bifang_idle', null, { loop: true, volume: 0.2, fadeIn: 0.4 });
  if (s.vmw && (s.vmw.gun !== w || s.vmw.closeAt > 0 && g.time >= s.vmw.closeAt)) dropWings(s);
  const cs = chargeState(ws, g) || {};
  const casting = !!(s.wingK && !s.wingK.done) || [...(s.run || [])].some((k) => !k.done && k.id === 'bifang_descent');
  // wing roots: a ±1° breath at rest; ready (天火 full, 蓄滿必須有變形 §1.17): held open ~25° with a fine quiver,
  // the pearl shimmering with heat; spread by the skills (setPart tweens)
  for (const n of ['fx_wingRootL', 'fx_wingRootR']) {
    const st = ps(vm, n);
    if (st.tw || casting) continue;
    const R2 = n.endsWith('R') ? 0.9 : 0;
    const want = cs.ready ? READY_OPEN + 0.012 * Math.sin(v.t * 31 + R2 * 3) + 0.008 * Math.sin(v.t * 47 + R2) : 0.014 + 0.014 * Math.sin(v.t * 2.24 + R2);
    st.v += (want - st.v) * Math.min(1, dt * (cs.ready ? 14 : 6));
  }
  if (cs.ready && !casting && (v.shim -= dt) <= 0) { v.shim = 0.09; pearlShimmer(g, L); }
  // lower jaw: 4° per shot, eased back
  s.beakKick = Math.max(0, (s.beakKick || 0) - dt * 9);
  const jb = ps(vm, 'fx_beak');
  if (!jb.tw) jb.v = 0.34 * s.beakKick * s.beakKick;
  // focus: the pearl spins faster when ready / casting
  vm.setSpin('fx_pearl', casting ? 7 : cs.ready ? 3 : 1);
  // 流動粒子: a few embers drift along the feather vein (idle only, ≤ 6 alive)
  if (ar.sinceShot > 0.6 && (v.ember -= dt) <= 0) { v.ember = 0.38 + R() * 0.25; veinEmber(g, L); }
  // rare idle every 12 s of quiet: the wing roots shake off two light feathers
  if (ar.state === 'idle' && !vm.clip.active && ar.sinceShot > 2 && !casting) { if ((s.idleT += dt) >= 12) { s.idleT = 0; gunClip(g, ws, 'bifang_idle_rare'); } } else s.idleT = 0;
  // a light feather orbiting the hand (inspect, §1.17 parts leaving the gun)
  if (s.orbit) orbitFeather(g, ws, L, dt);
  worldInspect(ws, g, dt);
}

/**
 * First equip of a look (once a game): everything the first ultimate would build on the spot -- the sigil design
 * (~90 ms of canvas work), the spirit geometry, a hidden sigil / pillar / spirit + its wing cards drawn for a few
 * frames far under the map (GPU uploads) -- happens now, under the draw animation, not at beat ②.
 */
function prewarm(g, L) {
  const fx = g.fx;
  if (!fx || (g._bfWarm ||= new Set()).has(L.id)) return;
  g._bfWarm.add(L.id);
  try {
    fx.sigils?.preload?.([L.sigil]);
    const geo = L.id === 'guiche' ? nineHeadGeo() : craneGeo();
    const far = g.camera.position.clone().add(_b.set(0, -80, 0));
    fx.sigils?.sigil?.(far, { design: L.sigil, radius: 0.01, intensity: 0, life: 0.2, color: L.sigilCol, color1: L.sigilCol1 });
    fx.sigils?.pillar?.(far, { radius: 0.01, height: 0.01, life: 0.2, motes: 0, ring: false, light: 0 });
    const gh = fx.summons?.ghost?.({ geometry: geo, pos: far, size: 0.01, big: false, life: 0.2, appear: 0.01, motion: 'none', ...L.ghost });
    const sw = gh && spiritWings(g, gh, L);
    if (sw) later2(g, 0.3, () => sw.remove());
  } catch (e) { console.warn('[bifang] prewarm', e); }
}

/** 改變世界的檢視 (§1.7.1 beat 11): own screen only, ambient x0.6 (exposure), fog +30 %, rim x1.5 (premium state), 2.5 s. */
function worldInspect(ws, g, dt, stop = false) {
  const s = ws.sp, post = g.renderer?.post, fog = g.scene?.fog;
  const on = !stop && !!g.arsenal?._inspecting && g.arsenal.current === ws;
  if (on && !s.wc) s.wc = { t: 0, exp: post?.exposure ?? 1, fog: fog?.density ?? 0 };
  const wc = s.wc;
  if (!wc) return;
  wc.t += dt;
  if (!on && wc.t < 2.15) wc.t = 2.15;                 // fire / ADS / swap: fade back now
  const e = smooth(wc.t / 0.35) * (1 - smooth((wc.t - 2.15) / 0.35));
  if (post) post.exposure = wc.exp * (1 - 0.3 * e);
  if (fog && wc.fog) fog.density = wc.fog * (1 + 0.3 * e);
  if (stop || wc.t >= 2.5) { if (post) post.exposure = wc.exp; if (fog && wc.fog) fog.density = wc.fog; if (!on || stop) s.wc = null; else wc.t = 2.5; }
}

function vmSparkle(ws, n) { for (const w of ws.sp.vmw?.list || []) w.sparkle(Math.ceil(n / 2)); }
const READY_OPEN = 0.36;                                     // ready: the bones held ~25° open (of the 69° spread)
const CHARGED_OPEN = 1.13;                                   // 焚翼 charged (fold now = 焚天光): ~78°
/** Light-feather sparkle off both bone tips (viewmodel layer): glints + a soft bloom. */
function tipGlint(g, L, n = 8) {
  const vm = g.vm, P = g.fx?.particles;
  if (!P || !vm?.weapon) return;
  for (const side of ['L', 'R']) {
    const node = vm.weapon.parts['fx_wingRoot' + side]?.node;
    if (!node) continue;
    node.updateMatrixWorld();
    _a.set(0, 0.012, 0.16).applyMatrix4(node.matrixWorld).applyMatrix4(g.camera.matrixWorldInverse);
    P.spawn({ additive: true, vm: true, x: _a.x, y: _a.y, z: _a.z, life: 0.3, size: 0.03, size1: 0.05, color: [L.root[0] * 0.5, L.root[1] * 0.5, L.root[2] * 0.5, 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
    for (let i = 0; i < n / 2; i++) P.spawn({ additive: true, vm: true, x: _a.x + (R() - 0.5) * 0.03, y: _a.y + (R() - 0.5) * 0.02, z: _a.z + (R() - 0.5) * 0.04, vx: (R() - 0.5) * 0.06, vy: 0.02 + R() * 0.05, vz: (R() - 0.5) * 0.05,
      life: 0.45 + R() * 0.4, size: 0.004 + R() * 0.004, color: [L.mote2[0] * 0.7, L.mote2[1] * 0.7, L.mote2[2] * 0.7, 1], color1: [L.mote[0] * 0.3, L.mote[1] * 0.3, L.mote[2] * 0.3, 0], frame: FRAME.glint, gravity: 0.04, inertia: 0.4 });
  }
}
/** Ready: heat shimmer rising off the focus (faint wavering wisps; 鬼車: cold violet). */
function pearlShimmer(g, L) {
  const vm = g.vm, P = g.fx?.particles, c = vm?.socketCam?.('pearl', _a);
  if (!P || !c) return;
  P.spawn({ additive: true, vm: true, x: c.x + (R() - 0.5) * 0.01, y: c.y + 0.008, z: c.z + (R() - 0.5) * 0.01, vx: (R() - 0.5) * 0.01, vy: 0.05 + R() * 0.03, life: 0.6 + R() * 0.3, mode: 'align', dir: [0, 1, 0], aspect: 3, anchor: 0.3,
    size: 0.008, size1: 0.014, rot: (R() - 0.5) * 0.6, color: [L.flame[0] * 0.09, L.flame[1] * 0.09, L.flame[2] * 0.09, 1], color1: [0, 0, 0, 0], fadeIn: 0.2, frame: FRAME.wisp, inertia: 0.5 });
  if (R() < 0.3) P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vy: 0.03, life: 0.5, size: 0.002, color: [...L.ember, 1], color1: [0, 0, 0, 0], frame: FRAME.glow, inertia: 0.5 });
}
/** Light feathers drifting down from the bone tips (viewmodel layer). */
function vmFeathers(g, ws, L, n = 2) {
  const vm = g.vm, P = g.fx?.particles;
  if (!P || !vm?.weapon) return;
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 'L' : 'R', node = vm.weapon.parts['fx_wingRoot' + side]?.node;
    if (!node) continue;
    // a point near the bone tip in camera space
    node.updateMatrixWorld();
    _a.set(0, 0.01, 0.13).applyMatrix4(node.matrixWorld).applyMatrix4(g.camera.matrixWorldInverse);
    P.spawn({ additive: true, vm: true, x: _a.x, y: _a.y, z: _a.z, vx: (R() - 0.5) * 0.05, vy: -0.04, vz: (R() - 0.5) * 0.04, life: 1.2 + R() * 0.4, mode: 'align', dir: [0.3, 1, 0], aspect: 3.2, anchor: 0.5,
      size: 0.007, size1: 0.005, rot: (R() - 0.5) * 2, spin: (R() - 0.5) * 3, color: [L.mote[0] * 0.6, L.mote[1] * 0.6, L.mote[2] * 0.6, 1], color1: [L.flame[0] * 0.2, L.flame[1] * 0.2, L.flame[2] * 0.2, 0],
      frame: FRAME.cone + 1, gravity: 0.03, drag: 2.5, inertia: 0.6 });
  }
}
/** Smoke off the spent feather cell (reload). */
function magPuff(g) {
  const vm = g.vm, P = g.fx?.particles, c = vm?.socketCam?.('magwell', _a);
  if (!P || !c) return;
  for (let i = 0; i < 6; i++) P.spawn({ vm: true, x: c.x + (R() - 0.5) * 0.02, y: c.y - 0.02, z: c.z, vx: (R() - 0.5) * 0.06, vy: 0.06 + R() * 0.05, vz: (R() - 0.5) * 0.04, life: 0.8 + R() * 0.4,
    size: 0.012, size1: 0.06, sizePow: 0.5, color: [0.85, 0.86, 0.88, 0.4], color1: [0.8, 0.8, 0.82, 0], frame: FRAME.smoke + ((R() * 2) | 0), drag: 2, spin: (R() - 0.5) * 2, inertia: 0.5 });
}
/** One light feather leaves the right wing, circles the left hand for the clip-given time, clicks back. */
function orbitFeather(g, ws, L, dt) {
  const o = ws.sp.orbit, vm = g.vm, P = g.fx?.particles;
  o.t += dt;
  if (o.t >= o.dur || !P) { ws.sp.orbit = null; sfx(g, L, 'bifang_click', 'ui_click', { volume: 0.5 }); vmSparkle(ws, 4); return; }
  const u = o.t / o.dur, a = u * Math.PI * 4;
  // centre ~ the left hand in camera space, ellipse in the screen-lower half (never through the centre 20 %)
  const cx = -0.07 + Math.sin(u * Math.PI) * 0.02, cy = -0.13, cz = -0.32;
  const rr = 0.05 * Math.sin(Math.min(1, u * 3) * Math.PI / 2) * (1 - smooth((u - 0.85) / 0.15));
  const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.45, z = cz + Math.sin(a) * rr * 0.6;
  P.spawn({ additive: true, vm: true, x, y, z, life: 0.05, mode: 'align', dir: [-Math.sin(a), Math.cos(a) * 0.45, Math.cos(a) * 0.6], aspect: 3.4, anchor: 0.5, size: 0.006,
    color: [...L.root, 1], color1: [...L.flame, 0], frame: FRAME.cone + 1 });
  P.spawn({ additive: true, vm: true, x, y, z, life: 0.32, size: 0.004, size1: 0.001, color: [L.flame[0] * 0.5, L.flame[1] * 0.5, L.flame[2] * 0.5, 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
}
/** Rare inspect: a fire feather in the palm burns into a 6 cm one-legged crane that stands 1 s, then ash. */
function miniCrane(g, ws, L, dur = 1) {
  const kit = g.fx?.summons, vm = g.vm;
  if (!kit || !vm) return;
  const at = () => {
    // the left free 'palm' anchor (camera space) mapped to where it appears in the world (viewmodel FOV)
    _a.set(-0.085, -0.095, -0.34);
    const vp = vm.vmCam.projectionMatrix.elements, wp = g.camera.projectionMatrix.elements;
    _a.x *= vp[0] / wp[0]; _a.y *= vp[5] / wp[5];
    return _a.applyMatrix4(g.camera.matrixWorld);
  };
  const h = kit.ghost({ geometry: L.id === 'guiche' ? nineHeadGeo() : craneGeo(), pos: at().clone(), size: 0.075, yaw: (g.player?.yaw ?? 0) + 2.4, ...L.ghost, appear: 0.3, life: Infinity, motion: 'none', flap: { amp: 0.25, hz: 1.5 }, big: false,
    exit: { kind: 'ember', count: 8, color: L.ember, speed: 0.4, scale: 0.15 } });
  let t = 0;
  ws.sp.wisps.push((dt) => {
    t += dt;
    if (!h.alive) return false;
    h.obj.position.copy(at()); h.obj.position.y += 0.075 * 0.62;
    if (t >= dur && h.outT < 0) h.dissolveOut(0.35);
    return true;
  });
}

// ------------------------------------------------------------------------------------- skills
/** Status of the local player while the wings are spread: slows cleared and ignored, +10 % speed (slowMul doubles as
 *  the speed multiplier Game reads every frame); PlayerStatus.applySlow is wrapped once. */
function wingStatus(g, mul) {
  const st = g.status;
  if (!st) return;
  if (!st._bfWrap) {
    st._bfWrap = true;
    const orig = st.applySlow.bind(st);
    st.applySlow = (time, m) => { if (g._bfImmune > g.time) return; orig(time, m); };
  }
  if (mul > 0) { g._bfImmune = g.time + 0.2; st.slowT = 0; st.slowMul = mul; }
  else if (st.slowT <= 0) st.slowMul = 1;
}
/** 解縛 (team aura): a teammate within r of the spread wings loses its slows (each player at most every 6 s). */
function cleanseNear(k, r, every) {
  const g = k.game, st = g.status, me = g.player?.pos;
  if (!st || !me || !(st.slowT > 0)) return;
  if (me.distanceTo(k.feet(_a)) > r || g.time - (g._bfCleanseAt ?? -99) < every) return;
  g._bfCleanseAt = g.time;
  st.slowT = 0; st.slowMul = 1;
  g.fx?.shockwave(_b.set(me.x, me.y + 0.06, me.z), { normal: UP, r0: 0.2, r1: 1.4, life: 0.4, color: k.data.L.ring });
}
function feetRing(k, r, n = 3) {
  const g = k.game, P = g.fx?.particles, c = k.feet(_a), L = k.data.L;
  if (!P) return;
  for (let i = 0; i < n; i++) {
    const a = k.rng() * Math.PI * 2, rr = r * (0.75 + k.rng() * 0.25);
    P.spawn({ additive: true, x: c.x + Math.cos(a) * rr, y: c.y, z: c.z + Math.sin(a) * rr, vy: 0.4, life: 0.35 + k.rng() * 0.2, size: 0.32, size1: 0.42, color: [1, 1, 1, 0.75], color1: [1, 1, 1, 0], colorPow: 1.4,
      frame: FRAME.flick[(k.rng() * 4) | 0], ramp: L.flameRamp, heat: 1, heat1: 0.3, mode: 'align', dir: [0, 1, 0], aspect: 1.1, anchor: 0.32, ground: c.y, soft: 0.1 });
  }
}

// ◎ 焚翼 / 晦翼 ------------------------------------------------------------------------------------------------
registerSkill('pyrewing', {
  level: 'L2', defaults: { dur: 6, r: 3, dps: 40, drain: 10, speedMul: 1.1, beamMin: 40, cost: 40 },
  start(k) {
    const g = k.game, d = k.data, L = d.L = lookOf(k.def);
    d.tick = 0; d.spent = 0; d.ring = 0; d.spark = 0.3;
    sfx(g, L, 'bifang_wing_open', 'fire_burst', k.local ? { volume: 0.8 } : { pos: k.feet(_a), volume: 0.8 });
    g.fx?.shockwave(k.feet(_a).setY(_a.y + 0.06), { normal: UP, r0: 0.3, r1: k.p.r, life: 0.45, color: L.ring });
    if (!k.local) { d.back = backWings(g, k.by, L); return; }
    const ws = k.ws, s = ws.sp;
    meterAdd(ws, 'feather', k.p.cost, true);         // 40 % is the threshold: the wings burn 10 %/s instead
    s.wingK = k; s.wingsOn = true;
    if (mine(g, ws)) {
      g.vm.setPart('fx_wingRoot*', 1, 0.25, 0.02);
      vmWings(g, ws, { style: 'cloisonne', count: 7, scale: 0.8, dur: 0.25 });
      later(ws, 0.06, () => vmSparkle(ws, 12));
      gunClip(g, ws, 'bifang_wing_buck');
      sfx(g, L, 'bifang_crane_cry', null, { volume: 0.6 });
    }
    g.arsenal?.fovKick?.(2, 0.5);
    g.arsenal?._clipEvent?.('haptic', 'thud');
    g.hud?.border?.(hexOf(L.root), 0.15, k.p.dur);
    wingStatus(g, k.p.speedMul);
    d.loop = sfx(g, L, 'bifang_wing_loop', null, { loop: true, volume: 0.45 });
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p;
    if ((d.ring -= dt) <= 0) { d.ring = 0.12; feetRing(k, p.r, k.local ? 2 : 1); }
    if (!k.local) { cleanseNear(k, k.def.special.cleanse?.r ?? 4, k.def.special.cleanse?.every ?? 6); return; }
    const m = k.ws.sp.m, dr = Math.min(m.feather, p.drain * dt);
    m.feather -= dr; d.spent += dr;
    wingStatus(g, p.speedMul);
    if ((d.tick -= dt) <= 0) { d.tick = 0.25; hurtArea(k, k.feet(_a), p.r, p.dps * 0.25, { burn: true, knock: 0.8, stagger: 0.2 }); }
    if ((d.spark -= dt) <= 0) { d.spark = 0.35; vmSparkle(k.ws, 2); }
    // 蓄滿必須有變形 (§1.17): the moment folding would fire the beam, the bones flick wide, the fans flare and stay
    // brighter, a bell, a stronger border: "release now"
    if (!d.charged && d.spent >= p.beamMin - 1e-3) {
      d.charged = true;
      const ws = k.ws, L = d.L;
      sfx(g, L, 'bifang_beam_ready', 'xh_node', { volume: 0.8 });
      g.hud?.border?.(hexOf(L.root), 0.26, Math.max(0.5, p.dur - k.t));
      g.arsenal?._clipEvent?.('haptic', 'tick');
      if (mine(g, ws)) {
        // the bones flick well past the spread (~90°) and hold wider (~78°); the fan tips turn white-hot
        g.vm.setPart('fx_wingRoot*', 1.3, 0.07, 0); later(ws, 0.1, () => g.vm?.setPart('fx_wingRoot*', CHARGED_OPEN, 0.25, 0));
        for (const w of ws.sp.vmw?.list || []) w.set({ tip: L.wing.hot, gold: L.wing.hot, tipMix: 1 });
        vmSparkle(ws, 24); g.vm.glowTo(2.4, 0.05); later(ws, 0.12, () => g.vm?.glowTo(1.45, 0.3));
      }
    }
    // charged: the white-hot fan edges pulse (2.5 Hz) until the release
    if (d.charged && mine(g, k.ws)) { const pz = 1.25 + 0.45 * Math.sin(k.t * Math.PI * 5); for (const w of k.ws.sp.vmw?.list || []) w.set({ glow: pz }); }
    if (m.feather <= 0.01) return false;
  },
  end(k) {
    const g = k.game, d = k.data, L = d.L;
    d.loop?.stop?.(0.2);
    if (!k.local) { if (d.back) { d.back.w.close(0.25); later2(g, 0.4, () => d.back.remove()); } return; }
    const ws = k.ws, s = ws.sp;
    s.wingK = null; s.wingsOn = false;
    wingStatus(g, 0);
    g.hud?.border?.(hexOf(L.root), 0, 0.01);
    sfx(g, L, 'bifang_wing_close', 'swingHeavy', { volume: 0.7 });
    // the fans fold away first (fast, up out of the view), then the bones swing back: the fans never sweep
    // through the middle of the screen
    if (mine(g, ws)) { dropWings(s, 0.09, g.time); later(ws, 0.12, () => g.vm?.setPart('fx_wingRoot*', 0, 0.26)); }
    // teammates' copies end with ours (a ph 1 event: replays look it up by caster + seed)
    g.net?.sendSkill?.({ ...k.ev, ph: 1 });
    if (d.spent >= k.p.beamMin - 1e-3) castBeam(k);
  },
});
/** Short world timers for replays (no weapon state on the receiving side). */
function later2(g, sec, fn) { let t = 0; const sys = { update: (dt) => { if ((t += dt) >= sec) { g.systems.splice(g.systems.indexOf(sys), 1); fn(); } } }; g.systems.push(sys); }

function castBeam(k) {
  const g = k.game, cam = g.camera;
  cam.getWorldDirection(_d);
  const ev = { type: 'skill', id: 'pyrewing_beam', w: k.def.id, slot: 'alt', seed: (Math.random() * 2147483647) | 0,
    pos: [cam.position.x, cam.position.y, cam.position.z], dir: [_d.x, _d.y, _d.z], by: g.localId, ph: 0 };
  const b = startSkill(g, ev, { ws: k.ws, local: true });
  if (b) g.net?.sendSkill?.(ev);
}

/** Rings snapping open along a beam, racing from a to b (~90 m/s): reads as a shaft of light even end-on. */
function beamRings(g, L, a, b, t = 0, k = 1) {
  const fx = g.fx, len = a.distanceTo(b), dir = _d.subVectors(b, a).normalize().clone();
  // flat particles are one-sided: each ring faces the viewer
  if (dir.dot(_e.subVectors(g.camera.position, a)) < 0) dir.negate();
  for (let s = 1.5, i = 0; s < len; s += 2.6, i++) {
    const p = a.clone().addScaledVector(_c.subVectors(b, a).normalize(), s);
    later2(g, s / 90, () => fx?.shockwave?.(p, { normal: dir, r0: 0.25 * k, r1: (1.5 + (i % 2) * 0.4) * k, life: 0.32, color: [L.ring[0] * k, L.ring[1] * k, L.ring[2] * k], thin: true }));
  }
}
/** Light feathers spiralling down the beam (a double helix at ~0.6 m), streaking forward. */
function beamHelix(g, L, a, b, rng, n) {
  const P = g.fx?.particles;
  if (!P) return;
  const dir = _d.subVectors(b, a), len = dir.length();
  dir.multiplyScalar(1 / len);
  const side = _e.set(-dir.z, 0, dir.x).normalize(), up = _c.crossVectors(side, dir).normalize();
  for (let i = 0; i < n; i++) {
    const s = rng() * len, a0 = s * 0.9 + (i % 2) * Math.PI, r = 0.45 + rng() * 0.3;
    const ox = Math.cos(a0) * r, oy = Math.sin(a0) * r;
    const x = a.x + dir.x * s + side.x * ox + up.x * oy, y = a.y + dir.y * s + side.y * ox + up.y * oy, z = a.z + dir.z * s + side.z * ox + up.z * oy;
    const v = 10 + rng() * 8, tv = 3;
    P.spawn({ additive: true, x, y, z, vx: dir.x * v + (-Math.sin(a0) * side.x + Math.cos(a0) * up.x) * tv, vy: dir.y * v + (-Math.sin(a0) * side.y + Math.cos(a0) * up.y) * tv,
      vz: dir.z * v + (-Math.sin(a0) * side.z + Math.cos(a0) * up.z) * tv, life: 0.35 + rng() * 0.3, mode: 'align', dir: [dir.x, dir.y, dir.z], aspect: 3.6, anchor: 0.5,
      size: 0.16, size1: 0.08, color: [L.mote2[0] * 0.8, L.mote2[1] * 0.8, L.mote2[2] * 0.8, 1], color1: [L.flame[0] * 0.3, L.flame[1] * 0.3, L.flame[2] * 0.3, 0], frame: FRAME.cone + 1, drag: 1.5 });
  }
}
/** First person: the beak flares white as the beam leaves (a hot bloom + the crest fan twice over). */
function beamFlare(g, L) {
  const vm = g.vm, P = g.fx?.particles, b = vm?.socketCam?.('beak', _a);
  if (!P || !b) return;
  P.spawn({ additive: true, vm: true, x: b.x, y: b.y, z: b.z, life: 0.09, size: 0.3, size1: 0.45, color: [8, 7, 5.5, 1], color1: [L.flame[0] * 0.5, L.flame[1] * 0.5, L.flame[2] * 0.5, 0], frame: FRAME.glow });
  P.spawn({ additive: true, vm: true, x: b.x, y: b.y, z: b.z, life: 0.5, size: 0.4, size1: 0.7, color: [L.root[0] * 0.25, L.root[1] * 0.25, L.root[2] * 0.25, 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  crestFan(g, L, 0); crestFan(g, L, 1);
}

// 焚天光 / 晦天墜 ---------------------------------------------------------------------------------------------
registerSkill('pyrewing_beam', {
  level: 'L2',
  start(k) {
    const g = k.game, fx = g.fx, d = k.data, L = d.L = lookOf(k.def), B = k.def.special.beam || {};
    const dur = B.dur ?? 1.2;
    k.dur = dur + 0.9;                                  // + the floor fire burning out
    const eye = k.pos.clone(), dir = k.dir.clone();
    const hit = g.world?.collision?.raycast(eye, dir, B.len ?? 30);
    const len = hit ? hit.dist : B.len ?? 30;
    d.a = eye; d.b = eye.clone().addScaledVector(dir, len); d.tick = 0.2; d.half = (B.width ?? 1.4) / 2;
    const near = eye.clone().addScaledVector(dir, Math.min(2.5, len));
    // first person the shaft leaves the beak (lower right) and fattens with distance: never a disc over the crosshair
    const m = k.local && mine(g, k.ws) ? g.vm.socketApparent('muzzle', new THREE.Vector3()) : k.muzzle(new THREE.Vector3());
    const floorY = (p) => g.world?.collision?.floorBelow?.(_a.set(p.x, p.y + 0.3, p.z), 0.6, 4);
    const fy = floorY(d.b);
    d.end = Number.isFinite(fy) && d.b.y - fy < 2.5 ? new THREE.Vector3(d.b.x, fy, d.b.z) : d.b.clone();
    if (L.id === 'guiche') {
      // 晦天墜: a ghost-fire meteor falling slantwise out of the sky onto the line's end: a violet-cored head with a
      // cold-teal edge dragging smoke and wisps, a crater where it strikes; the ground seam burns violet
      // it strikes the line ~14 m out (the shaft burns on to its end): coming down from over the caster's shoulder it
      // crosses the whole view, top to the strike, instead of landing as a speck 30 m away
      const strike = eye.clone().addScaledVector(dir, Math.min(len, 14)), sy = floorY(strike);
      if (Number.isFinite(sy) && strike.y - sy < 3) strike.y = sy;
      d.mEnd = strike;
      const sky = d.sky = eye.clone().addScaledVector(dir, 1.5).add(_a.set(-dir.z * 5, 16, dir.x * 5));
      d.meteor = { from: sky, to: strike.clone(), t: 0, fall: 0.42, hitDone: false, trail: fx?.trail?.({ width: 2.4, life: 0.55, color: [L.beamCore[0] * 0.7, L.beamCore[1] * 0.7, L.beamCore[2] * 0.7, 1], color1: [L.teal[0] * 0.15, L.teal[1] * 0.15, L.teal[2] * 0.15, 0], taper: 0.1, segs: 24 }) };
      d.beams = [fx?.beam?.(m, d.b.clone(), { core: L.flame, glow: L.beamGlow, wCore: 0.12, wGlow: 1.6, life: dur, shrink: 0.6, scroll: -3, pattern: 'feather', wStart: 0.12, ramp: 8 })];
    } else {
      // 焚天光: a fat soft shaft (3.6 m glow, feather-vein barbs scrolling down it), white core / gold sheath
      d.beams = [fx?.beam?.(m, d.b.clone(), { core: L.beamCore, glow: L.beamGlow, wCore: 0.5, wGlow: 1.7, life: dur, shrink: 0.55, scroll: 2.2, pattern: 'feather', wStart: 0.08, ramp: 9 }),
        fx?.beam?.(m, d.b.clone(), { core: [L.beamGlow[0] * 0.85, L.beamGlow[1] * 0.85, L.beamGlow[2] * 0.85], glow: [L.flame[0] * 0.24, L.flame[1] * 0.24, L.flame[2] * 0.24], wCore: 1.3, wGlow: 3.8, life: dur * 0.85, shrink: 0.7, scroll: -1.4, pattern: 'feather', wStart: 0.05, ramp: 12 })];
    }
    // scorch line along the floor under the beam with a running wall of flame (the street catches fire)
    const nodes = [];
    for (let s = 3; s < len; s += 2) {
      const p = _b.copy(eye).addScaledVector(dir, s), y = floorY(p);
      if (Number.isFinite(y) && p.y - y < 2.6) {
        nodes.push(new THREE.Vector3(p.x, y, p.z));
        fx?.decals?.add(_c.set(p.x, y, p.z), UP, { frame: DECAL.scorch, size: 0.9, aspect: 0.35, along: dir, alpha: 0.9, life: 5, fade: 1.5, fit: false });
      }
    }
    if (nodes.length) { d.path = new FirePath(g, L, nodes, { life: dur + 0.5, flame: 0.75, spread: 0.7, scorch: 1.4, light: false }); d.reach = 0; }
    fx?.motes?.trailDrop?.(near, d.b, L.moteKind, { owner: 'bfbeam' + k.by, spacing: 1.6, max: 18, color: L.mote, color2: L.mote2, size: 0.15 });
    // the end: a pillar of flame, chunks of street and dust thrown out, sparks, a light
    if (!d.meteor) beamEnd(g, L, d.end, k);
    d.s0 = L.id === 'guiche' ? d.sky : near.clone(); d.s1 = L.id === 'guiche' ? d.mEnd.clone() : d.b.clone();
    // remote viewers see the shaft from the side: rings racing down it; the caster looks down it (rings would stack
    // on the crosshair), so first person gets the feather helix only
    d.rings = !(k.local && mine(g, k.ws));
    if (d.rings) beamRings(g, L, d.s0, d.s1, 0);
    beamHelix(g, L, d.s0, d.s1, k.rng, 46);
    d.ring = 0.16;
    sfx(g, L, 'bifang_beam', 'explosion_small', k.local ? { volume: 0.9 } : { pos: d.b, volume: 0.8 });
    if (!k.local) return;
    if (!d.meteor) hurtSeg(k, d.a, d.b, d.half, B.dmg ?? 600, { knock: 5, stagger: 1, burn: true, burnAdd: 2 });
    g.addShake?.(clipComfort.shake ? 0.3 : 0);
    g.arsenal?._clipEvent?.('tint', { rgb: '#ffffff', a: 0.2, in: 0.03, hold: 0.06, out: 0.3 });
    g.arsenal?._clipEvent?.('haptic', 'thud');
    g.arsenal?.fovKick?.(-3, 0.35);
    // (a short, light radial: the shaft is the show, speed lines over the whole frame hid it)
    if (clipComfort.overlay) fx?.overlay?.radial?.(0.18, 0.22, { color: L.root });
    if (mine(g, k.ws)) { gunClip(g, k.ws, 'bifang_beam_kick'); beamFlare(g, L); g.vm.glowTo(2.4, 0.04); later(k.ws, 0.2, () => g.vm?.glowTo(1, 0.6)); }
  },
  update(k, dt) {
    const g = k.game, d = k.data, B = k.def.special.beam || {}, L = d.L, dur = B.dur ?? 1.2;
    // the floor fire races out along the beam (~60 m/s), burns for the beam's life
    if (d.path) { d.reach += dt * 30; d.path.reach(Math.floor(d.reach)); d.path.update(dt); }
    const mt = d.meteor;
    if (mt && !mt.hitDone) {
      // 晦天墜 head falling: violet core, teal edge, smoke + wisps shed behind it
      mt.t += dt;
      const u = Math.min(1, mt.t / mt.fall), h = _b.copy(mt.from).lerp(mt.to, u * u);
      mt.trail?.push(h);
      const P = g.fx?.particles;
      if (P) {
        // the head: a violet core in a cold-teal corona, a fire tongue streaming back up the fall line
        P.spawn({ additive: true, x: h.x, y: h.y, z: h.z, life: 0.04, size: 3.2, color: [L.teal[0] * 0.3, L.teal[1] * 0.3, L.teal[2] * 0.3, 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
        P.spawn({ additive: true, x: h.x, y: h.y, z: h.z, life: 0.04, size: 1.8, color: [L.beamCore[0] * 0.8, L.beamCore[1] * 0.8, L.beamCore[2] * 0.8, 1], color1: [L.beamGlow[0], L.beamGlow[1], L.beamGlow[2], 0], frame: FRAME.glow });
        P.spawn({ additive: true, x: h.x, y: h.y, z: h.z, life: 0.03, size: 0.8, color: [6, 5, 7, 1], color1: [L.flame[0], L.flame[1], L.flame[2], 0], frame: FRAME.glow });
        const fd = _c.subVectors(mt.from, mt.to).normalize();
        P.spawn({ additive: true, x: h.x, y: h.y, z: h.z, life: 0.06, mode: 'align', dir: [fd.x, fd.y, fd.z], aspect: 3.5, anchor: 0.45, size: 1.1, color: [1.2, 1.1, 1, 1], color1: [1, 1, 1, 0], frame: FRAME.cone + 1, ramp: L.flameRamp, heat: 1.2, heat1: 0.5 });
        for (let i = 0; i < 2; i++) P.spawn({ x: h.x + (k.rng() - 0.5) * 0.6, y: h.y, z: h.z + (k.rng() - 0.5) * 0.6, vx: (k.rng() - 0.5) * 1.2, vy: 0.6, vz: (k.rng() - 0.5) * 1.2, life: 1.1 + k.rng() * 0.6, size: 0.8, size1: 2.4, sizePow: 0.5,
          color: [0.1, 0.08, 0.14, 0.55], color1: [0.12, 0.1, 0.16, 0], frame: FRAME.smoke + (i & 1), drag: 1.5, spin: (k.rng() - 0.5) * 1.5 });
        P.spawn({ additive: true, x: h.x, y: h.y, z: h.z, vx: (k.rng() - 0.5) * 2, vy: 1 + k.rng(), vz: (k.rng() - 0.5) * 2, life: 0.6, mode: 'align', dir: [0, 1, 0], aspect: 3, anchor: 0.3, size: 0.25, size1: 0.1,
          color: [L.teal[0] * 0.5, L.teal[1] * 0.5, L.teal[2] * 0.5, 1], color1: [L.flame[0] * 0.2, 0, L.flame[2] * 0.2, 0], frame: FRAME.wisp, drag: 1 });
      }
      if (u >= 1) {
        mt.hitDone = true; mt.trail?.stop();
        beamEnd(g, L, d.mEnd, k, true);
        if (k.local) hurtSeg(k, d.a, d.b, d.half, B.dmg ?? 600, { knock: 5, stagger: 1, burn: true, burnAdd: 2 });
      }
    }
    if (k.t > dur) return;
    if (k.rng() < 0.6) g.fx?.sparkBurst?.(d.end, { color: L.root, color1: L.flame, count: 2, speed: 3, glow: 0 });
    // the beam keeps pulsing: a ring wave every 0.16 s (remote view), a few feathers peeling off
    if ((d.ring -= dt) <= 0 && d.s0) { d.ring = 0.16; if (d.rings) beamRings(g, L, d.s0, d.s1, k.t, 0.6); beamHelix(g, L, d.s0, d.s1, k.rng, 6); }
    if (k.local && (d.tick -= dt) <= 0) { d.tick = 0.2; hurtSeg(k, d.a, d.b, d.half, (B.dps ?? 120) * 0.2, { knock: 0.6, stagger: 0.3, burn: true }); }
  },
  end(k) { for (const b of k.data.beams || []) b?.stop?.(); k.data.path?.stop(); k.data.meteor?.trail?.stop(); },
});
/** 焚天光 / 晦天墜 end: a pillar of fire, street chunks and dust thrown out, sparks, a light (meteor: a crater). */
function beamEnd(g, L, p, k, crater = false) {
  const fx = g.fx;
  // a beam stopped close in front of the caster (a wall, a car) gets a small pillar: a big one there whites out the
  // middle of the screen
  const near = smooth((g.camera.position.distanceTo(p) - 6) / 10), sz = 0.45 + 0.55 * near;
  fx?.sigils?.pillar?.(p, { radius: (crater ? 1.3 : 0.8) * sz, height: (crater ? 12 : 7) * sz, color: crater ? L.beamCore : L.root, color1: L.flame, life: 0.55, motes: 10, light: near > 0.3 ? 50 : 0 });
  debris(g, p, crater ? 16 : 10);
  fx?.sparkBurst?.(_a.set(p.x, p.y + 0.4, p.z), { color: L.root, color1: L.flame, count: 26, speed: 9, glow: 0.6 + 0.4 * near });
  fx?.lights?.flash?.(_a.set(p.x, p.y + 1, p.z), L.light, 40 + 30 * near, 14, 0.5);
  fx?.shockwave?.(_a.set(p.x, p.y + 0.06, p.z), { normal: UP, r0: 0.4, r1: (crater ? 5 : 3.5) * sz, life: 0.45, color: L.ring, thin: false });
  if (crater) {
    fx?.decals?.add(_a.set(p.x, p.y, p.z), UP, { frame: DECAL.scorch, size: 3.2, aspect: 1, along: _b.set(1, 0, 0), alpha: 1, life: 8, fade: 2, fit: false });
    fx?.motes?.burst?.(L.moteKind, _a.set(p.x, p.y + 0.6, p.z), 14, { speed: 4, spread: 1, color: L.mote, color2: L.mote2, size: 0.2, seed: k.ev.seed });
    sfx(g, L, 'bifang_ult_pillar', 'explosion_large', { pos: p, volume: 0.7 });
    if (k.local) { g.addShake?.(clipComfort.shake ? 0.25 : 0); g.hitStop?.(clipComfort.hitstop ? 0.05 : 0); }
  }
}

// ★ 羽落 / 晦羽落 ---------------------------------------------------------------------------------------------
registerSkill('featherfall', {
  level: 'L2', aim: 'target', defaults: { n: 12, r: 6, dmg: 60, burn: 2, fall: 1.2, range: 30 },
  start(k) {
    const g = k.game, p = k.p, d = k.data, L = d.L = lookOf(k.def), c = k.at || k.feet();
    k.dur = p.fall + 0.7;
    d.c = c.clone();
    d.drops = [];
    for (let i = 0; i < p.n; i++) {
      const a = k.rng() * Math.PI * 2, rr = Math.sqrt(k.rng()) * p.r * 0.92;
      const q = new THREE.Vector3(c.x + Math.cos(a) * rr, c.y + 2, c.z + Math.sin(a) * rr);
      q.y = k.floorY(q);
      d.drops.push({ p: q, t: 0.12 + (i / p.n) * (p.fall - 0.15) + k.rng() * 0.04, done: false });
    }
    d.sig = g.fx?.sigils?.sigil?.(c, { design: L.sigil, radius: p.r, color: L.sigilCol, color1: L.sigilCol1, life: p.fall + 0.9, fadeOut: 0.4, seed: k.ev.seed, intensity: 0.7 });
    d.lances = [];
    k.dur = p.fall + 1.4;                                 // the last lance stands ~1 s
    sfx(g, L, 'bifang_feather_rain', 'swingHeavy', k.local ? { volume: 0.7 } : { pos: c, volume: 0.7 });
    if (k.local && mine(g, k.ws)) { gunClip(g, k.ws, 'bifang_cast_tap'); veinTongue(g, L, 'r', L.root, 0.25, true); }
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p;
    for (const f of d.drops) {
      if (f.done || k.t < f.t) continue;
      f.done = true;
      // a burning feather lance falls (0.24 s) and plants itself; damage and the thump on landing
      d.lances.push(new FeatherLance(g, d.L, f.p, { hit: (q) => {
        sfx(g, d.L, 'bifang_feather_hit', 'fire_burst', { pos: q, volume: 0.5 });
        if (!k.local) return;
        hurtArea(k, q, 1.6, p.dmg, { burn: true, burnAdd: p.burn, knock: 2.5, stagger: 0.7 });
        // a thump for each one near the crosshair (within ~12° of the view)
        _a.subVectors(q, g.camera.position); const l = _a.length();
        g.camera.getWorldDirection(_c);
        if (l > 0.1 && _a.dot(_c) / l > 0.978 && clipComfort.shake) g.addShake?.(0.06); else g.addShake?.(0.015);
      } }));
    }
    for (let i = d.lances.length - 1; i >= 0; i--) if (!d.lances[i].update(dt)) d.lances.splice(i, 1);
  },
  end(k) { k.data.sig?.stop?.(0.4); for (const l of k.data.lances || []) l.trail?.stop(); },
});

/**
 * The spirit's light wings: the weapon's own cloisonné feather fans (fx.wings, 'back' frame) on two pivots at the
 * shoulders that follow the ghost shader's wing flap, rooted at the wrists, so the porcelain crane carries the
 * 掐絲琺瑯 wings of the gun (≈ 9 m span at size 5.6). Detaches by itself when the ghost is removed.
 */
function spiritWings(g, gh, L) {
  const kit = g.fx?.wings;
  if (!kit || !gh?.obj) return null;
  const piv = [], list = [];
  for (const [side, s] of [['L', -1], ['R', 1]]) {
    const p = new THREE.Group();
    gh.obj.add(p);
    piv.push([p, s]);
    const wr = L.id === 'guiche' ? [0.38, 0.3, 0] : CRANE_WRIST;
    list.push(kit.attach(p, { preset: 'back', side, anchors: { [side]: new THREE.Vector3(s * wr[0], wr[1], wr[2]) }, count: 7, scale: 1.6,
      spacing: 15, style: 'cloisonne', core: L.wing.core, tip: L.wing.tip, enamel: L.wing.enamel, gold: L.wing.gold, tipMix: L.wing.tipMix ?? 0, open: false, alpha: Math.min(0.85, L.wing.alpha ?? 1) }).openWing(0.35));
  }
  return {
    list,
    update() {
      // the ghost vertex shader's flap (summons.js GHOST_VERT): (sin(uTime·hz·2π)·amp + 0.12) about z through the shoulders
      const u = gh.mats?.[0]?.u, f = u?.uFlap?.value;
      if (!f) return;
      const A = Math.sin(u.uTime.value * f.y * Math.PI * 2) * f.x + 0.12;
      for (const [p, s] of piv) p.rotation.z = A * s;
    },
    close(dur = 0.3) { for (const w of list) w.close(dur); },
    sparkle(n = 12) { for (const w of list) w.sparkle(n); },
    // (the cards hang off pivots inside the ghost: removing the ghost does not orphan them, detach explicitly)
    remove() { for (const w of list) w.detach(); },
  };
}

// ★ held 畢方降臨 / 鬼車夜啼 -------------------------------------------------------------------------------------
registerSkill('bifang_descent', {
  level: 'L3', aim: 'target', defaults: { range: 25 },
  start(k) {
    const g = k.game, d = k.data, L = d.L = lookOf(k.def), S = k.def.special;
    d.flap = S.flap || { r: 10, cone: 60, dmg: 300, burn: 3, knock: 9 };
    d.dive = S.dive || { len: 25, dps: 30, life: 4, width: 2.6 };
    k.dur = DIVE_T0 + DIVE_T + d.dive.life + 0.4;
    d.c = (k.at || k.feet()).clone();
    d.dir = _a.set(k.dir.x, 0, k.dir.z).normalize().clone();
    if (d.dir.lengthSq() < 0.5) d.dir.set(0, 0, -1);
    // the spirit needs room to be seen whole (≈ 6 m tall, wings over it): a mark closer than 14 m moves out along
    // the aim (same on every client: k.pos)
    const hz = Math.hypot(d.c.x - k.pos.x, d.c.z - k.pos.z);
    if (hz < 14) { d.c.set(k.pos.x + d.dir.x * 14, d.c.y, k.pos.z + d.dir.z * 14); d.c.y = k.floorY(d.c); }
    d.sz = L.id === 'guiche' ? 5.2 : 5.6; d.hip = 0.62 * d.sz;       // shoulders above the ground (feet on it)
    d.beat = 0; d.tick = 0; d.feared = [];
    d.key = 'bfult' + k.ev.seed;
    sfx(g, L, 'bifang_ult_rise', 'drawHeavy', k.local ? { volume: 0.9 } : { pos: d.c, volume: 0.9 });
    if (!k.local) { if (k.level >= 2) d.back = backWings(g, k.by, L, 3.2); return; }
    const ws = k.ws;
    g.hud?.card?.(k.cardText(), { color: hexOf(L.root), sub: k.def.en });
    if (mine(g, ws)) {
      // the bones spread, but the light wings belong to the spirit this time (first-person fans would fight it)
      g.vm.setPart('fx_wingRoot*', 1, 0.25, 0.02);
      gunClip(g, ws, 'bifang_cast_ult');
      later(ws, 0.1, () => vmFeathers(g, ws, L, 6));
    }
    g.arsenal?.fovKick?.(3, 0.8);
    g.arsenal?._clipEvent?.('haptic', 'thud');
    if (k.level >= 4 || k.local) g.hud?.border?.(hexOf(L.root), 0.2, 3.6);
  },
  update(k, dt) {
    const g = k.game, fx = g.fx, d = k.data, L = d.L, t = k.t, c = d.c, guiche = L.id === 'guiche';
    const big = k.level >= 3;
    if (d.beat < 1 && t >= 0.3) {            // ② sigil: gold-vermilion, kept dim, clear of the caster's feet
      d.beat = 1;
      d.sig = fx?.sigils?.sigil?.(c, { design: L.sigil, radius: 6.5, color: L.sigilCol, color1: L.sigilCol1, life: 3.0, fadeOut: 0.4, seed: k.ev.seed, intensity: 0.6 });
    }
    if (d.beat < 2 && t >= 0.6) {            // ③ descent: pillar, the spirit dissolves in from the column
      d.beat = 2;
      fx?.sigils?.pillar?.(c, { radius: 1.5, height: 18, color: L.root, color1: L.flame, life: 0.9 });
      fx?.lights?.flash?.(_a.set(c.x, c.y + 3, c.z), L.light, 90, 18, 0.5);
      // §1.12 ultimate layers: ult_rise (t 0) -> this 40-60 Hz impact + choir / bell / gong bed -> the deflate in ult_end
      sfx(g, L, 'bifang_ult_pillar', 'explosion_large', { pos: c, volume: 1 });
      sfx(g, L, 'bifang_crane_cry', null, { pos: c, volume: 1 });
      if (big && fx?.summons?.ghost) {
        d.ghost = fx.summons.ghost({ geometry: guiche ? nineHeadGeo() : craneGeo(), pos: _b.copy(c).add(_e.set(0, d.hip + 1.8, 0)), size: d.sz,
          yaw: Math.atan2(-d.dir.x, -d.dir.z), ...L.ghost, appear: 0.35, life: Infinity, motion: 'none', flap: { amp: 0.32, hz: 0.7 }, big: true, seed: k.ev.seed,
          exit: { kind: L.moteKind, count: 40, color: L.mote, speed: 4.5, scale: 2.6 } });
        d.sw = spiritWings(g, d.ghost, L);
      }
      if (k.local) { g.addShake?.(0.3); if (clipComfort.overlay) fx?.overlay?.radial?.(0.8, 0.4, { color: L.root }); }
    }
    const gh = d.ghost?.alive ? d.ghost : null;
    // the spirit settles on its one foot (0.6 -> 1.0 s); 鬼車 circles the mark instead
    if (gh && t < DIVE_T0) {
      const u = smooth((t - 0.6) / 0.4);
      if (guiche) {
        const a = (t - 0.6) * 3.2, rr = 5 * (1 - smooth((t - 1.1) / 0.5));
        gh.obj.position.set(c.x + Math.cos(a) * rr, c.y + d.hip + 2.5 - u * 1.8, c.z + Math.sin(a) * rr);
        gh.obj.rotation.y = rr > 0.6 ? Math.PI - a : Math.atan2(-d.dir.x, -d.dir.z);   // along the circle, then the aim
      } else gh.obj.position.set(c.x, c.y + d.hip + 1.8 * (1 - u), c.z);
    }
    d.sw?.update(dt);
    if (d.beat < 3 && t >= 1.0 && !guiche) {   // landing on the one foot
      d.beat = 3;
      fx?.shockwave?.(_a.set(c.x, c.y + 0.06, c.z), { normal: UP, r0: 0.5, r1: 5, life: 0.5, color: L.ring });
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; fx?.knockDust?.(_a.set(c.x + Math.cos(a) * 2, c.y, c.z + Math.sin(a) * 2), _b.set(Math.cos(a) * 5, 0, Math.sin(a) * 5), 1); }
      if (k.local) g.addShake?.(0.2);
    }
    if (d.beat < 4 && t >= 1.15) {           // ④ the wing beat (畢方) / the scream (鬼車)
      d.beat = 4;
      const F = d.flap;
      if (gh) { for (const m of gh.mats) m.u.uFlap.value.set(1.1, 2.2, 0, 0.6); later2(g, 0.5, () => { for (const m of gh.mats || []) m.u.uFlap.value.set(0.5, 1.6, guiche ? 0.05 : 0, 0.6); }); gh.flash(1); d.sw?.sparkle(14); }
      if (guiche) {
        for (let i = 0; i < 3; i++) later2(g, i * 0.12, () => fx?.shockwave?.(_a.set(c.x, c.y + 2.5, c.z), { r0: 0.5, r1: F.r * (0.8 + i * 0.25), life: 0.55, color: L.ring, thin: true }));
        sfx(g, L, 'bifang_scream', 'explosion_far', { pos: c, volume: 1 });
        // fear first (the signature: the horde turns and runs), then a scream that hurts but rarely kills (120)
        if (g.zombies?.authority) fear(k, c, F.r, 1.5);
        if (k.local) hurtArea(k, c, F.r, F.scream ?? 120, { burn: true, burnAdd: 1, knock: 0.3, stagger: 0 });   // (1 stack: they live to run)
      } else {
        const fwd = _a.copy(c).addScaledVector(d.dir, 3).setY(c.y + 1.2);
        fx?.motes?.burst?.(L.moteKind, fwd, 32, { speed: 6, dir: d.dir.clone().setY(0.35).normalize(), spread: 0.55, radius: 2, color: L.mote, color2: L.mote2, size: 0.22, seed: k.ev.seed });
        fx?.shockwave?.(_b.copy(c).addScaledVector(d.dir, 4).setY(c.y + 0.08), { normal: UP, r0: 1, r1: F.r, life: 0.5, color: L.ring });
        for (let i = 0; i < 12; i++) { const a = (k.rng() - 0.5) * F.cone * 2 * D2R, dd = _b.copy(d.dir).applyAxisAngle(UP, a); fx?.knockDust?.(_e.copy(c).addScaledVector(dd, 3 + k.rng() * 6), dd.multiplyScalar(7), 1); }
        sfx(g, L, 'bifang_ult_flap', 'explosion_large', { pos: c, volume: 0.8 });
        // the gale starts 9 m behind the crane (towards the caster): the cone covers the horde between the caster and
        // the mark, not only what is past it, and blows everything away from the caster
        if (k.local) hurtCone(k, c.clone().addScaledVector(d.dir, -9), d.dir, F.r + 9, F.cone, F.dmg, { knock: F.knock, stagger: 1, explosive: true, burnAdd: F.burn });
      }
      if (k.local) { g.hitStop?.(clipComfort.hitstop ? 0.08 : 0); g.addShake?.(0.35); g.arsenal?._clipEvent?.('haptic', 'thud'); }
    }
    if (d.feared.length) fearUpdate(k, dt);
    // the dive (1.8 -> 3.3 s): a banking sweep across the caster's view (out to one side, back across in front of
    // the horde), low over the street, the path catching fire behind (1.5-2 m flames, a burning ribbon, a light)
    if (d.beat < 5 && t >= DIVE_T0) {
      d.beat = 5;
      const D = d.dive, f = d.dir, r = _b.set(-f.z, 0, f.x), sg = k.rng() < 0.5 ? 1 : -1;
      const P = (a, b) => new THREE.Vector3(c.x + f.x * a + r.x * b * sg, c.y, c.z + f.z * a + r.z * b * sg);
      d.curve = new THREE.CatmullRomCurve3([P(0, 0), P(4, 6), P(10, 2.5), P(11, -5), P(6.5, -10), P(1, -12)], false, 'centripetal');
      const total = d.curve.getLength(), uEnd = Math.min(1, D.len / total);
      d.uEnd = uEnd;
      const nodes = [];
      for (let s = 0; s <= D.len; s += 2) { const p = d.curve.getPointAt(Math.min(uEnd, s / total)); p.y = k.floorY(p); nodes.push(p); }
      d.path = new FirePath(g, L, nodes, { life: D.life, flame: 1.35, spread: 1.2, scorch: 2.2 });
      d.p1 = nodes[nodes.length - 1].clone();
      d.rib = [fx?.trail?.({ width: 2.4, life: 0.75, color: [L.flame[0] * 0.45, L.flame[1] * 0.45, L.flame[2] * 0.45, 1], color1: [L.flame[0] * 0.05, L.flame[1] * 0.03, L.flame[2] * 0.02, 0], taper: 0.2, segs: 40 }),
        fx?.trail?.({ width: 0.7, life: 0.45, color: [L.mote2[0] * 0.5, L.mote2[1] * 0.5, L.mote2[2] * 0.5, 1], color1: [L.flame[0] * 0.2, L.flame[1] * 0.2, L.flame[2] * 0.2, 0], taper: 0.1, segs: 30 })];
      sfx(g, L, 'bifang_ult_dive', 'rocket_fly', { pos: c, volume: 0.9 });
    }
    if (d.path) {
      const u = Math.min(1, (t - DIVE_T0) / DIVE_T), D = d.dive, e = u * u * (3 - 2 * u);
      d.path.reach(Math.floor(e * D.len / 2));
      d.path.update(dt);
      if (gh && u < 1) {
        const cu = e * d.uEnd, p = d.curve.getPointAt(cu), tn = d.curve.getTangentAt(cu), tn2 = d.curve.getTangentAt(Math.min(1, cu + 0.04));
        const turn = tn.x * tn2.z - tn.z * tn2.x;                   // signed curvature: bank into the turn
        gh.obj.position.set(p.x, k.floorY(p) + d.hip * 0.55 + Math.sin(u * Math.PI) * 1.2, p.z);
        gh.obj.rotation.set(-0.38 * Math.sin(Math.min(1, u * 3) * Math.PI / 2), Math.atan2(-tn.x, -tn.z), THREE.MathUtils.clamp(-turn * 9, -0.7, 0.7), 'YXZ');
        // the burning ribbon off its back / tail, a light riding with it
        _e.set(0, d.sz * 0.05, d.sz * 0.3).applyQuaternion(gh.obj.quaternion).add(gh.obj.position);
        for (const rb of d.rib || []) rb?.push(_e);
        fx?.lights?.hold?.(d.key, _e, L.light, 40, 14);
        if (k.rng() < 0.6) fx?.motes?.spawn?.(L.moteKind, gh.obj.position, { vel: [0, -0.5, 0], color: L.mote, color2: L.mote2, size: 0.3, life: 1.4 });
      }
      if (k.local && u < 1 && clipComfort.shake) g.addShake?.(0.12 * dt * 8);
      // the burning path: 30/s along the reached part, 4 s from the moment the bird passed
      if (k.local && (d.tick -= dt) <= 0 && t < DIVE_T0 + DIVE_T + D.life) {
        d.tick = 0.25;
        hurtPath(k, d.path.nodes.filter((n) => n.on >= 0 && d.path.t - n.on < D.life).map((n) => n.p), D.width / 2, D.dps * 0.25, { burn: true, knock: 0.3, stagger: 0.2 });
      }
    }
    if (d.beat < 6 && t >= DIVE_T0 + DIVE_T) {   // ⑤ exit: the spirit bursts into fire feathers at the end of its run
      d.beat = 6;
      gh?.dissolveOut(0.6); d.sw?.close(0.45);
      const sw = d.sw; if (sw) { d.sw = null; later2(g, 0.7, () => sw.remove()); }
      for (const rb of d.rib || []) rb?.stop();
      fx?.lights?.release?.(d.key);
      const end = d.p1 || c;
      fx?.shockwave?.(_a.set(end.x, end.y + 0.06, end.z), { normal: UP, r0: 0.5, r1: 8, life: 0.7, color: L.ring, thin: false });
      fx?.shockwave?.(_a.set(end.x, end.y + 2.5, end.z), { r0: 0.5, r1: 6, life: 0.5, color: L.ring, thin: true });
      fx?.sparkBurst?.(_a.set(end.x, end.y + 2.5, end.z), { color: L.root, color1: L.flame, count: 40, speed: 10, glow: 1.4 });
      fx?.motes?.burst?.(L.moteKind, _a.set(end.x, end.y + 2.2, end.z), 48, { speed: 7, spread: 1, radius: 1.5, color: L.mote, color2: L.mote2, size: 0.3, seed: k.ev.seed + 1 });
      fx?.sigils?.pillar?.(end, { radius: 1.2, height: 10, color: L.root, color1: L.flame, life: 0.55, motes: 12 });
      debris(g, end, 12);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; fx?.knockDust?.(_a.set(end.x + Math.cos(a) * 1.5, end.y, end.z + Math.sin(a) * 1.5), _b.set(Math.cos(a) * 7, 0, Math.sin(a) * 7), 1.2); }
      fx?.lights?.flash?.(_a.set(end.x, end.y + 2, end.z), L.light, 110, 20, 0.6);
      sfx(g, L, 'bifang_ult_end', 'fire_burst', { pos: end, volume: 0.9 });
      if (k.local) {
        if (clipComfort.shake) g.addShake?.(0.25);
        g.hud?.border?.(hexOf(L.root), 0, 0.01);
        if (mine(g, k.ws)) { g.vm.setPart('fx_wingRoot*', 0, 0.35); dropWings(k.ws.sp, 0.3, g.time); }
      } else if (d.back) { d.back.w.close(0.3); }
    }
  },
  end(k) {
    const d = k.data;
    d.sig?.stop?.(0.4); d.path?.stop(); if (d.ghost?.alive && d.ghost.outT < 0) d.ghost.dissolveOut(0.3);
    const sw = d.sw; if (sw) { sw.close(0.3); later2(k.game, 0.4, () => sw.remove()); }
    d.back?.remove();
    for (const rb of d.rib || []) rb?.stop();
    k.game.fx?.lights?.release?.(d.key);
    for (const f of d.feared) unfear(f.z);
    d.feared.length = 0;
    if (k.local && k.ws && mine(k.game, k.ws) && k.ws.sp.vmw) { k.game.vm.setPart('fx_wingRoot*', 0, 0.3); dropWings(k.ws.sp, 0.25, k.game.time); }
  },
});
const DIVE_T0 = 1.8, DIVE_T = 1.5;     // the dive: start, duration (s)

// 鬼車夜啼: zombies in range turn and flee (authority side only: the host or solo moves zombies; bosses only flinch)
function fear(k, c, r, dur) {
  const g = k.game;
  for (const z of g.zombies?.inRadius?.(c, r) || []) {
    if (!z.alive || z.puppet) continue;
    if (z.brain || z.def?.boss) { z.flinchV?.set?.(0, 0, 4); continue; }
    k.data.feared.push({ z, until: k.t + dur, from: c.clone() });
    z.setLoco?.(true);
  }
}
function fearUpdate(k, dt) {
  const d = k.data;
  for (let i = d.feared.length - 1; i >= 0; i--) {
    const f = d.feared[i], z = f.z;
    if (!z.alive || k.t >= f.until) { unfear(z); d.feared.splice(i, 1); continue; }
    // holding them in 'stagger' keeps the brain from chasing / attacking; we move them away ourselves
    z.state = 'stagger'; z.stateT = 0;
    const away = _a.subVectors(z.pos, f.from).setY(0);
    if (away.lengthSq() < 1e-4) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    away.normalize();
    z._face?.(_b.copy(z.pos).add(away), dt, 9);
    const sp = (z.def?.run ?? 3.5) * 0.9;
    const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
    z._move?.(fx * sp * dt, fz * sp * dt, z.mgr);
    if (z.loco && z.action === z.loco) z.loco.timeScale = 1.2;
    z.root?.rotation && (z.root.rotation.y = z.yaw);
  }
}
function unfear(z) { if (z?.alive && z.state === 'stagger') { z.state = 'chase'; z.stateT = 0; z.setLoco?.(z.running); } }

// crisis armour 羽衣: the light wings wrap round the player, then burst into feathers (crisis.js calls start)
registerSkill('bifang_cocoon', {
  level: 'L1',
  start(k) {
    const g = k.game, L = lookOf(k.def), c = k.feet(new THREE.Vector3());
    g.fx?.motes?.burst?.(L.moteKind, _a.set(c.x, c.y + 1.1, c.z), 16, { speed: 4.5, spread: 1, radius: 0.5, color: L.mote, color2: L.mote2, size: 0.2, seed: k.ev.seed });
    g.fx?.sparkBurst?.(_a.set(c.x, c.y + 1.1, c.z), { color: L.root, color1: L.flame, count: 18, speed: 6, glow: k.local ? 0 : 1 });
    sfx(g, L, 'bifang_cocoon', 'impact_glass', k.local ? { volume: 0.9 } : { pos: c });
    if (!k.local || !mine(g, k.ws)) { const b = backWings(g, k.by, L, 2.6); if (b) later2(g, 0.35, () => { b.w.close(0.15); later2(g, 0.25, () => b.remove()); }); return; }
    // first person: the wings snap shut round the view (fan wide, fold fast), feathers left floating
    g.vm.setPart('fx_wingRoot*', 1, 0.08);
    vmWings(g, k.ws, { style: 'cloisonne', count: 7, scale: 1.35, dur: 0.1, spacing: 20 });
    later(k.ws, 0.3, () => { dropWings(k.ws.sp, 0.12, g.time); g.vm?.setPart('fx_wingRoot*', 0, 0.3); vmFeathers(g, k.ws, L, 6); });
  },
});

// ------------------------------------------------------------------------------------- clips
// The heavy gun is held at the grip: rotations pivot there. Wing / beak / gate tracks use the parts' extras amounts.
const W2 = (v) => ({ fx_wingRootL: v, fx_wingRootR: v });
const wt = (keys) => keys.map(([t, v, e]) => (e ? [t, v, e] : [t, v]));

// 首次登場 1.5 s: up from below, the wings half-spread with a burst of gold-white light feathers, they fold, a peck, freeze, bell
registerClip('bifang_first', {
  duration: 1.5,
  tracks: {
    gunPos: [[0, [0.03, -0.24, 0.07]], [0.26, [0.004, 0.006, 0.0], 'out3'], [0.44, [-0.03, 0.03, 0.02], 'inOut'], [0.6, [-0.032, 0.032, 0.022]],
      [0.74, [0.0, 0.002, 0.0], 'out3'], [0.95, [0, 0.002, 0]], [1, Z3]],
    gunRot: [[0, [-42, 14, 26]], [0.26, [3, 2, -6], 'out3'], [0.44, [8, 26, -24], 'inOut'], [0.6, [9, 28, -26]], [0.74, [1, -1, 1], 'out3'], [0.95, [1, -1, 1]], [1, Z3]],
    ...W2(wt([[0, 0], [0.26, 0], [0.43, 0.5, 'outBack'], [0.55, 0.5], [0.72, 0, 'in3'], [1, 0]])),
    fx_beak: [[0, 0], [0.86, 0], [0.89, 0.6, 'out3'], [0.93, 0, 'in3'], [1, 0]],
    env: [[0, 0], [0.3, 1], [0.8, 1], [1, 0]],
  },
  // sound (card): porcelain and metal clinks coming up, 「颯」 + the crane as the wings spread, feathers folding, the bell
  events: [[0, 'anchorL', ['rest', 0.05]], [0.02, 'bf', { snd: 'bifang_draw', fb: 'drawHeavy' }], [0.25, 'haptic', 'tick'], [0.27, 'bf', { wing: 'open', style: 'glow', count: 6, scale: 0.8, dur: 0.25, fan: false }],
    [0.27, 'bf', { snd: 'bifang_swish', vol: 0.8 }], [0.29, 'bf', { sparkle: 16, cry: 0.7 }], [0.3, 'glow', { to: 1.8, sec: 0.15 }], [0.48, 'bf', { snd: 'bifang_feather', fb: 'cloth' }],
    [0.5, 'bf', { wing: 'close', dur: 0.35 }], [0.52, 'bf', { feathers: 6 }],
    [0.72, 'anchorL', ['grip_l', 0.14]], [0.75, 'poseL', 'wrap'], [0.75, 'glow', { to: 1, sec: 0.4 }], [0.89, 'haptic', 'tick'], [0.9, 'bf', { bell: 0.7 }]],
});

// ◎ the wings spread: the gun bucks up as they catch air
registerClip('bifang_wing_buck', { duration: 0.55, tracks: {
  gunPos: [[0, Z3], [0.18, [0, -0.012, 0.02], 'out3'], [0.5, [0, -0.004, 0.006]], [1, Z3, 'inOut']],
  gunRot: [[0, Z3], [0.18, [-5, 1, 3], 'out3'], [0.5, [-1.5, 0.4, 1]], [1, Z3, 'inOut']] }, events: [] });
// 焚天光: recoil 4° up, held a moment, back
registerClip('bifang_beam_kick', { duration: 0.95, tracks: {
  gunPos: [[0, Z3], [0.08, [0, 0.01, 0.035], 'out3'], [0.55, [0, 0.008, 0.025]], [1, Z3, 'inOut']],
  gunRot: [[0, Z3], [0.08, [4, 0, -2], 'out3'], [0.55, [3.5, 0, -1.5]], [1, Z3, 'inOut']] }, events: [] });
// ★ tap: a flick towards the sky
registerClip('bifang_cast_tap', { duration: 0.6, tracks: {
  gunPos: [[0, Z3], [0.3, [0, 0.02, 0.01], 'out3'], [1, Z3, 'inOut']], gunRot: [[0, Z3], [0.3, [10, 0, -4], 'out3'], [1, Z3, 'inOut']] }, events: [[0.25, 'haptic', 'tick']] });
// ★ held: muzzle to the sky, wings full, back down as the spirit lands
registerClip('bifang_cast_ult', { duration: 1.3, tracks: {
  gunPos: [[0, Z3], [0.22, [0.0, 0.05, 0.03], 'out3'], [0.6, [0.0, 0.055, 0.03]], [1, Z3, 'inOut']],
  gunRot: [[0, Z3], [0.22, [32, 4, -6], 'out3'], [0.6, [34, 4, -6]], [1, Z3, 'inOut']] }, events: [[0.2, 'haptic', 'tick']] });
// ready reminder (every 2.5 s while 天火 is full): the bones flare, the beak opens and shuts, light dust
registerClip('bifang_ready', { duration: 0.8, tracks: {
  ...W2(wt([[0, READY_OPEN], [0.25, 0.62, 'outBack'], [0.6, READY_OPEN, 'inOut'], [1, READY_OPEN]])),
  fx_beak: [[0, 0], [0.3, 0.5, 'out3'], [0.45, 0, 'in3'], [1, 0]],
  gunRot: [[0, Z3], [0.25, [-1.5, 0, 1], 'out3'], [1, Z3]] },
  events: [[0.22, 'bf', { glint: 10 }], [0.24, 'bf', { feathers: 2 }], [0.25, 'glow', { to: 1.8, sec: 0.08 }], [0.5, 'glow', { to: 1, sec: 0.3 }], [0.3, 'bf', { snd: 'bifang_feather', fb: 'cloth', vol: 0.6 }]] });
// rare idle (12 s quiet): the wing roots shake off two light feathers
registerClip('bifang_idle_rare', { duration: 1.2, tracks: {
  'fx_wingRootL.rot': [[0, Z3], [0.15, [4, 0, 3]], [0.25, [-3, 0, -2]], [0.35, [2, 0, 2]], [0.5, Z3]],
  'fx_wingRootR.rot': [[0, Z3], [0.17, [4, 0, -3]], [0.27, [-3, 0, 2]], [0.37, [2, 0, -2]], [0.52, Z3]],
  gunRot: [[0, Z3], [0.2, [0, 0, 1.2]], [0.5, Z3]] },
  events: [[0.2, 'bf', { feathers: 2 }], [0.15, 'bf', { snd: 'bifang_feather', fb: 'cloth', vol: 0.8 }]] });

// reload 2.8 s: the gate drops open, the spent feather cell comes out smoking, a new one in, the gate slapped shut + bell
function reloadClip(rare) {
  const tracks = {
    // lifted and rolled onto its right side: the underside, the gate and the feather cell face the eye (the cell is
    // the thing a reload shows, §1.7.1)
    gunPos: [[0, Z3], [0.12, [-0.06, 0.1, 0.035]], [0.66, [-0.065, 0.11, 0.04]], [0.74, [-0.06, 0.125, 0.035], 'out3'], [0.82, [-0.05, 0.09, 0.03]], [0.92, [-0.02, 0.03, 0.01]], [1, Z3]],
    gunRot: [[0, Z3], [0.12, [26, 24, -46]], [0.66, [28, 25, -50]], [0.74, [32, 25, -46], 'out3'], [0.82, [24, 20, -40]], [0.92, [8, 6, -12]], [1, Z3]],
    fx_cover: [[0, 0], [0.14, 0], [0.2, 1, 'outBack'], [0.74, 1], [0.79, 0, 'in3'], [1, 0]],
    'mag.pos': rare
      ? [[0, Z3], [0.2, Z3], [0.25, [-0.03, -0.05, 0.0], 'out3'], [0.34, [-0.16, -0.28, 0.05], 'in'], [0.4, [-0.16, -0.28, 0.05]], [0.5, [0, -0.16, 0], 'snap'], [0.6, [0, -0.01, 0], 'out3'], [0.63, Z3, 'outBack'], [1, Z3]]
      : [[0, Z3], [0.22, Z3], [0.3, [0, -0.07, 0.0], 'out3'], [0.42, [-0.05, -0.34, 0.06], 'in'], [0.5, [-0.05, -0.34, 0.06]], [0.6, [0, -0.06, 0], 'out3'], [0.64, Z3, 'outBack'], [1, Z3]],
    'mag.rot': rare
      ? [[0, Z3], [0.2, Z3], [0.34, [30, 40, 70]], [0.4, [30, 40, 70]], [0.5, Z3, 'snap'], [1, Z3]]
      : [[0, Z3], [0.22, Z3], [0.3, [4, 0, 6]], [0.42, [10, 25, 40]], [0.5, [10, -15, 20]], [0.6, [3, 0, 4]], [0.64, Z3], [1, Z3]],
  };
  // sound (card 匣、蓋、鈴): the weapon's own gate / feather-cell foley (stock foley as the fallback), the bell
  const S = (snd, fb, vol) => ({ snd, fb, vol });
  const events = [[0.06, 'anchorL', ['magwell', 0.16]], [0.08, 'poseL', 'magGrab'], [0.14, 'bf', S('bifang_gate_open', 'coverOpen')], [0.2, 'haptic', 'tick']];
  if (rare) {
    // §2.25: the left wing root bats the spent cell away, the new one is drawn in magnetically; the hand only slaps the gate
    tracks.fx_wingRootL = [[0, 0], [0.2, 0], [0.25, 0.42, 'out3'], [0.31, 0, 'in3'], [1, 0]];
    tracks['mag.vis'] = [[0, 1], [0.4, 1], [0.41, 0, 'snap'], [0.47, 0], [0.48, 1, 'snap'], [1, 1]];
    events.push([0.25, 'bf', S('bifang_cell_out', 'magOut')], [0.25, 'bf', S('bifang_swish', null, 0.5)], [0.26, 'bf', { puff: 1, sparkle: 6 }], [0.28, 'anchorL', ['rest', 0.1]],
      [0.48, 'bf', S('bifang_cell_in', 'magIn')], [0.5, 'glow', { to: 2, sec: 0.06 }], [0.6, 'glow', { to: 1, sec: 0.3 }], [0.64, 'ammo'], [0.68, 'anchorL', ['magwell', 0.08]]);
  } else {
    events.push([0.24, 'bf', S('bifang_cell_out', 'magOut')], [0.25, 'anchorL', ['mag', 0.06]], [0.32, 'bf', { puff: 1 }], [0.42, 'magDrop'], [0.48, 'snd', 'pouch'],
      [0.62, 'bf', S('bifang_cell_in', 'magIn')], [0.64, 'ammo'], [0.68, 'anchorL', ['magwell', 0.08]]);
  }
  events.push([0.78, 'bf', S('bifang_gate_close', 'coverClose')], [0.79, 'haptic', 'tick'], [0.8, 'bf', { bell: 0.5 }], [0.84, 'anchorL', ['grip_l', 0.14]], [0.86, 'poseL', 'wrap']);
  return { duration: rare ? 2.95 : 2.8, tracks, events, extra: rare ? 0.15 : 0 };
}
registerClip('bifang_reload', () => reloadClip(false));
registerClip('bifang_reload_rare', () => reloadClip(true));

// inspect 4.8 s (hold loops 0.06-0.16): CS2 slow tilt -> wings half open, a finger flicks a light feather that orbits the
// hand and clicks home -> roll to the left flank, light runs from the rachis into the barbs -> half-spread pose, freeze
registerClip('bifang_inspect', {
  duration: 4.8, loop: [0.06, 0.16],
  tracks: {
    gunPos: [[0, Z3], [0.06, [-0.03, 0.025, 0.03]], [0.11, [-0.04, 0.03, 0.026]], [0.16, [-0.03, 0.025, 0.03]], [0.28, [-0.02, 0.03, 0.02], 'inOut'], [0.5, [-0.02, 0.03, 0.02]],
      [0.58, [0.05, 0.035, 0.0], 'inOut'], [0.7, [0.05, 0.035, 0.0]], [0.8, [-0.02, 0.025, 0.02], 'inOut'], [0.96, [-0.02, 0.025, 0.02]], [1, Z3]],
    gunRot: [[0, Z3], [0.06, [8, 26, -24]], [0.11, [11, 34, -32]], [0.16, [8, 26, -24]], [0.28, [6, 14, -12], 'inOut'], [0.5, [6, 14, -12]],
      [0.58, [10, -38, 30], 'inOut'], [0.7, [12, -42, 33]], [0.8, [5, 20, -16], 'inOut'], [0.96, [5, 21, -17]], [1, Z3]],
    ...W2(wt([[0, 0], [0.27, 0], [0.33, 0.5, 'outBack'], [0.5, 0.5], [0.56, 0.2, 'inOut'], [0.76, 0.2], [0.81, 0.5, 'outBack'], [0.95, 0.5], [1, 0, 'in3']])),
    'fx_wingRootR.rot': [[0, Z3], [0.37, Z3], [0.385, [0, 0, -9], 'out3'], [0.41, [0, 0, 5]], [0.44, [0, 0, -2]], [0.47, Z3]],
    env: [[0, 0], [0.05, 1], [0.95, 1], [1, 0]],
  },
  // sound: the theme phrase (§1.12 檢視 2-3 s, plucked strings + bells), 「颯」 / feathers with the wings, the bell
  events: [[0.03, 'snd', 'cloth'], [0.04, 'bf', { snd: 'bifang_inspect', vol: 0.7 }], [0.27, 'anchorL', ['point', 0.22]], [0.33, 'bf', { wing: 'open', style: 'glow', count: 5, scale: 0.6, dur: 0.3, fan: false }],
    [0.33, 'bf', { snd: 'bifang_swish', fb: 'cloth', vol: 0.6 }], [0.38, 'bf', { sparkle: 8, orbit: 1.5 }], [0.38, 'haptic', 'tick'], [0.5, 'bf', { wing: 'close', dur: 0.3 }],
    [0.5, 'bf', { snd: 'bifang_feather', vol: 0.7 }], [0.56, 'anchorL', ['grip_l', 0.2]], [0.58, 'poseL', 'wrap'], [0.62, 'bf', { vein: 1 }], [0.62, 'glow', { to: 1.8, sec: 0.25 }],
    [0.7, 'glow', { to: 1, sec: 0.5 }], [0.8, 'bf', { wing: 'open', style: 'glow', count: 5, scale: 0.6, dur: 0.3, fan: false }], [0.8, 'bf', { snd: 'bifang_swish', vol: 0.45 }],
    [0.83, 'bf', { bell: 0.4 }], [0.95, 'bf', { wing: 'close', dur: 0.25 }], [0.95, 'bf', { snd: 'bifang_feather', vol: 0.5 }]],
});
// rare inspect (1/10): wings fully spread, a fire feather drifts into the left palm and becomes a 6 cm one-legged crane
// that stands for a second, then ash
registerClip('bifang_inspect_rare', {
  duration: 4.8, loop: [0.04, 0.12],
  tracks: {
    gunPos: [[0, Z3], [0.04, [-0.03, 0.025, 0.03]], [0.08, [-0.04, 0.03, 0.026]], [0.12, [-0.03, 0.025, 0.03]], [0.22, [0.03, -0.01, 0.02], 'inOut'], [0.78, [0.03, -0.012, 0.02]], [0.88, [-0.02, 0.02, 0.02], 'inOut'], [0.96, [-0.02, 0.02, 0.02]], [1, Z3]],
    gunRot: [[0, Z3], [0.04, [8, 26, -24]], [0.08, [11, 34, -32]], [0.12, [8, 26, -24]], [0.22, [-4, 6, 6], 'inOut'], [0.78, [-4, 6, 7]], [0.88, [5, 21, -17], 'inOut'], [0.96, [5, 21, -17]], [1, Z3]],
    ...W2(wt([[0, 0], [0.14, 0], [0.2, 1, 'outBack'], [0.74, 1], [0.84, 0.5, 'inOut'], [0.95, 0.5], [1, 0, 'in3']])),
    env: [[0, 0], [0.05, 1], [0.95, 1], [1, 0]],
  },
  events: [[0.03, 'snd', 'cloth'], [0.04, 'bf', { snd: 'bifang_inspect', vol: 0.7 }], [0.14, 'bf', { wing: 'open', style: 'cloisonne', count: 7, scale: 0.8, dur: 0.3 }],
    [0.14, 'bf', { snd: 'bifang_swish', fb: 'cloth', vol: 0.7 }], [0.16, 'bf', { sparkle: 10, cry: 0.4 }], [0.2, 'anchorL', ['palm', 0.3]], [0.3, 'bf', { feathers: 1 }],
    [0.42, 'bf', { mini: 1.1 }], [0.42, 'haptic', 'tick'], [0.74, 'bf', { wing: 'close', dur: 0.4 }],
    [0.74, 'bf', { snd: 'bifang_feather', vol: 0.7 }], [0.8, 'anchorL', ['grip_l', 0.2]], [0.83, 'poseL', 'wrap'], [0.86, 'bf', { bell: 0.4 }]],
});

// ------------------------------------------------------------------------------------- crosshair (§1.9 #2)
// xh_feather: three feather-shaped short arms (up, lower left, lower right: a crest / a footprint), a hollow diamond
// centre. Stroke only; arms take the hit colour (class "a"); ready = the shared 4 nodes; act = arms glow and spread.
// The diamond is wide enough to frame the always-on centre dot the HUD adds (settings.dot) with a clear gap.
registerCrosshair('xh_feather', {
  draw(gap, c) {
    const g0 = 5.6 + gap * 0.75, L = 9;
    const arm = (deg) => {
      const a = deg * D2R, ux = Math.sin(a), uy = -Math.cos(a), nx = -uy, ny = ux;
      const P = (s, o) => `${(ux * s + nx * o).toFixed(2)} ${(uy * s + ny * o).toFixed(2)}`;
      // a slim vane: quill at the inside, widest at 60 %, pointed tip; the rachis line through it
      return `<path class="a" d="M${P(g0, 0)} Q${P(g0 + L * 0.55, 2.6)} ${P(g0 + L, 0)} Q${P(g0 + L * 0.55, -1.9)} ${P(g0, 0)} Z" fill="none" stroke="${c}" stroke-width="1.3" stroke-linejoin="round"/>`
        + `<path class="a" d="M${P(g0 - 1, 0)} L${P(g0 + L * 0.82, 0)}" stroke="${c}" stroke-width="0.9"/>`;
    };
    return arm(0) + arm(120) + arm(240) + `<path d="M0 -4 L3.2 0 L0 4 L-3.2 0 Z" fill="none" stroke="${c}" stroke-width="1.1"/>`;
  },
  nodes: 26,
});
injectCSS('cf-xh-feather', `
.xh2.act path.a { filter: drop-shadow(0 0 2px currentColor); }
`);

// ------------------------------------------------------------------------------------- kill marks (§1.9 #8)
// km_bifang: a filled cloisonné emblem (~180 px, spec.scale 1.6) on a dark lacquer roundel with a gold rim: the
// one-legged crane in profile, S-neck, red crown and crest plumes, long vermilion beak, both wings raised as rows of
// enamel feather plates (teal / vermilion gradients, gold wire edges, a bevel highlight), a fan of tail plumes, one
// gold leg with three toes over a cloud scroll. Beats: (1) gold strokes draw the outlines (0-0.45 s); (2) the plates
// fill with enamel (0.45-0.8); (3) gold glow + gold-leaf glints (0.8-1.0); (4) 點睛: the eye flares, a ring snaps
// out (1.0-1.15). km_guiche: the nine-headed night bird in black lacquer and silver wire, aubergine / ink-teal
// plates shading to cold-teal tips, nine violet eyes (the centre one large flashes).
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
/** lens (feather plate) from a to b, half width w, its widest point at `belly` (0..1) */
function lensPath(a, b, w, belly = 0.45) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const m = [a[0] + dx * belly, a[1] + dy * belly];
  const p = new Path2D();
  p.moveTo(a[0], a[1]);
  p.quadraticCurveTo(m[0] + nx * w * 2, m[1] + ny * w * 2, b[0], b[1]);
  p.quadraticCurveTo(m[0] - nx * w * 2, m[1] - ny * w * 2, a[0], a[1]);
  p.closePath();
  return { p, a, b, n: [nx, ny], m };
}
/** tapered thick curve through pts (quadratic chain), widths w0 -> w1 */
function taper(pts, w0, w1) {
  const L = [], R2 = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.max(0, i - 1)], r = pts[Math.min(pts.length - 1, i + 1)];
    let dx = r[0] - q[0], dy = r[1] - q[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const h = (w0 + (w1 - w0) * i / (pts.length - 1)) / 2;
    L.push([p[0] - dy * h, p[1] + dx * h]); R2.push([p[0] + dy * h, p[1] - dx * h]);
  }
  const all = [...L, ...R2.reverse()], p = new Path2D();
  all.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}
const bez = (p0, p1, p2, n = 10) => { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]); } return out; };
const _kmCache = {};
function emblem(nine) {
  if (_kmCache[nine]) return _kmCache[nine];
  const E = { wings: [], tail: [], heads: [], necks: [], cells: [], glints: [] };
  // wings (far wing first: drawn behind), each a fan of 7 plates rooted along the arm, plus a covert band over the arm
  for (const [S, W, a0, a1, L0, far] of [[[150, 118], [196, 70], -78, 8, 70, true], [[132, 122], [160, 66], -112, -28, 76, false]]) {
    const wing = { plates: [], far };
    for (let i = 0; i < 7; i++) {
      const u = i / 6, root = [S[0] + (W[0] - S[0]) * (0.25 + 0.75 * u), S[1] + (W[1] - S[1]) * (0.25 + 0.75 * u)];
      const ang = (a0 + (a1 - a0) * u) * D2R, len = L0 * (0.62 + 0.38 * Math.sin(Math.PI * (0.25 + 0.6 * u)));
      wing.plates.push({ ...lensPath(root, [root[0] + Math.cos(ang) * len, root[1] + Math.sin(ang) * len], 6.2 - u * 0.8, 0.4), k: i % 2 });
    }
    wing.arm = taper(bez(S, [(S[0] + W[0]) / 2 - 8, (S[1] + W[1]) / 2 - 6], W, 8), 15, 8);
    E.wings.push(wing);
    E.glints.push([W[0] - 4, W[1] + 2], [W[0] + 18, W[1] - 30]);
  }
  // tail plumes: a fan down and back
  for (let i = 0; i < 5; i++) {
    const a = (18 + i * 12) * D2R, root = [168, 160], len = 70 - Math.abs(i - 2) * 9;
    E.tail.push({ ...lensPath(root, [root[0] + Math.cos(a) * len, root[1] + Math.sin(a) * len], 5.2, 0.5), k: i % 2 });
  }
  // body: a full teardrop, breast forward (left), into the tail
  const body = new Path2D();
  body.moveTo(104, 146); body.bezierCurveTo(106, 120, 146, 112, 172, 140); body.bezierCurveTo(186, 154, 176, 172, 150, 176); body.bezierCurveTo(124, 180, 102, 168, 104, 146); body.closePath();
  E.body = body;
  // 赤文: three cloisonné cells across the body (vermilion / teal) between gold wires
  E.cells.push({ p: lensPath([118, 150], [150, 132], 6, 0.5).p, c: 0 }, { p: lensPath([128, 164], [166, 150], 5.5, 0.5).p, c: 1 }, { p: lensPath([146, 172], [172, 158], 4, 0.5).p, c: 0 });
  if (!nine) {
    const neck = [[116, 136], [96, 118], [104, 98], [96, 82], [82, 72]];
    E.necks.push(taper([...bez(neck[0], neck[1], neck[2], 6), ...bez(neck[2], neck[3], neck[4], 6).slice(1)], 22, 12));
    const beak = new Path2D(); beak.moveTo(72, 64); beak.lineTo(20, 86); beak.lineTo(70, 72); beak.closePath();
    const beakLo = new Path2D(); beakLo.moveTo(70, 70); beakLo.lineTo(22, 86); beakLo.lineTo(72, 76); beakLo.closePath();
    const crown = new Path2D(); crown.arc(80, 68, 11.5, Math.PI * 1.08, Math.PI * 1.92); crown.closePath();
    const crest = [lensPath([86, 60], [112, 30], 3.4, 0.5).p, lensPath([88, 62], [118, 44], 3, 0.5).p, lensPath([84, 58], [100, 28], 2.6, 0.5).p];
    E.heads.push({ x: 80, y: 68, r: 11.5, eye: [76, 65], big: true, beak, beakLo, crown, crest });
    const leg = new Path2D(); leg.moveTo(136, 174); leg.lineTo(146, 176); leg.lineTo(148, 198); leg.lineTo(142, 226); leg.lineTo(137, 226); leg.lineTo(141, 199); leg.closePath();
    E.legs = [leg];
    E.toes = [[[140, 226], [114, 232]], [[140, 226], [120, 241]], [[140, 226], [160, 233]]];
    E.knee = [[144.5, 198]];
  } else {
    for (let i = 0; i < 9; i++) {
      const a = (-150 + i * 15) * D2R, hx = 108 + Math.cos(a) * 62, hy = 120 + Math.sin(a) * 58;
      const b = [112 + i * 1.5, 132 - i * 0.5], c = [b[0] + (hx - b[0]) * 0.45 + (i % 2 ? 6 : -6), b[1] + (hy - b[1]) * 0.55];
      E.necks.push(taper(bez(b, c, [hx, hy], 8), 8, 5));
      const big = i === 4, r = big ? 9 : 6.2;
      const d = [Math.cos(a), Math.sin(a)], beak = new Path2D();
      beak.moveTo(hx + d[0] * r * 0.6 - d[1] * r * 0.5, hy + d[1] * r * 0.6 + d[0] * r * 0.5);
      beak.quadraticCurveTo(hx + d[0] * r * 2.2, hy + d[1] * r * 2.2, hx + d[0] * r * 2 + d[1] * r * 0.7, hy + d[1] * r * 2 - d[0] * r * 0.7 + 3);
      beak.lineTo(hx + d[0] * r * 0.6 + d[1] * r * 0.5, hy + d[1] * r * 0.6 - d[0] * r * 0.5); beak.closePath();
      E.heads.push({ x: hx, y: hy, r, eye: [hx + d[0] * r * 0.25, hy + d[1] * r * 0.25 - 1], big, beak });
    }
    const legs = [];
    for (const x0 of [132, 152]) { const l = new Path2D(); l.moveTo(x0, 172); l.lineTo(x0 + 7, 173); l.lineTo(x0 + 6, 200); l.lineTo(x0 + 2, 222); l.lineTo(x0 - 2, 222); l.lineTo(x0 + 1, 200); l.closePath(); legs.push(l); }
    E.legs = legs;
    E.toes = [[[130, 222], [112, 228]], [[130, 222], [140, 230]], [[150, 222], [134, 229]], [[150, 222], [166, 229]]];
    E.knee = [];
  }
  // cloud scroll under the foot (祥雲)
  const cloud = new Path2D();
  cloud.moveTo(88, 238); cloud.bezierCurveTo(96, 226, 112, 230, 112, 238); cloud.bezierCurveTo(118, 228, 136, 232, 138, 240); cloud.bezierCurveTo(146, 230, 166, 232, 168, 240); cloud.bezierCurveTo(176, 232, 190, 236, 188, 244);
  E.cloud = cloud;
  return (_kmCache[nine] = E);
}
function drawCraneMark(ctx, S, t, o, nine) {
  const L = nine ? LOOKS.guiche : LOOKS.bifang;
  const gold = nine ? '#cfd3d8' : '#f0c25a', goldD = nine ? '#6c7178' : '#9a6a1c';
  const A = nine ? ['#7a3a80', '#3a1440'] : ['#29b3a8', '#0c4d4a'], B = nine ? ['#2d6a78', '#0c2028'] : ['#f0582f', '#7a1410'];
  const tip = nine ? '#3fffe0' : null, porc = nine ? ['#2e2832', '#0e0b10'] : ['#fffaf0', '#cfc6b2'];
  const eyeC = nine ? '#c58bff' : '#ffb43a', glowC = nine ? '#b54bff' : '#ffc74a';
  const p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
  const E = emblem(nine), k = S / 256;
  ctx.clearRect(0, 0, S, S);
  ctx.save(); ctx.scale(k, k);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const dash = (path, u, len = 600) => { ctx.setLineDash([len * u, len]); ctx.stroke(path); ctx.setLineDash([]); };
  const grad = (a, b, c0, c1) => { const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; };
  // final kill: 12 rays behind
  if (o.final) { ctx.save(); ctx.globalAlpha = 0.4 * p2; ctx.strokeStyle = gold; ctx.lineWidth = 3; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + t * 0.4; ctx.beginPath(); ctx.moveTo(128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80); ctx.lineTo(128 + Math.cos(a) * 126, 128 + Math.sin(a) * 126); ctx.stroke(); } ctx.restore(); }
  // roundel: dark lacquer disc + gold rim (the rim draws in with the strokes)
  if (p2 > 0) {
    ctx.save(); ctx.globalAlpha = 0.88 * p2;
    const rg = ctx.createRadialGradient(128, 120, 10, 128, 128, 112);
    rg.addColorStop(0, nine ? '#241a2c' : '#3a1a12'); rg.addColorStop(0.7, nine ? '#0e0a12' : '#160806'); rg.addColorStop(1, 'rgba(10,6,6,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(128, 128, 112, 0, Math.PI * 2); ctx.fill();
    // flame-feather tongues fanning behind the bird (beat 3 brightens them)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const a = (-170 + i * 20) * D2R + Math.sin(t * 3 + i) * 0.03, r0 = 60, r1 = 104 + (i % 2) * 6;
      const lp = lensPath([128 + Math.cos(a) * r0, 132 + Math.sin(a) * r0], [128 + Math.cos(a) * r1, 132 + Math.sin(a) * r1], 7, 0.35);
      ctx.fillStyle = grad(lp.a, lp.b, nine ? 'rgba(170,90,255,0.6)' : 'rgba(255,140,50,0.7)', 'rgba(255,60,20,0)');
      ctx.globalAlpha = (0.5 + 0.5 * p3) * p2; ctx.fill(lp.p);
    }
    ctx.restore();
  }
  ctx.save(); ctx.strokeStyle = gold; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.arc(128, 128, 110, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p1); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.globalAlpha = p1; ctx.beginPath(); ctx.arc(128, 128, 103, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  // a plate: enamel gradient root -> tip (+ a cold tip for 鬼車), gold edge, a bevel highlight on one side, gold rachis
  const platePaint = (pl, cols, alpha) => {
    ctx.save(); ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(pl.a[0], pl.a[1], pl.b[0], pl.b[1]);
    g.addColorStop(0, cols[0]); g.addColorStop(tip ? 0.7 : 1, cols[1]); if (tip) g.addColorStop(1, tip);
    ctx.fillStyle = g; ctx.fill(pl.p);
    ctx.clip(pl.p);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(pl.a[0] + pl.n[0] * 2, pl.a[1] + pl.n[1] * 2); ctx.quadraticCurveTo(pl.m[0] + pl.n[0] * 9, pl.m[1] + pl.n[1] * 9, pl.b[0], pl.b[1]); ctx.stroke();
    ctx.restore();
  };
  const fillA = p2;
  const parts = [];       // [path, kind] for the outline pass
  // wings (far one dimmer, behind the body)
  for (const w of E.wings) {
    for (const pl of w.plates) { if (fillA > 0) platePaint(pl, pl.k ? B : A, fillA * (w.far ? 0.8 : 1)); parts.push([pl.p, 1]); }
    if (fillA > 0) { ctx.save(); ctx.globalAlpha = fillA; ctx.fillStyle = grad([0, 60], [0, 130], porc[0], porc[1]); ctx.fill(w.arm); ctx.restore(); }
    parts.push([w.arm, 1.4]);
  }
  for (const pl of E.tail) { if (fillA > 0) platePaint(pl, pl.k ? B : A, fillA); parts.push([pl.p, 1]); }
  // legs, toes (gold)
  if (fillA > 0) { ctx.save(); ctx.globalAlpha = fillA; ctx.fillStyle = grad([0, 170], [0, 230], gold, goldD); for (const l of E.legs) ctx.fill(l); ctx.restore(); }
  for (const l of E.legs) parts.push([l, 1]);
  // body + neck(s), porcelain / black lacquer, with the 赤文 cells
  if (fillA > 0) {
    ctx.save(); ctx.globalAlpha = fillA;
    const bg = ctx.createRadialGradient(124, 132, 6, 138, 148, 52); bg.addColorStop(0, porc[0]); bg.addColorStop(1, porc[1]);
    ctx.fillStyle = bg; ctx.fill(E.body); for (const n of E.necks) ctx.fill(n);
    E.cells.forEach((c) => { ctx.fillStyle = c.c ? B[0] : A[0]; ctx.fill(c.p); });
    ctx.restore();
  }
  parts.push([E.body, 1.6]); for (const n of E.necks) parts.push([n, 1.3]); for (const c of E.cells) parts.push([c.p, 0.8]);
  // heads: beak, crown, crest, the head disc
  for (const h of E.heads) {
    const hp = new Path2D(); hp.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    if (fillA > 0) {
      ctx.save(); ctx.globalAlpha = fillA;
      if (h.crest) { ctx.fillStyle = '#d8241a'; for (const c of h.crest) ctx.fill(c); }
      ctx.fillStyle = nine ? '#3fbfb0' : '#e8452a'; ctx.fill(h.beak);
      if (h.beakLo) { ctx.fillStyle = '#b02a16'; ctx.fill(h.beakLo); }
      ctx.fillStyle = grad([h.x, h.y - h.r], [h.x, h.y + h.r], porc[0], porc[1]); ctx.fill(hp);
      if (h.crown) { ctx.fillStyle = '#d8241a'; ctx.fill(h.crown); }
      ctx.restore();
    }
    parts.push([hp, 1.2], [h.beak, 1]); if (h.crest) for (const c of h.crest) parts.push([c, 0.8]);
  }
  // outline pass: gold wire drawn in (beat 1), glowing once filled (beat 3)
  ctx.save();
  ctx.shadowColor = glowC; ctx.shadowBlur = 14 * p3;
  ctx.strokeStyle = gold;
  parts.forEach(([p, w], i) => { ctx.lineWidth = 1.9 * w; dash(p, Math.min(1, Math.max(0, p1 * 1.5 - (i % 6) * 0.08))); });
  for (const [a, b] of E.toes) { ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(a[0] + (b[0] - a[0]) * p1, a[1] + (b[1] - a[1]) * p1); ctx.stroke(); }
  for (const kn of E.knee) if (p2 > 0) { ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(kn[0], kn[1], 4 * p2, 0, Math.PI * 2); ctx.fill(); }
  ctx.lineWidth = 2; ctx.globalAlpha = p1; dash(E.cloud, p1, 400);
  ctx.restore();
  // beat 3: gold-leaf glints twinkling over the wings
  if (p3 > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    E.glints.forEach(([x, y], i) => {
      const s = (4 + 3 * Math.sin(t * 9 + i * 1.7)) * p3;
      ctx.fillStyle = 'rgba(255,240,200,0.9)';
      ctx.beginPath(); ctx.moveTo(x, y - s * 2); ctx.lineTo(x + s * 0.4, y); ctx.lineTo(x, y + s * 2); ctx.lineTo(x - s * 0.4, y); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - s * 2, y); ctx.lineTo(x, y + s * 0.4); ctx.lineTo(x + s * 2, y); ctx.lineTo(x, y - s * 0.4); ctx.closePath(); ctx.fill();
    });
    ctx.restore();
  }
  // beat 4: 點睛 -- the eye(s) flare with the ding, a ring snaps out (headshot: bigger flare + the element ring)
  const fl = Math.sin(Math.PI * p4) + (o.head ? Math.max(0, 1 - Math.abs(t - 1.1) / 0.08) * 0.8 : 0);
  for (const h of E.heads) {
    const [x, y] = h.eye, r = h.big ? 3.4 : 2.2;
    ctx.fillStyle = p3 > 0 || fl > 0 ? eyeC : '#3a2a26';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (fl > 0.01 && h.big) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const R0 = 14 + fl * 22;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, R0);
      gr.addColorStop(0, `rgba(255,255,255,${Math.min(1, fl).toFixed(3)})`); gr.addColorStop(0.35, nine ? 'rgba(200,140,255,0.5)' : 'rgba(255,200,90,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - R0, y - R0, R0 * 2, R0 * 2);
      const Lr = 10 + fl * (o.head ? 34 : 22);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.globalAlpha = Math.min(1, fl);
      ctx.beginPath(); ctx.moveTo(x - Lr, y); ctx.lineTo(x + Lr, y); ctx.moveTo(x, y - Lr * 0.7); ctx.lineTo(x, y + Lr * 0.7); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6 + p4 * 18, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  if (o.head && t > 1.0) {
    const u = Math.min(1, (t - 1.0) / 0.17);
    ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = o.tint || L.xh; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.arc(128, 128, 60 + 64 * u, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}
registerKillMark('km_bifang', { scale: 1.6, draw(ctx, S, t, o) { drawCraneMark(ctx, S, t, o, false); } });
registerKillMark('km_guiche', { scale: 1.6, draw(ctx, S, t, o) { drawCraneMark(ctx, S, t, o, true); } });

// colour-dependent element tag for damage numbers / DOT (fire for 畢方, the purple 'shock' skin for 鬼車)
LOOKS.bifang.elem = 'fire';
LOOKS.guiche.elem = 'shock';
