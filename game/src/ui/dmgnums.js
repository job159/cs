// Floating damage numbers, CSO zombie-mode style (docs/research/06b-cso-fx.md §9.3.2) with the premium skins of
// docs/PREMIUM_WEAPONS.md §1.9 #6. DOM (<= 24 live numbers): transform / opacity writes only, no CSS filters.
//   tiers   normal 20 px | crit (headshot / heavy hit) 30 px + a comic burst star on the left | armor 18 px | elem 20 px
//           (sizes at 720p, scaled with the window height); each pops, rises, fades on its own curve
//   ghosts  two afterimages where the number was 40 / 80 ms ago (alpha .28 / .12) -- the CSO "drag"
//   stack   a new number on the same target within 0.15 s starts 22 px above where the last one is now (so a burst
//           climbs instead of piling up); 4 per target, the 5th merges into the top one (sum + punch)
//   skins   standard white | anti series-colour edge | exotic element gradient | mythic vermilion with a gold edge;
//           crit swaps to gold (x1.3); premium.dmgSkin may name any SKINS key
//   new DamageNumbers(parent, game).add(point, amount, { head, crit, armored, elem, skin, hex, target })  .update(dt)
import * as THREE from 'three';
import { injectCSS } from './crosshairs.js';

const TIER = {
  normal: { px: 20, pop: 1.35, popT: 0.08, rise: 48, life: 0.62, fade: 0.22, ghosts: true },
  crit: { px: 30, pop: 1.6, popT: 0.11, rise: 60, life: 0.82, fade: 0.26, ghosts: true },
  armor: { px: 18, pop: 1.0, popT: 0.01, rise: 30, life: 0.42, fade: 0.15, ghosts: false },
  elem: { px: 20, pop: 1.2, popT: 0.08, rise: 48, life: 0.62, fade: 0.22, ghosts: true },
};
// fill gradient (top, mid, bottom) + edge
export const SKINS = {
  standard: ['#ffffff', '#f2f2f2', '#dcdcdc', '#141414'],
  crit: ['#fff2a0', '#ffc21a', '#ff7a00', '#2a0e00'],
  armor: ['#c4d2e0', '#9fb3c8', '#8399ae', '#0d141c'],
  fire: ['#ffd9a8', '#ff9a3a', '#e0661a', '#141414'], poison: ['#e4ffb8', '#9dff4a', '#5cc21a', '#141414'],
  ice: ['#e6fbff', '#8fe6ff', '#4fb8e0', '#141414'], shock: ['#efe4ff', '#c9a2ff', '#9466e8', '#141414'],
  mythic: ['#ff5a4a', '#d81e2c', '#8a0a14', '#e8b54a'],
  holy: ['#ffffff', '#fff6dc', '#f2e2b0', '#c8902e'], abyss: ['#ffa0d8', '#ff4fb0', '#c8207e', '#ffffff'],
};
const BURST = '<svg class="bst" viewBox="-12 -12 24 24"><polygon points="0,-11 2.6,-4.6 9.4,-6.8 5.4,-1 10.6,3.6 3.8,3.8 3.4,10.6 -1.2,5.2 -6.8,9.4 -5,2.6 -11,0 -5,-3 -7.6,-8.6 -1.8,-5"/></svg>';

const _v = new THREE.Vector3();
const easeOut = (u) => 1 - (1 - u) * (1 - u);

export class DamageNumbers {
  constructor(parent, game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'dmgnums2';
    parent.appendChild(this.el);
    this.list = [];
    this.byTarget = new Map();   // target -> numbers alive on it (newest last)
  }

  /** Skin colours for a hit: crit / armour / element tiers win over the weapon skin. */
  _colors(tier, o) {
    if (tier === 'crit') return o.skin === 'mythic' ? ['#fff1b8', '#ffc21a', '#ff7a00', '#8a0a14'] : SKINS.crit;
    if (tier === 'armor') return SKINS.armor;
    if (tier === 'elem') return SKINS[o.elem] || SKINS.fire;
    const hex = o.hex || {};
    if (o.skin === 'anti') return ['#ffffff', '#f2f2f2', '#dcdcdc', hex.core || '#1fb5d6'];
    if (o.skin === 'exotic' || o.skin === 'legacy') return [hex.mote || '#ffffff', hex.core || '#e2cbff', hex.rim || '#9b5cff', '#141414'];
    return SKINS[o.skin] || SKINS.standard;
  }

  add(point, amount, o = {}) {
    if (!point || !(amount > 0)) return;
    const tier = o.armored ? 'armor' : o.crit || o.head ? 'crit' : o.elem ? 'elem' : 'normal';
    const T = TIER[tier], key = o.target || null, now = this.game.time;
    const stack = key ? (this.byTarget.get(key) || []).filter((n) => !n.dead) : [];
    // 5th number on one target: merge into the newest
    if (stack.length >= 4) { const top = stack[stack.length - 1]; this._set(top, top.n + amount); top.t = Math.min(top.t, top.T.popT); top.punch = 1; return; }
    const last = stack[stack.length - 1];
    const lift = last && now - last.born < 0.15 ? last.y + 22 : 0;
    const d = document.createElement('div');
    const c = this._colors(tier, o);
    d.className = 'dn2 t-' + tier;
    d.style.cssText = `--f0:${c[0]};--f1:${c[1]};--f2:${c[2]};--e:${c[3]}`;
    d.innerHTML = (tier === 'crit' ? BURST : '') + (T.ghosts ? '<i class="g g2"></i><i class="g g1"></i>' : '') + '<span class="o"></span><span class="f"></span>';
    this.el.appendChild(d);
    const n = { el: d, T, tier, n: 0, t: 0, born: now, lift, y: lift, dx: (Math.random() - 0.5) * 28, p: { x: point.x, y: point.y, z: point.z }, key, punch: 0, dead: false,
      txt: d.querySelectorAll('.o, .f, .g'), g1: d.querySelector('.g1'), g2: d.querySelector('.g2'), hist: [] };
    this._set(n, amount);
    this.list.push(n);
    if (key) { stack.push(n); this.byTarget.set(key, stack); }
    while (this.list.length > 24) this._kill(this.list[0]);
  }

