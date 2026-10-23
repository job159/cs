// M03 畢方．焚翼 Bifang Pyrewing ／ 鬼車．晦翼 Guiche Gloomwing — 神兵 光暗雙生 (docs/PREMIUM_WEAPONS.md M03, §2.25,
// §2.26). Mechanics on the specials v2 engine (registerSpecial 'bifang' + four skills) and the whole presentation:
// viewmodel driver, clips, light wings, crosshair, kill marks. Effect primitives: bifang_fx.js. Model:
// tools/assets/weapons/bifang.mjs (guiche.mjs = the twin). The twin keeps every number; defs.js special.look picks
// the names / colours / signature (LOOKS in bifang_fx.js).
//
//   fire        8 pellets x 18 (hitscan for the feel; drawn as short gold feather streaks, 2 of them shed fire feathers
//               = TRAIL_DROP), 冠羽扇 crest fan at the beak, the lower jaw kicks 4°; every pellet hit stacks 灼羽 (≤ 5,
//               8/s each, 3 s, DOT ticks every 0.5 s, pips over the target) and sends up a small fire feather
//   ◎ 焚翼      ≥ 40 % 羽能: bones swing open 69°, cloisonné light wings spread (outBack 0.25 s), 6 s or ◎ again, 10 %/s:
//               3 m burn 40/s, slows cleared / ignored, +10 % speed, teammates within 4 m cleansed (every 6 s).
//               First person the fans grow from the bone tips and open upwards (left fan to the upper left, right to
//               the upper right): the centre 20 % stays clear. Once 40 % is spent the bones flick and the fans flare
//               ("fold now"); folding then fires 焚天光 (鬼車: 晦天墜 falling from the sky): 600 + 120/s for 1.2 s,
//               30 m x 1.4 m, piercing, rings racing down the shaft, a feather helix, a pillar where it ends, a scorch line
//   ★ 羽落      25 %: 12 burning feather lances in 6 m round the crosshair over 1.2 s, 60 + 2 stacks each (aim 'target':
//               a zombie under the crosshair pins the circle to its feet)
//   ★ held      畢方降臨 (天火 from damage): card, sigil 10 m, pillar, the porcelain one-legged crane (≈ 6 m tall, the gun's
//               cloisonné light wings on its wrists: ≈ 9 m span) descends on the mark (≥ 8 m away so it is seen), one
//               wing beat (60° cone, 300 + 3 stacks, knockback; the cone starts 5 m behind the crane so it covers the
//               horde round the mark and blows it away from the caster), a 25 m low dive leaving a 4 s fire path
//               (30/s), bursts into fire feathers. 鬼車夜啼: the nine-headed bird circles, screams (zombies in 10 m
//               flee 1.5 s, 300), then dives
//   crisis 羽衣  the light wings wrap the player (cocoon) and burst into feathers (crisis.js does the blocking)
//   kill        KE_PLUME (鬼車: KE_SOUL ghost-fire wisp to the gun, +2 % 晦羽); km_bifang / km_guiche; 鬼車's 灼羽 burns
//               violet (hit info.burnFx 'ghostfire', fx/zfx.js)
// Sound cues are named per §1.12 (bifang_* / ready_*); the twin plays the same cues -4 semitones with an echo.
import * as THREE from 'three';
import { registerSpecial, registerSkill, startSkill, endSkill, meterAdd, canCast, chargeState } from '../specials.js';
import { registerClip } from '../../player/clips.js';
import { registerCrosshair, injectCSS } from '../../ui/crosshairs.js';
import { registerKillMark } from '../../ui/killmarks.js';
import { FRAME, DECAL } from '../../fx/fx.js';
import { haptic, clipComfort } from '../arsenal.js';
import { LOOKS, lookOf, sfx, CRANE_WRIST, crestFan, veinTongue, veinEmber, featherTracer, plume, emberHit, killPlume, soulWisp, fallingFeather, FirePath, craneGeo, nineHeadGeo, BurnPips } from './bifang_fx.js';

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
      fan, alpha: opts.alpha ?? (cl ? 0.62 : 0.92), guardMin: 0.2 });
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
    style: 'cloisonne', core: L.wing.core, tip: L.wing.tip, enamel: L.wing.enamel, gold: L.wing.gold, open: false });
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
  if (!e) { e = { n: 0, until: 0, acc: 0, tick: 0.5 }; b.set(z, e); }
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
      // a DOT tick: no knockback, no blood (burn), the zombie's burning shell flickers; numbers, no hit marker
      const info = { amount, part: 'body', point, dir: UP, knock: 0.01, stagger: 0, weapon: ws.def.id, shooter: g.localId, burn: true, burnFx: L.burnFx, skill: 'bf_dot', elem: L.elem };
      const res = z.damage(info);
      // DOT feeds 天火 like any damage, except while the ultimate itself runs (v2Hit's rule)
      if (res?.damage > 0 && ![...s.run].some((k) => k.slot === 'ult' && !k.done)) meterAdd(ws, 'ult', res.damage / per * 100, true);
      if (res?.killed) { g.hud?.onHit?.(info, res, z); killFx(ws, g, L, z, point); s.burn.delete(z); continue; }
      if (res?.damage > 0.5 && g.hud?.settings?.damageNumbers !== false) g.hud?.nums?.add?.(point, res.damage, { elem: L.elem, skin: 'mythic', target: z });
    }
    if (list.length < 12 && z.pos.distanceTo(g.camera.position) < 32) list.push({ pos: z.center(new THREE.Vector3()).add(_a.set(0, 0.88, 0)), n: e.n, color: L.xh });
  }
  if (list.length || pips) (pips ||= new BurnPips(g)).update(list);
}

