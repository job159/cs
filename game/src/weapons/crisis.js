// Crisis armour (危機護甲, docs/PREMIUM_WEAPONS.md §1.11): mythic weapons and Legacy VI. A def opts in with
// `special.crisis` or `premium.crisis`: { name, kind: 'knock' (default) | 'counter' | 'blink' | 'heal', fx, r (reach, 4 m) }.
//   ready:   that weapon held 60 s in total and 20 hits landed with it; once per round (a wipe retry is a new round)
//   trigger: a hit that would down the player while it is in hand -> the hit is blocked, 1 s invulnerable, 60 ms
//            white flash, haptic thud x2, then the crisis skill event (every client sees it): 12 element-coloured
//            porcelain shards, the porcelain-break sound and the kind's effect:
//              knock    zombies within 4 m knocked back (bosses only stagger)
//              counter  shards cut 4 m around: 300 damage + knockback (M04, M10)
//              blink    flash to the nearest standable point up to 6 m behind (no wall in between) (H01 VI)
//              heal     knockback + teammates within 8 m +20 HP (applied on each teammate's own client) (M11, H02 VI)
//            `fx` names an extra registered skill whose start(k) adds the weapon's own shatter look.
// Never stacks with the A3 counter-scale vest: the weapon armour goes first (it blocks the hit outright).
// PlayerStatus is not edited: crisisFor(game) wraps its damage() once.
import * as THREE from 'three';
import { haptic } from './arsenal.js';
import { castSkill, SKILLS } from './specials.js';
import { FRAME } from '../fx/fx.js';

const NEED_T = 60, NEED_HITS = 20, RANGE = 4;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _hit = {};

export function crisisFor(g) { return g._crisis || (g._crisis = new Crisis(g)); }
export function armCrisis(ws) { if (!ws?.game) return; const c = crisisFor(ws.game); c.weapons.add(ws); c._install(); }
/** HUD: { has (armed weapon in hand), ready, frac (progress 0..1), used, name, color, kind } or null. */
export function crisisState(g) { return g?._crisis?.state() ?? null; }

class Crisis {
  constructor(g) {
    this.g = g;
    this.weapons = new Set();
    this.used = null;     // round key the armour went off in
    this.st = null;
  }
  _install() {
    const st = this.g.status;
    if (!st || st === this.st) return;
    this.st = st;
    const orig = st.damage;
    st.damage = (amount, opts = {}) => (this._block(st, amount, opts) ? 0 : orig.call(st, amount, opts));
  }
  _round() { const m = this.g.match; return m ? m.round + ':' + (m.retries ?? 0) : 'free'; }
  /** The armed weapon in hand (the armour belongs to the weapon being held). */
  held() { const w = this.g.arsenal?.current; return w && this.weapons.has(w) && !w._spGone ? w : null; }
  cfg(ws) { return { kind: 'knock', ...ws.def.special?.crisis, ...ws.def.premium?.crisis }; }
  frac(ws) { const s = ws?.sp; return s ? Math.min(1, Math.min(s.heldT / NEED_T, s.hits / NEED_HITS)) : 0; }
  ready(ws) { return !!ws && this.frac(ws) >= 1 && this.used !== this._round(); }

  state() {
    this._install();
    const ws = this.held();
    if (!ws) return null;
    const c = this.cfg(ws);
    return { has: true, ready: this.ready(ws), frac: this.frac(ws), used: this.used === this._round(), name: c.name || '危機護甲', kind: c.kind };
  }

  _block(st, amount, opts) {
    if (!st.alive || st.downed || st.invuln > 0 || !(amount > 0)) return false;
    const ws = this.held();
    if (!this.ready(ws)) return false;
    // what the hit would leave (kevlar takes half of a direct hit, as in PlayerStatus.damage)
    const left = st.hp - (opts.dot ? amount : amount - Math.min(st.armor, amount * 0.5));
    if (left > 0) return false;
    this.trigger(ws);
    return true;
  }

  trigger(ws) {
    const g = this.g, st = g.status;
    this.used = this._round();
    st.invuln = Math.max(st.invuln, 1.0);
    g.fx?.screen?.kick([2.4, 2.4, 2.4], 0.06);            // 60 ms white flash
    haptic(40); setTimeout(() => haptic(40), 110);         // thud x2 (§1.13)
    g.hud?.onCrisis?.(ws, this.cfg(ws));
    castSkill(ws, 'crisis', { free: true });
  }
}