  _set(n, v) { n.n = v; const s = String(Math.round(v)); for (const e of n.txt) e.textContent = s; n.el.style.setProperty('--w', s.length); }
  _kill(n) {
    n.dead = true; n.el.remove();
    const i = this.list.indexOf(n); if (i >= 0) this.list.splice(i, 1);
    const st = n.key && this.byTarget.get(n.key);
    if (st) { const j = st.indexOf(n); if (j >= 0) st.splice(j, 1); if (!st.length) this.byTarget.delete(n.key); }
  }
  clear() { for (const n of [...this.list]) this._kill(n); }

  update(dt) {
    if (!this.list.length) return;
    const cam = this.game.camera, W = window.innerWidth, H = window.innerHeight;
    const k = Math.max(0.8, Math.min(1.4, H / 720));
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i], T = n.T;
      n.t += dt;
      if (n.t >= T.life) { this._kill(n); continue; }
      const p = _v.set(n.p.x, n.p.y, n.p.z).project(cam);
      if (p.z > 1) { n.el.style.opacity = '0'; continue; }
      const u = Math.min(1, n.t / (T.life - T.fade * 0.3));
      n.y = easeOut(u) * T.rise + n.lift;
      const rise = n.y * k;
      let x = (p.x * 0.5 + 0.5) * W + n.dx * k * u, y = (-p.y * 0.5 + 0.5) * H - 30 * k - rise;
      // keep the crosshair readable: nudge numbers out of a small disc around the centre
      const cx = x - W / 2, cy = y - H / 2, r = Math.hypot(cx, cy), R = 34 * k;
      if (r < R) { const s = r > 1 ? R / r : 0; x = W / 2 + (s ? cx * s : R); y = H / 2 + (s ? cy * s : 0); }
      const pop = n.t < T.popT ? T.pop + (1 - T.pop) * (n.t / T.popT) : 1;
      n.punch = Math.max(0, n.punch - dt * 12);
      const sc = pop * (1 + n.punch * 0.25) * k * (T.px / 20);
      const a = n.t > T.life - T.fade ? (T.life - n.t) / T.fade : 1;
      n.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${sc.toFixed(3)})`;
      n.el.style.opacity = a.toFixed(2);
      // afterimages: where the number was 40 / 80 ms ago (screen-space rise only)
      if (n.g1) {
        n.hist.push(rise); if (n.hist.length > 6) n.hist.shift();
        const back = (s) => { const j = Math.max(0, n.hist.length - 1 - Math.round(s / Math.max(dt, 1 / 120))); return (rise - n.hist[j]) / sc; };
        n.g1.style.transform = `translateY(${back(0.04).toFixed(1)}px) skewX(-12deg) translateX(-50%)`;
        n.g2.style.transform = `translateY(${back(0.08).toFixed(1)}px) skewX(-12deg) translateX(-50%)`;
      }
    }
  }
}

injectCSS('cf-dn', `
.dmgnums2 { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
.dn2 { position: absolute; left: 0; top: 0; height: 0; transform-origin: 0 0; will-change: transform, opacity; font: italic 800 20px/1 var(--num); letter-spacing: .01em; white-space: nowrap; }
.dn2 > * { position: absolute; left: 0; bottom: 0; transform: translateX(-50%); }
.dn2 > .o, .dn2 > .f, .dn2 > .g { left: 0; transform: skewX(-12deg) translateX(-50%); }
.dn2 .o { color: var(--e); -webkit-text-stroke: 4px var(--e); }
.dn2 .f { color: transparent; text-shadow: none; background: linear-gradient(180deg, var(--f0) 15%, var(--f1) 55%, var(--f2) 90%); -webkit-background-clip: text; background-clip: text; }
.dn2 .g { color: var(--f1); bottom: 0; text-shadow: none; }
.dn2 .g1 { opacity: .28; } .dn2 .g2 { opacity: .12; }
.dn2.t-crit { font-weight: 900; }
.dn2 .bst { width: 25px; height: 25px; left: auto; right: 50%; margin-right: calc(var(--w, 2) * .25em - .12em); bottom: -.05em; transform: none; animation: dnBurst .11s ease-out both; }
.dn2 .bst polygon { fill: #fff2a0; stroke: #2a0e00; stroke-width: 1.6; stroke-linejoin: round; }
@keyframes dnBurst { from { transform: rotate(-20deg) scale(1.4); } to { transform: rotate(0) scale(1); } }
.dn2.t-armor .o { -webkit-text-stroke-width: 3px; }
`);