/** Kill feedback in the world: KE_PLUME, or the twin's KE_SOUL wisp back to the gun (+2 % 晦羽 when it lands). */
function killFx(ws, g, L, z, point) {
  const p = point || z?.center?.(new THREE.Vector3());
  if (!p) return;
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
      plume(g, L, info.point, 'bfp' + g.localId);
      emberHit(g, L, info.point, info.dir);
      // per-shot tally for the weight of the shot (onFire): pellets per target, kills
      if (z) s.shotHit.set(z, (s.shotHit.get(z) || 0) + 1);
      if (res.killed) s.shotKills++;
    }
    if (res.killed) killFx(ws, g, L, z, info.point);
  },
  onFire(ws, ctx) {
    const g = ctx.game, s = ws.sp, L = lookOf(ws.def), vm = g.vm;
    s.shot++;
    if (mine(g, ws)) { crestFan(g, L, s.shot); s.beakKick = 1; }
    sfx(g, L, 'bifang_fire', 'fire_burst', { volume: 0.16 });
    // weight of the shot: a point-blank volley (5+ pellets in one body) or a kill stops time for a beat, harder
    // with every extra kill; kills also get their own bell-and-flame cue
    let most = 0;
    for (const n of s.shotHit.values()) most = Math.max(most, n);
    const kills = s.shotKills;
    s.shotHit.clear(); s.shotKills = 0;
    if (kills > 0 || most >= 5) {
      g.arsenal?._clipEvent?.('hitstop', kills > 0 ? 40 + 14 * Math.min(3, kills - 1) : 26);
      g.arsenal?._clipEvent?.('shake', kills > 0 ? 0.1 + 0.06 * Math.min(3, kills) : 0.06);
      if (kills > 0) { sfx(g, L, 'bifang_kill', 'kill_confirm_thud', { volume: 0.5 + 0.12 * Math.min(3, kills) }); if (mine(g, ws)) { g.vm.glowTo(1.7, 0.04); later(ws, 0.08, () => g.vm?.glowTo(1, 0.25)); } }
      else sfx(g, L, 'bifang_hit_heavy', 'melee_heavy_hit', { volume: 0.4 });
    }
    // feather streaks: the pellets that hit (their real points) + rays inside the cone for the rest (visual only)
    const from = vm?.socketApparent?.('muzzle', new THREE.Vector3()) || ctx.origin.clone();
    const hits = s.hitPts.splice(0);
    const spread = (g.arsenal?.spreadDeg?.() ?? 4) * D2R;
    _b.set(1, 0, 0).applyQuaternion(g.camera.quaternion); _c.set(0, 1, 0).applyQuaternion(g.camera.quaternion);
    for (let i = 0; i < 5; i++) {
      let end = hits[i];
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
    // ready edge: the twin has no sample of its own yet -> the original's bell -4 st + echo (§1.12)
    const ready = canCast(ws, 'ult').ok, held = g.arsenal?.current === ws, L = lookOf(ws.def);
    if (ready && !s.wasReady && held) {
      const cue = ws.def.premium?.ready?.sfx;
      if (cue && g.audio?.has && !g.audio.has(cue)) sfx(g, L, 'ready_bifang', 'killmark_ding', { volume: 0.8, pitch: 0.75 });
      if (mine(g, ws)) { g.vm.setPart('fx_wingRoot*', 0.14, 0.3, 0.05); g.vm.glowTo(2.2, 0.08); later(ws, 0.15, () => g.vm?.glowTo(1, 0.4)); vmSparkle(ws, 12); }
    }
    s.wasReady = ready;
  },
  dispose(ws, g) { dropWings(ws.sp); worldInspect(ws, g, 0, true); pips?.update([]); },
  /** Clip events: ['bf', { wing: 'open' | 'close', style, count, scale, dur } | { sparkle } | { feathers } | { orbit } | { puff } | { vein } | { cry } | { mini }] */
  onClipEvent(ws, name, arg, g) {
    if (name !== 'bf' || !arg) return;
    const s = ws.sp, L = lookOf(ws.def);
    if (arg.wing === 'open') vmWings(g, ws, arg);
    else if (arg.wing === 'close') dropWings(s, arg.dur ?? 0.25, g.time);
    if (arg.sparkle) vmSparkle(ws, arg.sparkle);
    if (arg.feathers) vmFeathers(g, ws, L, arg.feathers);
    if (arg.orbit) s.orbit = { t: 0, dur: arg.orbit };
    if (arg.puff) magPuff(g);
    if (arg.vein) { veinTongue(g, L, 'r', L.root, 0.35, true); veinTongue(g, L, 'l', L.root, 0.35, true); }
    if (arg.cry) sfx(g, L, 'bifang_crane_cry', null, { volume: arg.cry });
    if (arg.bell) sfx(g, L, 'bifang_bell', 'magIn', { volume: arg.bell });
    if (arg.mini) miniCrane(g, ws, L, arg.mini);
  },
});