/** The crisis skill event (registered by specials.js): shatter look on every client, the effect on the caster. */
export const CRISIS_SKILL = {
  level: 'L1', dur: 1.0,
  start(k) {
    const g = k.game, fx = g.fx, kind = k.p.kind || 'knock', range = k.p.r ?? RANGE;   // r: the weapon's own reach (M07: 6 m)
    const c = k.feet(new THREE.Vector3());
    const chest = _a.set(c.x, c.y + 1.15, c.z);
    // 12 porcelain shards in the element's colours (the FX kit's tumbling shard motes when present), plus glints
    const pal = [k.col.core, k.col.rim, k.col.trim, k.col.mote];
    // shards leave from a ring around the player, each straight outward and below the eye line (a random cone
    // sends some through the caster's own lens as screen-sized blobs)
    if (fx?.motes?.burst) {
      const lit = pal.map((c) => { const m = Math.max(c[0], c[1], c[2], 1e-3); return [c[0] / m, c[1] / m, c[2] / m]; });
      const R = k.local ? 1.2 : 0.7, y = c.y + (k.local ? 0.85 : 1.15);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 6.283 + k.rng() * 0.3;
        fx.motes.burst('shard', _b.set(c.x + Math.cos(a) * R, y, c.z + Math.sin(a) * R), 1, { seed: k.ev.seed + i, speed: 5.5, spread: 0.18, radius: 0.05,
          dir: new THREE.Vector3(Math.cos(a), 0.45, Math.sin(a)).normalize(), palette: [lit[i % lit.length]] });
      }
    }
    for (let i = 0; i < (fx?.motes?.burst ? 6 : 12); i++) {
      const a = (i / 12) * 6.283 + k.rng() * 0.4, up = 1.5 + k.rng() * 3, sp = 4 + k.rng() * 4, col = pal[i % pal.length];
      fx?.particles?.spawn({ additive: true, x: chest.x + Math.cos(a) * 0.8, y: chest.y, z: chest.z + Math.sin(a) * 0.8, vx: Math.cos(a) * sp, vy: up, vz: Math.sin(a) * sp, life: 0.7 + k.rng() * 0.4,
        size: 0.05, size1: 0.03, stretch: 0.03, color: [...col, 1], color1: [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, 0], frame: FRAME.spark, gravity: 9, drag: 1.5 });
    }
    // the burst of light at the chest is for onlookers (the caster gets the 60 ms white flash instead)
    if (!k.local) fx?.particles?.spawn({ additive: true, x: chest.x, y: chest.y, z: chest.z, life: 0.18, size: 1.2, size1: 2.4, color: [...k.col.rim, 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
    fx?.shockwave(_b.set(c.x, c.y + 0.06, c.z), { normal: new THREE.Vector3(0, 1, 0), r0: 0.3, r1: range, life: 0.4, color: k.col.rim });
    g.audio?.play('crisis_break', k.local ? { volume: 1 } : { pos: c });
    if (k.p.fx && SKILLS[k.p.fx]?.start) SKILLS[k.p.fx].start(k);
    // teammates' heal is applied by each teammate's own client (their PlayerStatus lives there)
    if (kind === 'heal' && !k.local && g.player && g.player.pos.distanceTo(c) <= 8) g.status?.heal(20);
    if (!k.local) return;
    if (kind === 'blink') { blink(g, c); return; }
    for (const z of g.zombies?.inRadius(c, range) || []) {
      const dir = z.center(new THREE.Vector3()).sub(c).setY(0);
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
      dir.normalize();
      const boss = !!z.def?.boss;
      if (kind !== 'counter' && g.zombies.authority && z.kvel) {
        // the host (or solo) shoves directly: a knockback, not a wound (no blood, no damage)
        const kr = 1 - (z.def?.knockRes || 0);
        if (!boss) { z.kvel.x += dir.x * 10 * kr; z.kvel.z += dir.z * 10 * kr; }
        if (z.state !== 'stagger' && z.actions?.stagger && z.hp > 0) { z.state = 'stagger'; z.stateT = 0; z.playOnce('stagger', { fade: 0.08, speed: 1.2 }); }
        continue;
      }
      // a token amount carries the push to the host from a guest (zero-damage hits are not sent)
      const info = { amount: kind === 'counter' ? 300 * (g.arsenal?.dmgMul ?? 1) : 1, part: 'body', point: z.center(new THREE.Vector3()), dir, knock: boss ? 0 : 9, stagger: 1, weapon: k.def.id, shooter: g.localId, explosive: !boss, skill: 'crisis' };
      const res = z.damage(info);
      if (kind === 'counter') g.hud?.onHit?.(info, res, z);
    }
    for (const b of kind === 'heal' ? g.bots?.bots || [] : []) if (b.alive && !b.downed && b.pos.distanceTo(c) <= 8) b.hp = Math.min(100, b.hp + 20);
  },
};

/** Flash backwards to the nearest standable point within 6 m that the eye can see (H01 VI 星殼). */
function blink(g, from) {
  const p = g.player, col = g.world?.collision;
  if (!p || !col) return;
  const back = _b.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));   // camera forward is (-sin yaw, -cos yaw)
  const eye = new THREE.Vector3(from.x, from.y + 1.2, from.z);
  for (const d of [6, 5, 4, 3, 2]) {
    for (const side of [0, 0.5, -0.5]) {
      const dir = back.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), side).normalize();
      if (col.raycast(eye, dir, d + 0.4, _hit)) continue;
      const to = eye.clone().addScaledVector(dir, d);
      const y = col.floorBelow(to, 0.3, 3);
      if (!Number.isFinite(y) || Math.abs(y - from.y) > 1.2) continue;
      p.pos.set(to.x, y, to.z);
      p.vel?.set(0, 0, 0);
      g.fx?.shockwave(new THREE.Vector3(to.x, y + 0.06, to.z), { normal: new THREE.Vector3(0, 1, 0), r0: 0.2, r1: 1.6, life: 0.3, color: [2, 3, 6] });
      return;
    }
  }
}