// ------------------------------------------------------------------------------------- viewmodel driver
function view(ws, g, dt) {
  const s = ws.sp, vm = g.vm, w = vm.weapon, L = lookOf(ws.def), ar = g.arsenal;
  const v = s.view || (s.view = { w: null, t: 0, ember: 0.5 });
  if (v.w !== w) {
    v.w = w; v.t = 0; s.beakKick = 0; s.idleT = 0;
    dropWings(s);
    for (const n of ['fx_wingRootL', 'fx_wingRootR']) { const st = ps(vm, n); st.tw = null; st.v = 0; }
  }
  v.t += dt;
  if (s.vmw && (s.vmw.gun !== w || s.vmw.closeAt > 0 && g.time >= s.vmw.closeAt)) dropWings(s);
  const cs = chargeState(ws, g) || {};
  const casting = !!(s.wingK && !s.wingK.done) || [...(s.run || [])].some((k) => !k.done && k.id === 'bifang_descent');
  // wing roots: a ±1° breath at rest, lifted 10° while ready (蓄滿必須有變形), spread by the skills (setPart tweens)
  for (const n of ['fx_wingRootL', 'fx_wingRootR']) {
    const st = ps(vm, n);
    if (st.tw || casting) continue;
    const base = cs.ready ? 0.14 : 0;
    st.v += (base + 0.014 + 0.014 * Math.sin(v.t * 2.24 + (n.endsWith('R') ? 0.9 : 0)) - st.v) * Math.min(1, dt * 6);
  }
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
        g.vm.setPart('fx_wingRoot*', 1.14, 0.07, 0); later(ws, 0.09, () => g.vm?.setPart('fx_wingRoot*', 1, 0.22, 0));
        for (const w of ws.sp.vmw?.list || []) w.set({ glow: 1.6 });
        vmSparkle(ws, 18); g.vm.glowTo(2.2, 0.05); later(ws, 0.12, () => g.vm?.glowTo(1.35, 0.3));
      }
    }
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
    if (mine(g, ws)) { g.vm.setPart('fx_wingRoot*', 0, 0.22); dropWings(s, 0.2, g.time); }
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
    k.dur = (B.dur ?? 1.2) + 0.35;
    const eye = k.pos.clone(), dir = k.dir.clone();
    const hit = g.world?.collision?.raycast(eye, dir, B.len ?? 30);
    const len = hit ? hit.dist : B.len ?? 30;
    d.a = eye; d.b = eye.clone().addScaledVector(dir, len); d.tick = 0.2; d.half = (B.width ?? 1.4) / 2;
    const near = eye.clone().addScaledVector(dir, Math.min(2.5, len));
    if (L.id === 'guiche') {
      // 晦天墜: a ghost-fire meteor beam falling slantwise from the sky onto the line; a purple seam along the ground
      const sky = d.sky = eye.clone().addScaledVector(dir, len * 0.35).add(_a.set(-dir.z * 6, 18, dir.x * 6));
      d.beams = [fx?.beam?.(sky, d.b.clone(), { core: L.beamCore, glow: L.beamGlow, wCore: 0.28, wGlow: 1.3, life: B.dur ?? 1.2, shrink: 0.55, scroll: 4 }),
        fx?.beam?.(near, d.b.clone(), { core: L.flame, glow: L.beamGlow, wCore: 0.1, wGlow: 0.6, life: B.dur ?? 1.2, shrink: 0.6, scroll: -3 })];
      fx?.sigils?.pillar?.(d.b, { radius: 1.1, height: 10, color: L.beamCore, color1: L.beamGlow, life: 0.6 });
    } else {
      // 焚天光: white core / gold sheath from the beak along the aim (thin near the eye: the screen stays readable)
      const m = k.muzzle(new THREE.Vector3());
      d.beams = [fx?.beam?.(near, d.b.clone(), { core: L.beamCore, glow: L.beamGlow, wCore: 0.34, wGlow: 1.6, life: B.dur ?? 1.2, shrink: 0.5, scroll: 3 }),
        fx?.beam?.(near, d.b.clone(), { core: [L.beamGlow[0] * 0.5, L.beamGlow[1] * 0.5, L.beamGlow[2] * 0.5], glow: [L.flame[0] * 0.12, L.flame[1] * 0.12, L.flame[2] * 0.12], wCore: 0.9, wGlow: 3.2, life: (B.dur ?? 1.2) * 0.8, shrink: 0.7, scroll: -2 }),
        fx?.beam?.(m, near.clone(), { core: L.beamCore, glow: L.beamGlow, wCore: 0.07, wGlow: 0.5, life: B.dur ?? 1.2, shrink: 0.5, scroll: 3 })];
    }
    // gold scorch line along the floor under the beam, feathers drifting off it, a flash where it ends
    const floor = (p) => g.world?.collision?.floorBelow?.(_a.set(p.x, p.y + 0.3, p.z), 0.6, 4);
    for (let s = 2; s < len; s += 1.6) {
      const p = _b.copy(eye).addScaledVector(dir, s), fy = floor(p);
      if (Number.isFinite(fy) && p.y - fy < 2.4) fx?.decals?.add(_c.set(p.x, fy, p.z), UP, { frame: DECAL.scorch, size: 0.7, aspect: 0.35, along: dir, alpha: 0.85, life: 4, fade: 1.5, fit: false });
    }
    fx?.motes?.trailDrop?.(near, d.b, L.moteKind, { owner: 'bfbeam' + k.by, spacing: 1.6, max: 18, color: L.mote, color2: L.mote2, size: 0.13 });
    fx?.sparkBurst?.(d.b, { color: L.root, color1: L.flame, count: 24, speed: 9, glow: 1 });
    fx?.lights?.flash?.(d.b, L.light, 60, 12, 0.5);
    // the shaft the rings / helix ride: the beam itself (鬼車: the sky line)
    d.s0 = L.id === 'guiche' ? d.sky : near.clone(); d.s1 = d.b.clone();
    beamRings(g, L, d.s0, d.s1, 0);
    beamHelix(g, L, d.s0, d.s1, k.rng, 46);
    fx?.sigils?.pillar?.(d.b, { radius: 0.9, height: 7, color: L.beamCore, color1: L.flame, life: 0.55, motes: 8 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; fx?.knockDust?.(_a.set(d.b.x + Math.cos(a), d.b.y, d.b.z + Math.sin(a)), _c.set(Math.cos(a) * 4, 0, Math.sin(a) * 4), 0.8); }
    d.ring = 0.16;
    sfx(g, L, 'bifang_beam', 'explosion_small', k.local ? { volume: 0.9 } : { pos: d.b, volume: 0.8 });
    if (!k.local) return;
    hurtSeg(k, d.a, d.b, d.half, B.dmg ?? 600, { knock: 5, stagger: 1, burn: true, burnAdd: 2 });
    g.addShake?.(clipComfort.shake ? 0.3 : 0);
    g.arsenal?._clipEvent?.('tint', { rgb: '#ffffff', a: 0.2, in: 0.03, hold: 0.06, out: 0.3 });
    g.arsenal?._clipEvent?.('haptic', 'thud');
    g.arsenal?.fovKick?.(-3, 0.35);
    if (clipComfort.overlay) fx?.overlay?.radial?.(0.45, 0.35, { color: L.root });
    if (mine(g, k.ws)) { gunClip(g, k.ws, 'bifang_beam_kick'); beamFlare(g, L); g.vm.glowTo(2.4, 0.04); later(k.ws, 0.2, () => g.vm?.glowTo(1, 0.6)); }
  },
  update(k, dt) {
    const d = k.data, B = k.def.special.beam || {};
    if (k.t > (B.dur ?? 1.2)) return;
    if (k.rng() < 0.6) k.game.fx?.sparkBurst?.(d.b, { color: d.L.root, color1: d.L.flame, count: 2, speed: 3, glow: 0 });
    // the beam keeps pulsing: a ring wave every 0.16 s, a few feathers peeling off
    if ((d.ring -= dt) <= 0 && d.s0) { d.ring = 0.16; beamRings(k.game, d.L, d.s0, d.s1, k.t, 0.6); beamHelix(k.game, d.L, d.s0, d.s1, k.rng, 6); }
    if (k.local && (d.tick -= dt) <= 0) { d.tick = 0.2; hurtSeg(k, d.a, d.b, d.half, (B.dps ?? 120) * 0.2, { knock: 0.6, stagger: 0.3, burn: true }); }
  },
  end(k) { for (const b of k.data.beams || []) b?.stop?.(); },
});

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
    d.sig = g.fx?.sigils?.sigil?.(c, { design: L.sigil, radius: p.r, color: L.flame, color1: L.root, life: p.fall + 0.6, seed: k.ev.seed, intensity: 0.8 });
    sfx(g, L, 'bifang_feather_rain', 'swingHeavy', k.local ? { volume: 0.7 } : { pos: c, volume: 0.7 });
    if (k.local && mine(g, k.ws)) { gunClip(g, k.ws, 'bifang_cast_tap'); veinTongue(g, L, 'r', L.root, 0.25, true); }
  },
  update(k) {
    const g = k.game, d = k.data, p = k.p;
    for (const f of d.drops) {
      if (f.done || k.t < f.t) continue;
      f.done = true;
      fallingFeather(g, d.L, f.p);
      sfx(g, d.L, 'bifang_feather_hit', 'fire_burst', { pos: f.p, volume: 0.45 });
      if (k.local) { hurtArea(k, f.p, 1.6, p.dmg, { burn: true, burnAdd: p.burn, knock: 2.5, stagger: 0.7 }); g.addShake?.(0.04); }
    }
  },
  end(k) { k.data.sig?.stop?.(0.4); },
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
      spacing: 15, style: 'cloisonne', core: L.wing.core, tip: L.wing.tip, enamel: L.wing.enamel, gold: L.wing.gold, open: false, alpha: 0.85 }).openWing(0.35));
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
  };
}

// ★ held 畢方降臨 / 鬼車夜啼 -------------------------------------------------------------------------------------
registerSkill('bifang_descent', {
  level: 'L3', aim: 'target', defaults: { range: 25 },
  start(k) {
    const g = k.game, d = k.data, L = d.L = lookOf(k.def), S = k.def.special;
    d.flap = S.flap || { r: 10, cone: 60, dmg: 300, burn: 3, knock: 9 };
    d.dive = S.dive || { len: 25, dps: 30, life: 4, width: 2.6 };
    k.dur = 1.8 + d.dive.life + 0.3;
    d.c = (k.at || k.feet()).clone();
    d.dir = _a.set(k.dir.x, 0, k.dir.z).normalize().clone();
    if (d.dir.lengthSq() < 0.5) d.dir.set(0, 0, -1);
    // the spirit needs room to be seen: a mark closer than 8 m moves out along the aim (same on every client: k.pos)
    const hz = Math.hypot(d.c.x - k.pos.x, d.c.z - k.pos.z);
    if (hz < 8) { d.c.set(k.pos.x + d.dir.x * 8, d.c.y, k.pos.z + d.dir.z * 8); d.c.y = k.floorY(d.c); }
    d.sz = L.id === 'guiche' ? 5.2 : 5.6; d.hip = 0.62 * d.sz;       // shoulders above the ground (feet on it)
    d.beat = 0; d.tick = 0; d.feared = [];
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
    if (d.beat < 1 && t >= 0.3) {            // ② sigil
      d.beat = 1;
      d.sig = fx?.sigils?.sigil?.(c, { design: L.sigil, radius: d.flap.r, color: L.flame, color1: L.root, life: 3.4, seed: k.ev.seed, intensity: 1 });
    }
    if (d.beat < 2 && t >= 0.6) {            // ③ descent: pillar, the spirit dissolves in from the column
      d.beat = 2;
      fx?.sigils?.pillar?.(c, { radius: 1.5, height: 18, color: L.root, color1: L.flame, life: 0.9 });
      fx?.lights?.flash?.(_a.set(c.x, c.y + 3, c.z), L.light, 90, 18, 0.5);
      sfx(g, L, 'bifang_crane_cry', null, { pos: c, volume: 1 });
      if (big && fx?.summons?.ghost) {
        d.ghost = fx.summons.ghost({ geometry: guiche ? nineHeadGeo() : craneGeo(), pos: _b.copy(c).add(_e.set(0, d.hip + 3, 0)), size: d.sz,
          yaw: Math.atan2(-d.dir.x, -d.dir.z), ...L.ghost, appear: 0.35, life: Infinity, motion: 'none', flap: { amp: 0.32, hz: 0.7 }, big: true, seed: k.ev.seed,
          exit: { kind: L.moteKind, count: 30, color: L.mote, speed: 3.2, scale: 2.2 } });
        d.sw = spiritWings(g, d.ghost, L);
      }
      if (k.local) { g.addShake?.(0.3); if (clipComfort.overlay) fx?.overlay?.radial?.(0.8, 0.4, { color: L.root }); }
    }
    const gh = d.ghost?.alive ? d.ghost : null;
    // the spirit settles on its one foot (0.6 -> 1.0 s); 鬼車 circles the mark instead
    if (gh && t < 1.8) {
      const u = smooth((t - 0.6) / 0.4);
      if (guiche) {
        const a = (t - 0.6) * 3.2, rr = 5 * (1 - smooth((t - 1.1) / 0.5));
        gh.obj.position.set(c.x + Math.cos(a) * rr, c.y + d.hip + 2.5 - u * 1.8, c.z + Math.sin(a) * rr);
        gh.obj.rotation.y = rr > 0.6 ? Math.PI - a : Math.atan2(-d.dir.x, -d.dir.z);   // along the circle, then the aim
      } else gh.obj.position.set(c.x, c.y + d.hip + 3 * (1 - u), c.z);
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
        if (g.zombies?.authority) fear(k, c, F.r, 1.5);
        if (k.local) hurtArea(k, c, F.r, F.dmg, { burn: true, burnAdd: F.burn, knock: 0.5, stagger: 1 });
      } else {
        const fwd = _a.copy(c).addScaledVector(d.dir, 3).setY(c.y + 1.2);
        fx?.motes?.burst?.(L.moteKind, fwd, 32, { speed: 6, dir: d.dir.clone().setY(0.35).normalize(), spread: 0.55, radius: 2, color: L.mote, color2: L.mote2, size: 0.2, seed: k.ev.seed });
        fx?.shockwave?.(_b.copy(c).addScaledVector(d.dir, 4).setY(c.y + 0.08), { normal: UP, r0: 1, r1: F.r, life: 0.5, color: L.ring });
        for (let i = 0; i < 12; i++) { const a = (k.rng() - 0.5) * F.cone * 2 * D2R, dd = _b.copy(d.dir).applyAxisAngle(UP, a); fx?.knockDust?.(_e.copy(c).addScaledVector(dd, 3 + k.rng() * 6), dd.multiplyScalar(7), 1); }
        sfx(g, L, 'bifang_ult_flap', 'explosion_large', { pos: c, volume: 0.8 });
        // the gale starts 5 m behind the crane (towards the caster): the cone covers the horde round the mark, not
        // only what is past it, and blows everything away from the caster
        if (k.local) hurtCone(k, c.clone().addScaledVector(d.dir, -5), d.dir, F.r + 5, F.cone, F.dmg, { knock: F.knock, stagger: 1, explosive: true, burnAdd: F.burn });
      }
      if (k.local) { g.hitStop?.(clipComfort.hitstop ? 0.08 : 0); g.addShake?.(0.35); g.arsenal?._clipEvent?.('haptic', 'thud'); }
    }
    if (d.feared.length) fearUpdate(k, dt);
    // the dive (1.8 -> 3.0 s): low over the ground along the aim, the path catching fire behind
    if (d.beat < 5 && t >= 1.8) {
      d.beat = 5;
      const D = d.dive, nodes = [];
      for (let s = 0; s <= D.len; s += 2) { const p = _a.copy(c).addScaledVector(d.dir, s); p.y = k.floorY(p); nodes.push(p.clone()); }
      d.path = new FirePath(g, L, nodes, { life: D.life });
      d.p0 = c.clone(); d.p1 = nodes[nodes.length - 1].clone();
      sfx(g, L, 'bifang_ult_dive', 'rocket_fly', { pos: c, volume: 0.9 });
    }
    if (d.path) {
      const u = Math.min(1, (t - 1.8) / 1.2), D = d.dive;
      d.path.reach(Math.floor(u * D.len / 2));
      d.path.update(dt);
      if (gh) {
        const e = u * u * (3 - 2 * u);
        gh.obj.position.copy(d.p0).lerp(d.p1, e);
        gh.obj.position.y += d.hip * 0.62 + Math.sin(u * Math.PI) * 0.6;
        gh.obj.rotation.set(-0.42 * Math.sin(Math.min(1, u * 2) * Math.PI / 2), Math.atan2(-d.dir.x, -d.dir.z), 0, 'YXZ');
        if (u < 1 && k.rng() < 0.5) fx?.motes?.spawn?.(L.moteKind, gh.obj.position, { vel: [0, -0.5, 0], color: L.mote, color2: L.mote2, size: 0.25, life: 1.4 });
      }
      if (k.local && t < 3 && clipComfort.shake) g.addShake?.(0.12 * dt * 8);
      // the burning path: 30/s along the reached part, 4 s from the moment the bird passed
      if (k.local && (d.tick -= dt) <= 0 && t < 1.8 + D.life) {
        d.tick = 0.25;
        const reach = _b.copy(d.p0).lerp(d.p1, Math.min(1, u));
        hurtSeg(k, _e.copy(d.p0).setY(d.p0.y + 0.9), reach.setY(reach.y + 0.9), D.width / 2, D.dps * 0.25, { burn: true, knock: 0.3, stagger: 0.2 });
      }
    }
    if (d.beat < 6 && t >= 3.0) {           // ⑤ exit: the spirit bursts into fire feathers at the end of its run
      d.beat = 6;
      gh?.dissolveOut(0.6); d.sw?.close(0.45);
      const end = d.p1 || c;
      fx?.shockwave?.(_a.set(end.x, end.y + 0.06, end.z), { normal: UP, r0: 0.5, r1: 6, life: 0.6, color: L.ring });
      fx?.sparkBurst?.(_a.set(end.x, end.y + 2.5, end.z), { color: L.root, color1: L.flame, count: 24, speed: 8, glow: 1.4 });
      sfx(g, L, 'bifang_ult_end', 'fire_burst', { pos: end, volume: 0.8 });
      if (k.local) {
        g.hud?.border?.(hexOf(L.root), 0, 0.01);
        if (mine(g, k.ws)) { g.vm.setPart('fx_wingRoot*', 0, 0.35); dropWings(k.ws.sp, 0.3, g.time); }
      } else if (d.back) { d.back.w.close(0.3); }
    }
  },
  end(k) {
    const d = k.data;
    d.sig?.stop?.(0.4); d.path?.stop(); if (d.ghost?.alive && d.ghost.outT < 0) d.ghost.dissolveOut(0.3);
    d.sw?.close(0.3);
    d.back?.remove();
    for (const f of d.feared) unfear(f.z);
    d.feared.length = 0;
    if (k.local && k.ws && mine(k.game, k.ws) && k.ws.sp.vmw) { k.game.vm.setPart('fx_wingRoot*', 0, 0.3); dropWings(k.ws.sp, 0.25, k.game.time); }
  },
});

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
  events: [[0, 'anchorL', ['rest', 0.05]], [0.02, 'snd', 'drawHeavy'], [0.25, 'haptic', 'tick'], [0.27, 'bf', { wing: 'open', style: 'glow', count: 6, scale: 0.8, dur: 0.25, fan: false }],
    [0.29, 'bf', { sparkle: 16, cry: 0.7 }], [0.3, 'glow', { to: 1.8, sec: 0.15 }], [0.45, 'snd', 'cloth'], [0.5, 'bf', { wing: 'close', dur: 0.35 }], [0.52, 'bf', { feathers: 6 }],
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
  ...W2(wt([[0, 0.14], [0.25, 0.3, 'outBack'], [0.6, 0.14, 'inOut'], [1, 0.14]])),
  fx_beak: [[0, 0], [0.3, 0.5, 'out3'], [0.45, 0, 'in3'], [1, 0]],
  gunRot: [[0, Z3], [0.25, [-1.5, 0, 1], 'out3'], [1, Z3]] },
  events: [[0.22, 'bf', { sparkle: 8 }], [0.25, 'glow', { to: 1.8, sec: 0.08 }], [0.5, 'glow', { to: 1, sec: 0.3 }], [0.3, 'snd', 'cloth']] });
// rare idle (12 s quiet): the wing roots shake off two light feathers
registerClip('bifang_idle_rare', { duration: 1.2, tracks: {
  'fx_wingRootL.rot': [[0, Z3], [0.15, [4, 0, 3]], [0.25, [-3, 0, -2]], [0.35, [2, 0, 2]], [0.5, Z3]],
  'fx_wingRootR.rot': [[0, Z3], [0.17, [4, 0, -3]], [0.27, [-3, 0, 2]], [0.37, [2, 0, -2]], [0.52, Z3]],
  gunRot: [[0, Z3], [0.2, [0, 0, 1.2]], [0.5, Z3]] },
  events: [[0.2, 'bf', { feathers: 2 }], [0.15, 'snd', 'cloth']] });

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
  const events = [[0.06, 'anchorL', ['magwell', 0.16]], [0.08, 'poseL', 'magGrab'], [0.14, 'snd', 'coverOpen'], [0.2, 'haptic', 'tick']];
  if (rare) {
    // §2.25: the left wing root bats the spent cell away, the new one is drawn in magnetically; the hand only slaps the gate
    tracks.fx_wingRootL = [[0, 0], [0.2, 0], [0.25, 0.42, 'out3'], [0.31, 0, 'in3'], [1, 0]];
    tracks['mag.vis'] = [[0, 1], [0.4, 1], [0.41, 0, 'snap'], [0.47, 0], [0.48, 1, 'snap'], [1, 1]];
    events.push([0.25, 'snd', 'magOut'], [0.26, 'bf', { puff: 1, sparkle: 6 }], [0.28, 'anchorL', ['rest', 0.1]], [0.48, 'snd', 'magIn'], [0.5, 'glow', { to: 2, sec: 0.06 }],
      [0.6, 'glow', { to: 1, sec: 0.3 }], [0.64, 'ammo'], [0.68, 'anchorL', ['magwell', 0.08]]);
  } else {
    events.push([0.24, 'snd', 'magOut'], [0.25, 'anchorL', ['mag', 0.06]], [0.32, 'bf', { puff: 1 }], [0.42, 'magDrop'], [0.48, 'snd', 'pouch'], [0.62, 'snd', 'magIn'], [0.64, 'ammo'], [0.68, 'anchorL', ['magwell', 0.08]]);
  }
  events.push([0.78, 'snd', 'coverClose'], [0.79, 'haptic', 'tick'], [0.8, 'bf', { bell: 0.5 }], [0.84, 'anchorL', ['grip_l', 0.14]], [0.86, 'poseL', 'wrap']);
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
  events: [[0.03, 'snd', 'cloth'], [0.27, 'anchorL', ['point', 0.22]], [0.33, 'bf', { wing: 'open', style: 'glow', count: 5, scale: 0.6, dur: 0.3, fan: false }], [0.35, 'snd', 'cloth'],
    [0.38, 'bf', { sparkle: 8, orbit: 1.5 }], [0.38, 'haptic', 'tick'], [0.5, 'bf', { wing: 'close', dur: 0.3 }], [0.56, 'anchorL', ['grip_l', 0.2]], [0.58, 'poseL', 'wrap'],
    [0.62, 'bf', { vein: 1 }], [0.62, 'glow', { to: 1.8, sec: 0.25 }], [0.7, 'glow', { to: 1, sec: 0.5 }], [0.8, 'bf', { wing: 'open', style: 'glow', count: 5, scale: 0.6, dur: 0.3, fan: false }],
    [0.83, 'bf', { bell: 0.4 }], [0.95, 'bf', { wing: 'close', dur: 0.25 }]],
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
  events: [[0.03, 'snd', 'cloth'], [0.14, 'bf', { wing: 'open', style: 'cloisonne', count: 7, scale: 0.8, dur: 0.3 }], [0.16, 'bf', { sparkle: 10, cry: 0.4 }],
    [0.2, 'anchorL', ['palm', 0.3]], [0.3, 'bf', { feathers: 1 }], [0.42, 'bf', { mini: 1.1 }], [0.42, 'haptic', 'tick'], [0.74, 'bf', { wing: 'close', dur: 0.4 }],
    [0.8, 'anchorL', ['grip_l', 0.2]], [0.83, 'poseL', 'wrap'], [0.86, 'bf', { bell: 0.4 }]],
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
// km_bifang: (1) feather strokes draw a one-legged crane with raised wings (0-0.45 s); (2) gold-wire cloisonné cells fill
// with teal / vermilion (0.45-0.8); (3) the gold rim glows (0.8-1.0); (4) the eye flashes with the ding (1.0-1.15).
// km_guiche: the nine-headed night bird in black lacquer, aubergine / ink-teal cells, the large eye flashes purple.
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
function craneParts(S, nine) {
  const c = S / 2, k = S / 256;
  const P = (x, y) => [c + (x - 128) * k, c + (y - 128) * k];
  const path = (pts) => { const p = new Path2D(); pts.forEach(([x, y], i) => { const [X, Y] = P(x, y); i ? p.lineTo(X, Y) : p.moveTo(X, Y); }); p.closePath(); return p; };
  const curve = (cmds) => { const p = new Path2D(); for (const [m, ...a] of cmds) { const q = []; for (let i = 0; i < a.length; i += 2) q.push(...P(a[i], a[i + 1])); p[m](...q); } return p; };
  const body = curve([['moveTo', 96, 150], ['quadraticCurveTo', 128, 122, 168, 140], ['quadraticCurveTo', 182, 156, 160, 170], ['quadraticCurveTo', 120, 182, 92, 166], ['closePath']]);
  const wings = [];
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x0 = 128 + s * 8, y0 = 142, a = (-62 + i * 15) * D2R * s, len = 86 - i * 12;
    const tx = x0 + Math.sin(-a * s) * len * s * -1, ty = y0 - Math.cos(a) * len;
    wings.push({ p: path([[x0, y0], [x0 + s * (14 + i * 4) + (tx - x0) * 0.45, y0 + (ty - y0) * 0.5 - 6], [tx, ty], [x0 + (tx - x0) * 0.5 - s * 4, y0 + (ty - y0) * 0.55 + 8]]), i });
  }
  const necks = [], heads = [];
  if (nine) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 2.2, hx = 128 + Math.sin(a) * 54, hy = 126 - Math.cos(a) * 34;
      necks.push(curve([['moveTo', 128, 148], ['quadraticCurveTo', 128 + Math.sin(a) * 20, 120, hx, hy]]));
      heads.push({ x: hx, y: hy, r: i === 4 ? 7 : 4.6, big: i === 4 });
    }
  } else {
    necks.push(curve([['moveTo', 104, 148], ['quadraticCurveTo', 78, 120, 92, 92], ['quadraticCurveTo', 100, 74, 86, 62]]));
    heads.push({ x: 86, y: 58, r: 7, big: true, beak: path([[80, 56], [42, 66], [80, 62]]), crest: path([[90, 52], [100, 36], [94, 54]]) });
  }
  const leg = curve([['moveTo', 128, 172], ['lineTo', 130, 206], ['lineTo', 126, 226]]);
  const toes = curve([['moveTo', 126, 226], ['lineTo', 112, 232], ['moveTo', 126, 226], ['lineTo', 142, 232], ['moveTo', 126, 226], ['lineTo', 128, 236]]);
  const tail = path([[164, 154], [214, 168], [206, 176], [170, 168]]);
  return { body, wings, necks, heads, leg, toes, tail, P, k };
}
function drawCraneMark(ctx, S, t, o, nine) {
  const L = nine ? LOOKS.guiche : LOOKS.bifang;
  const gold = nine ? '#c9ccd1' : '#e3b04b', cellA = nine ? '#5b2b5e' : '#1f8f8a', cellB = nine ? '#1d3f4a' : '#c8302a', body = nine ? '#121012' : '#f3efe6';
  const eye = nine ? '#c58bff' : '#ffb43a';
  const p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
  ctx.clearRect(0, 0, S, S);
  const P = craneParts(S, nine), lw = S * 0.016;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // 12 rays behind for the final kill (the mythic frame's)
  if (o.final) { ctx.save(); ctx.globalAlpha = 0.35 * p2; ctx.strokeStyle = gold; ctx.lineWidth = S * 0.01; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + t * 0.4; ctx.beginPath(); ctx.moveTo(S / 2 + Math.cos(a) * S * 0.2, S / 2 + Math.sin(a) * S * 0.2); ctx.lineTo(S / 2 + Math.cos(a) * S * 0.48, S / 2 + Math.sin(a) * S * 0.48); ctx.stroke(); } ctx.restore(); }
  // beat 2: cloisonné fill -- each feather plate its enamel colour, the body porcelain / black lacquer
  if (p2 > 0) {
    ctx.save(); ctx.globalAlpha = p2;
    P.wings.forEach((w) => { ctx.fillStyle = w.i % 2 ? cellB : cellA; ctx.fill(w.p); });
    ctx.fillStyle = body; ctx.fill(P.body); ctx.fill(P.tail);
    for (const h of P.heads) { ctx.beginPath(); ctx.arc(...P.P(h.x, h.y), h.r * P.k * 1.6, 0, Math.PI * 2); ctx.fill(); if (h.beak) { ctx.fillStyle = gold; ctx.fill(h.beak); ctx.fillStyle = '#c8302a'; ctx.fill(h.crest); ctx.fillStyle = body; } }
    // gold wire cells across the body
    ctx.save(); ctx.clip(P.body); ctx.strokeStyle = gold; ctx.lineWidth = S * 0.006;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(...P.P(96 + i * 14, 132)); ctx.lineTo(...P.P(88 + i * 14, 182)); ctx.stroke(); }
    ctx.restore(); ctx.restore();
  }
  // beat 1 (+3): feather-stroke outlines drawn in, glowing once filled
  ctx.save();
  ctx.shadowColor = nine ? '#b54bff' : '#ffc74a'; ctx.shadowBlur = S * 0.05 * p3;
  ctx.strokeStyle = gold; ctx.lineWidth = lw;
  const dash = (path, len, u) => { ctx.setLineDash([len * u, len]); ctx.stroke(path); };
  const per = S * 2;
  P.wings.forEach((w, i) => dash(w.p, per, Math.min(1, p1 * 1.6 - (i % 4) * 0.12)));
  dash(P.body, per, p1); dash(P.tail, per, p1);
  ctx.lineWidth = lw * 1.4;
  for (const n of P.necks) dash(n, per, p1);
  dash(P.leg, per, p1); ctx.lineWidth = lw; dash(P.toes, per, p1);
  ctx.setLineDash([]);
  for (const h of P.heads) if (p1 > 0.7) { ctx.beginPath(); ctx.arc(...P.P(h.x, h.y), h.r * P.k * 1.6, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  // beat 4: 點睛 -- the eye(s) flash with the ding; headshot: a cross-star flare and an element ring
  const fl = Math.sin(Math.PI * p4) + (o.head ? Math.max(0, 1 - Math.abs(t - 1.1) / 0.08) * 0.8 : 0);
  for (const h of P.heads) {
    const [x, y] = P.P(h.x - (nine ? 0 : 1.5), h.y - (nine ? 0 : 1)), r = (h.big ? 2.6 : 1.6) * P.k * 1.6;
    ctx.fillStyle = p3 > 0 || fl > 0 ? eye : '#3a2a26';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (fl > 0.01 && h.big) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(x, y, 0, x, y, S * (0.04 + fl * 0.05));
      gr.addColorStop(0, `rgba(255,255,255,${Math.min(1, fl).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - S * 0.1, y - S * 0.1, S * 0.2, S * 0.2);
      const Lr = S * (0.03 + fl * (o.head ? 0.1 : 0.05));
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = S * 0.008; ctx.globalAlpha = Math.min(1, fl);
      ctx.beginPath(); ctx.moveTo(x - Lr, y); ctx.lineTo(x + Lr, y); ctx.moveTo(x, y - Lr * 0.7); ctx.lineTo(x, y + Lr * 0.7); ctx.stroke();
      ctx.restore();
    }
  }
  if (o.head && t > 1.0) {
    const u = Math.min(1, (t - 1.0) / 0.17);
    ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = o.tint || L.xh; ctx.lineWidth = S * 0.012;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S * (0.2 + 0.24 * u), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}
registerKillMark('km_bifang', { draw(ctx, S, t, o) { drawCraneMark(ctx, S, t, o, false); } });
registerKillMark('km_guiche', { draw(ctx, S, t, o) { drawCraneMark(ctx, S, t, o, true); } });

// colour-dependent element tag for damage numbers / DOT (fire for 畢方, the purple 'shock' skin for 鬼車)
LOOKS.bifang.elem = 'fire';
LOOKS.guiche.elem = 'shock';
LOOKS.guiche.burnFx = 'ghostfire';   // 灼羽 on 鬼車 burns violet (zfx SHELL.ghostfire)
