// Kill feedback layer (docs/PREMIUM_WEAPONS.md §1.9 #8-9, docs/research/06b-cso-fx.md §9.3.4):
//   kill-mark player   256-px micro animation at the bottom centre: 4 beats -- strokes draw the outline (0-0.45 s),
//                      fill (0.45-0.8), full glow (0.8-1.0), the focal gem flashes with a "ding" (1.0-1.15) -- hold,
//                      0.3 s fade. Headshot version: a cross-star flare from the gem + an element ring; final-kill
//                      version (last zombie of the wave / boss): x1.25, +0.6 s and 12 rays behind it.
//                      registerKillMark(id, { draw(ctx, S, t, o), scale })  procedural (scale: element size x, 1 = 112 px) (flip-book: drawn at N frames by
//                      quality -- 12 / 24 / 30 -- straight onto the canvas, no atlas memory), or
//                      registerKillMark(id, { src: 'assets/ui/km_x.webp', frames, cols, size, headFrames })  a WebP
//                      atlas (row-major cells; frames after `frames` are the headshot extra cells).
//                      bakeKillMark(id, { size, frames, tint }) -> canvas atlas (tooling: export with toDataURL('image/webp')).
//   streak             八卦 eight-cell ring (one trigram per kill, gold paper burst on the 8th) + chrome italic
//                      "N COMBO!" from 2 kills: silver, gold at 10, orange-red at 20, red with a light bar at 30;
//                      +1 punch, 3 s window, 0.3 s fade; "精準！" on a headshot streak; voice cues streak_2/3/5/10 and a
//                      ding that climbs a semitone per kill (a chord from the 5th).
//   badges             hexagonal metal badge 64 px under the crosshair for headshot / knife / explosive kills
//   banner(text, { kind: 'clear'|'boss'|'wipe', sub })   chrome banner centre-top, 0.25 s sweep in, 1.8 s hold
//   new KillLayer(parent, game) .kill({ mark, tint, hex, gold, head, knife, explosive, final })  .banner()  .update(dt)
import { injectCSS, tierShape } from './crosshairs.js';

export const KILLMARKS = {};
export function registerKillMark(id, spec) {
  // atlases start loading now so the first kill has its frames
  if (spec.src && !spec.img && typeof Image !== 'undefined') { spec.img = new Image(); spec.img.decoding = 'async'; spec.img.src = spec.src; }
  KILLMARKS[id] = spec;
  return spec;
}

const ANIM = 1.15;   // animated part of a mark (s); the headshot cells run 1.0 -> 1.17
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));

// ---------------------------------------------------------------------------- 破煞印: the generic original mark
// An octagonal seal frame, two crossed tapered blades, a diamond gem where they cross (the focal point).
function octo(ctx, c, R) { ctx.beginPath(); for (let i = 0; i <= 8; i++) { const a = (i + 0.5) * Math.PI / 4; ctx[i ? 'lineTo' : 'moveTo'](c + Math.sin(a) * R, c - Math.cos(a) * R); } ctx.closePath(); }
function blade(ctx, c, R, sgn) {
  // tip up-right (sgn 1) or up-left (-1); a guard bar near the hilt
  const L = R * 0.78, w = R * 0.11, ux = sgn * Math.SQRT1_2, uy = -Math.SQRT1_2, px = -uy, py = ux;
  const P = (s, o) => [c + ux * s + px * o, c + uy * s + py * o];
  const pts = [P(L, 0), P(L * 0.2, w), P(-L * 0.55, w * 0.55), P(-L * 0.75, w * 0.5), P(-L * 0.75, -w * 0.5), P(-L * 0.55, -w * 0.55), P(L * 0.2, -w)];
  ctx.beginPath(); pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y)); ctx.closePath();
  return { guard: [P(-L * 0.5, w * 2.1), P(-L * 0.5, -w * 2.1)] };
}
function gem(ctx, c, r) { ctx.beginPath(); ctx.moveTo(c, c - r); ctx.lineTo(c + r * 0.72, c); ctx.lineTo(c, c + r); ctx.lineTo(c - r * 0.72, c); ctx.closePath(); }

registerKillMark('km_generic', {
  draw(ctx, S, t, o) {
    const c = S / 2, R = S * 0.4, col = o.tint || '#ffc74a', gold = o.gold ? '#e8b54a' : '#d9d2c4', lw = S * 0.04;
    const p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
    ctx.clearRect(0, 0, S, S);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // beat 2: fill -- dark lacquer body, the element wash rising from the bottom
    if (p2 > 0) {
      ctx.save(); octo(ctx, c, R); ctx.clip();
      ctx.globalAlpha = p2 * 0.92; ctx.fillStyle = '#120d0b'; ctx.fillRect(0, 0, S, S);
      const g = ctx.createLinearGradient(0, c + R, 0, c - R);
      g.addColorStop(0, col); g.addColorStop(0.55, col + '55'); g.addColorStop(1, '#00000000');
      ctx.globalAlpha = p2 * 0.75; ctx.fillStyle = g; ctx.fillRect(0, c + R - 2 * R * p2, S, 2 * R * p2);
      ctx.restore();
    }
    // beats 1 + 3: the frame strokes (dash-drawn), glowing once filled
    const peri = 8 * 2 * R * Math.sin(Math.PI / 8);
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = S * 0.08 * p3;
    octo(ctx, c, R); ctx.setLineDash([peri * p1, peri]); ctx.lineWidth = lw * 1.9; ctx.strokeStyle = '#0b0807'; ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = gold; ctx.stroke();
    octo(ctx, c, R * 0.86); ctx.setLineDash([peri * 0.86 * Math.max(0, p1 * 1.3 - 0.3), peri]); ctx.lineWidth = lw * 0.45; ctx.strokeStyle = o.gold ? '#c8102e' : col; ctx.stroke();
    ctx.restore();
    // crossed blades: outline drawn in beat 1 (second half), filled bright in beat 2
    const bp = seg(t, 0.15, 0.45);
    for (const sgn of [1, -1]) {
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = S * 0.05 * p3;
      const { guard } = blade(ctx, c, R, sgn);
      if (p2 > 0) { const g = ctx.createLinearGradient(c - R, c + R, c + R, c - R); g.addColorStop(0, '#9a8f80'); g.addColorStop(0.6, '#fffaf0'); g.addColorStop(1, gold); ctx.globalAlpha = p2; ctx.fillStyle = g; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.setLineDash([R * 4 * bp, R * 4]); ctx.lineWidth = lw * 0.5; ctx.strokeStyle = '#0b0807'; ctx.stroke();
      ctx.setLineDash([]);
      if (bp > 0.6) { ctx.beginPath(); ctx.moveTo(...guard[0]); ctx.lineTo(...guard[1]); ctx.lineWidth = lw * 0.9; ctx.strokeStyle = gold; ctx.globalAlpha = (bp - 0.6) / 0.4; ctx.stroke(); }
      ctx.restore();
    }
    // beat 4: the gem "opens its eye"
    const gr = R * 0.17;
    if (p1 > 0.6) {
      ctx.save();
      gem(ctx, c, gr); ctx.fillStyle = '#0b0807'; ctx.fill(); ctx.lineWidth = lw * 0.5; ctx.strokeStyle = gold; ctx.stroke();
      if (p3 > 0) { gem(ctx, c, gr * 0.7); ctx.globalAlpha = 0.5 + 0.5 * p4; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = S * 0.06; ctx.fill(); }
      ctx.restore();
    }
    const fl = Math.sin(Math.PI * p4) + (o.head ? Math.max(0, 1 - Math.abs(t - 1.1) / 0.08) * 0.8 : 0);
    if (fl > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#ffffff'; ctx.shadowColor = col; ctx.shadowBlur = S * 0.05;
      const L = gr * (1.6 + fl * (o.head ? 3.6 : 1.8));
      ctx.lineWidth = lw * 0.35; ctx.globalAlpha = Math.min(1, fl);
      ctx.beginPath(); ctx.moveTo(c - L, c); ctx.lineTo(c + L, c); ctx.moveTo(c, c - L); ctx.lineTo(c, c + L);
      if (o.head) { const d = L * 0.45; ctx.moveTo(c - d, c - d); ctx.lineTo(c + d, c + d); ctx.moveTo(c + d, c - d); ctx.lineTo(c - d, c + d); }
      ctx.stroke(); ctx.restore();
    }
    // headshot: a thin element ring leaving the gem
    if (o.head && t > 1.0) {
      const u = Math.min(1, (t - 1.0) / 0.17);
      ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = col; ctx.lineWidth = lw * 0.35;
      ctx.beginPath(); ctx.arc(c, c, gr + (R * 1.05 - gr) * u, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  },
});

/** Renders a mark into a row-major atlas canvas (frames over 0..1.15 s, + 4 headshot cells) for export. */
export function bakeKillMark(id, { size = 256, frames = 24, cols = 6, tint, gold = false } = {}) {
  const spec = KILLMARKS[id];
  if (!spec?.draw) return null;
  const n = frames + 4, cv = document.createElement('canvas');
  cv.width = cols * size; cv.height = Math.ceil(n / cols) * size;
  const cell = document.createElement('canvas'); cell.width = cell.height = size;
  const cx = cell.getContext('2d'), ax = cv.getContext('2d');
  for (let i = 0; i < n; i++) {
    const head = i >= frames, t = head ? 1.0 + ((i - frames + 1) / 4) * 0.17 : (i / (frames - 1)) * ANIM;
    spec.draw(cx, size, t, { tint, gold, head });
    ax.drawImage(cell, (i % cols) * size, Math.floor(i / cols) * size);
  }
  return cv;
}

// -------------------------------------------------------------------------------------------- 八卦 streak ring
const TRIGRAMS = [[1, 1, 1], [1, 1, 0], [1, 0, 1], [1, 0, 0], [0, 1, 1], [0, 1, 0], [0, 0, 1], [0, 0, 0]];   // lines bottom -> top
function baguaSVG() {
  let s = '<svg class="bg8" viewBox="-40 -40 80 80"><circle class="yy" r="7"/>';
  TRIGRAMS.forEach((tri, i) => {
    s += `<g class="tg" style="--i:${i}" transform="rotate(${i * 45}) translate(0 -26)">`;
    tri.forEach((solid, j) => { const y = 5 - j * 5; s += solid ? `<rect x="-9" y="${y - 1.6}" width="18" height="3.2" rx=".6"/>` : `<rect x="-9" y="${y - 1.6}" width="7.5" height="3.2" rx=".6"/><rect x="1.5" y="${y - 1.6}" width="7.5" height="3.2" rx=".6"/>`; });
    s += '</g>';
  });
  return s + '</svg>';
}

const BADGE_ICON = {
  head: '<circle cx="0" cy="-2" r="7" fill="none" stroke-width="2"/><path d="M-11 -2H-5M5 -2H11M0 -13V-7M0 3V9" stroke-width="2"/><circle cx="0" cy="-2" r="1.6"/>',
  knife: '<path d="M-9 9 L6 -6 L9 -9 L8 -4 L-6 10 Z"/><path d="M-11 5 L-5 11" stroke-width="2.4"/>',
  explosive: '<polygon points="0,-11 2.8,-4 10,-5 5,0 10,6 2.6,4 0,11 -2.6,4 -10,6 -5,0 -10,-5 -2.8,-4"/>',
};

export class KillLayer {
  constructor(parent, game) {
    this.game = game;
    const root = this.root = document.createElement('div');
    root.className = 'kl';
    root.innerHTML = `<div class="km"><i class="km-rays"></i><canvas></canvas></div>
      <div class="cmb">${baguaSVG()}<div class="cmb-t"><b class="n ch"><s></s><u></u></b><i class="w ch"><s>COMBO!</s><u>COMBO!</u></i></div><em class="pr">精準！</em></div>
      <div class="kbadge"><svg viewBox="-24 -24 48 48">${tierShape('anti', 21, 'class="kb-f"')}<g class="kb-i"></g></svg></div>
      <div class="kbanner"><b class="ch"><s></s><u></u></b><small></small></div>`;
    parent.appendChild(root);
    this.km = root.querySelector('.km'); this.cv = this.km.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
    this.cmb = root.querySelector('.cmb'); this.cmbN = this.cmb.querySelectorAll('.n s, .n u'); this.cmbNum = this.cmb.querySelector('.n'); this.cells = [...this.cmb.querySelectorAll('.tg')];
    this.badge = root.querySelector('.kbadge'); this.badgeIcon = this.badge.querySelector('.kb-i');
    this.ban = root.querySelector('.kbanner'); this.banT = this.ban.querySelectorAll('b s, b u'); this.banS = this.ban.querySelector('small');
    this.cur = null; this.streak = 0; this.streakT = 0; this.heads = 0; this.lit = 0;
    this.badgeT = 0; this.banTime = 0; this.cmbFade = 0;
  }

  frames() { const q = this.game.renderer?.qualityName; return q === 'low' ? 12 : q === 'high' || q === 'ultra' ? 30 : 24; }

  /** A local kill. o: { mark (id or null = no mark), tint, gold, head, knife, explosive, final } */
  kill(o = {}) {
    this._streak(o);
    if (o.head || o.knife || o.explosive) this._badge(o.head ? 'head' : o.knife ? 'knife' : 'explosive', o.tint);
    const spec = o.mark && (KILLMARKS[o.mark] || KILLMARKS.km_generic);
    if (spec) this._play(spec, o);
  }

  _play(spec, o) {
    const S = this.game.renderer?.qualityName === 'low' ? 160 : 224;
    if (this.cv.width !== S) { this.cv.width = this.cv.height = S; }
    if (spec.src && !spec.img) { spec.img = new Image(); spec.img.src = spec.src; }
    const hold = 0.3 + (o.final ? 0.6 : 0);
    this.cur = { spec, o, t: 0, total: ANIM + (o.head ? 0.05 : 0) + hold + 0.3, frame: -1, dinged: false };
    this.km.classList.toggle('final', !!o.final);
    this.km.classList.add('on');
    this.km.style.setProperty('--kc', o.tint || '#ffc74a');
    this.km.style.setProperty('--ks', spec.scale || 1);          // spec.scale: a bigger emblem (mythic marks)
  }

  _drawMark(c) {
    const { spec, o } = c, S = this.cv.width, N = this.frames();
    const t = Math.min(c.t, ANIM + (o.head ? 0.05 : 0));
    const f = Math.min(N + (o.head ? 4 : 0) - 1, t > 1.0 && o.head && spec.src ? N + Math.floor((t - 1.0) / 0.17 * 4) : Math.floor(t / ANIM * (N - 1)));
    if (f === c.frame) return;
    c.frame = f;
    if (spec.draw) spec.draw(this.ctx, S, o.head && t > 1.0 ? t : (f / (N - 1)) * ANIM, o);
    else {
      // (still loading: a blank cell, never the previous mark's last frame)
      this.ctx.clearRect(0, 0, S, S);
      if (!spec.img?.complete || !spec.img.naturalWidth) { c.frame = -1; return; }
      const cols = spec.cols || 6, sz = spec.size || 256, fi = f >= N ? spec.frames + (f - N) : Math.round(f / (N - 1) * (spec.frames - 1));
      this.ctx.drawImage(spec.img, (fi % cols) * sz, Math.floor(fi / cols) * sz, sz, sz, 0, 0, S, S);
    }
  }

  _streak(o) {
    const g = this.game;
    const cont = this.streakT > 0;
    this.streak = cont ? this.streak + 1 : 1;
    this.heads = o.head ? (cont ? this.heads + 1 : 1) : 0;
    this.streakT = 3;
    const n = this.streak;
    // 八卦: one trigram per kill; the 8th fills the ring and bursts gold paper, the 9th starts a fresh ring
    if (this.lit >= 8) { this.lit = 0; for (const c of this.cells) c.classList.remove('on'); this.cmb.classList.remove('full'); }
    this.cells[this.lit]?.classList.add('on');
    this.lit++;
    if (this.lit === 8) { this.cmb.classList.add('full'); this._paper(); }
    // ding climbs a semitone per kill; a chord from the 5th (§1.9 #9)
    const p = Math.pow(2, Math.min(n - 1, 12) / 12);
    g.audio?.play('killmark_ding', { volume: 0.55, pitch: p });
    if (n >= 5) { g.audio?.play('killmark_ding', { volume: 0.3, pitch: p * 1.26 }); g.audio?.play('killmark_ding', { volume: 0.25, pitch: p * 1.5 }); }
    if ({ 2: 1, 3: 1, 5: 1, 10: 1 }[n]) g.audio?.play('streak_' + n);
    if (n < 2) { this.cmb.classList.remove('show', 'tier1', 'tier2', 'tier3'); this.cmb.classList.add('ring'); return; }
    for (const e of this.cmbN) e.textContent = n;
    const tier = n >= 30 ? 3 : n >= 20 ? 2 : n >= 10 ? 1 : 0;
    this.cmb.classList.remove('tier1', 'tier2', 'tier3');
    if (tier) this.cmb.classList.add('tier' + tier);
    this.cmb.classList.toggle('prec', this.heads >= 2);
    const first = !this.cmb.classList.contains('show');
    this.cmb.classList.add('show', 'ring');
    this.cmb.classList.remove('fade');
    this.cmb.classList.remove('pop', 'punch'); void this.cmb.offsetWidth; this.cmb.classList.add(first ? 'pop' : 'punch');
  }

  _paper() {
    for (let i = 0; i < 14; i++) {
      const p = document.createElement('i');
      p.className = 'gp';
      p.style.cssText = `--dx:${((Math.random() - 0.5) * 90).toFixed(0)}px;--dy:${(30 + Math.random() * 60).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;animation-delay:${(Math.random() * 0.12).toFixed(2)}s`;
      this.cmb.appendChild(p);
      setTimeout(() => p.remove(), 1300);
    }
  }

  _badge(kind, tint) {
    this.badgeIcon.innerHTML = BADGE_ICON[kind];
    this.badge.style.setProperty('--bc', kind === 'head' ? '#ff3b2f' : tint || '#ffd27a');
    this.badge.classList.remove('on'); void this.badge.offsetWidth; this.badge.classList.add('on');
    this.badgeT = 1.15;
  }

  /** Chrome banner (round clear, boss kill, wipe). */
  banner(text, { kind = 'clear', sub = '' } = {}) {
    for (const e of this.banT) e.textContent = text; this.banS.textContent = sub;
    this.ban.className = 'kbanner ' + kind;
    void this.ban.offsetWidth;
    this.ban.classList.add('on');
    this.banTime = 2.05;
  }

  update(dt) {
    const c = this.cur;
    if (c) {
      c.t += dt;
      this._drawMark(c);
      if (!c.dinged && c.t >= 1.0) { c.dinged = true; this.game.audio?.play('killmark_ding', { volume: 0.6, pitch: c.o.head ? 2 : 1 }); }   // 點睛 (octave up on a headshot)
      if (c.t >= c.total - 0.3) this.km.classList.remove('on');
      if (c.t >= c.total) this.cur = null;
    }
    if (this.streakT > 0 && (this.streakT -= dt) <= 0) { this.streak = 0; this.heads = 0; this.lit = 0; this.cmb.classList.add('fade'); this.cmb.classList.remove('show', 'ring', 'full'); for (const x of this.cells) x.classList.remove('on'); }
    if (this.badgeT > 0 && (this.badgeT -= dt) <= 0) this.badge.classList.remove('on');
    if (this.banTime > 0 && (this.banTime -= dt) <= 0) this.ban.classList.remove('on');
  }
}

injectCSS('cf-kl', `
.kl { position: fixed; inset: 0; pointer-events: none; }
.kl .km { position: fixed; left: 50%; bottom: calc(118px + var(--safe-bottom, 0px)); width: calc(112px * var(--ks, 1)); height: calc(112px * var(--ks, 1)); margin-left: calc(-56px * var(--ks, 1)); opacity: 0; transition: opacity .3s; }
.kl .km.on { opacity: 1; }
.kl .km canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.kl .km.final { transform: scale(1.25); transform-origin: 50% 100%; }
.kl .km-rays { position: absolute; inset: -40%; border-radius: 50%; opacity: 0; background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--kc) 70%, #fff) 0deg 5deg, transparent 5deg 30deg);
  -webkit-mask: radial-gradient(circle, #000 18%, transparent 68%); mask: radial-gradient(circle, #000 18%, transparent 68%); }
.kl .km.final .km-rays { opacity: .55; animation: kmRays 6s linear infinite; }
@keyframes kmRays { to { transform: rotate(60deg); } }
/* a skill card (hud .skcard, 22 % height) is up: the streak steps down under it instead of printing through its title */
body:has(.skcard.on) .kl .cmb { top: calc(22% + max(44px, 8.5vh)); }
body.touch .kl .km { left: 37%; bottom: calc(54px + var(--safe-bottom, 0px)); width: min(96px, 17vh); height: min(96px, 17vh); margin-left: calc(min(96px, 17vh) / -2); }
.kl .cmb { position: fixed; left: 31%; top: max(17%, 96px); display: flex; align-items: center; gap: 8px; opacity: 0; transform-origin: 0 50%; }
/* phones: smaller and further up-left, clear of the crosshair (at 844x390 it sat ~50 px above it, over the heads) */
body.touch .kl .cmb { left: 24%; top: max(15%, 58px); transform: scale(.8); }
.kl .cmb.ring { opacity: 1; }
.kl .cmb .cmb-t, .kl .cmb .pr { visibility: hidden; }
.kl .cmb.show .cmb-t { visibility: visible; } .kl .cmb.show.prec .pr { visibility: visible; }
.kl .cmb.fade { opacity: 0; transition: opacity .3s; }
.kl .cmb.pop .cmb-t { animation: cmbPop .09s ease-out both; }
.kl .cmb.punch .n { animation: cmbPunch .08s ease-out both; }
@keyframes cmbPop { from { transform: translateX(-20px) scale(1.6) skewX(-12deg); opacity: 0; } to { transform: skewX(-12deg); opacity: 1; } }
@keyframes cmbPunch { from { transform: scale(1.25); } to { transform: scale(1); } }
.kl .bg8 { width: 46px; height: 46px; overflow: visible; }
.kl .bg8 .yy { fill: none; stroke: rgba(255,255,255,.4); stroke-width: 1.2; }
.kl .bg8 .tg rect { fill: rgba(0,0,0,.45); stroke: rgba(255,255,255,.35); stroke-width: .7; transition: fill .15s; }
.kl .bg8 .tg.on rect { fill: #f2c14e; stroke: #fff6d0; }
.kl .cmb.full .bg8 .tg rect { fill: #ffd36b; filter: drop-shadow(0 0 3px #ffb43a); }
.kl .cmb.full .bg8 .yy { fill: #ffd36b; stroke: #fff; }
.kl .cmb-t { position: relative; display: flex; align-items: baseline; gap: 6px; transform: skewX(-12deg); filter: drop-shadow(0 3px 0 rgba(0,0,0,.5)); }
.kl .ch { position: relative; display: inline-block; font-family: var(--num); font-style: normal; font-weight: 900; line-height: 1; }
.kl .ch > s, .kl .ch > u { text-decoration: none; }
/* the #hud text-shadow would paint over a background-clip:text gradient and muddy it: gradient layers drop it */
.kl .ch > s { color: #0b0d10; -webkit-text-stroke: 4px #0b0d10; }
.kl .ch > u { position: absolute; left: 0; top: 0; color: transparent; text-shadow: none; background: linear-gradient(180deg, var(--c0) 8%, var(--c1) 34%, var(--c2) 52%, var(--c3) 74%, var(--c4) 96%); -webkit-background-clip: text; background-clip: text; }
.kl .cmb { --c0: #f6f8fa; --c1: #9aa3ad; --c2: #ffffff; --c3: #5d6670; --c4: #d0d6dd; }
.kl .cmb.tier1 { --c0: #fff6d0; --c1: #d9a03a; --c2: #fff6d8; --c3: #93601c; --c4: #ffd56a; }
.kl .cmb.tier2 { --c0: #ffe0c8; --c1: #d0541a; --c2: #fff0e0; --c3: #7a2208; --c4: #ff7a3a; }
.kl .cmb.tier3 { --c0: #ffd0d0; --c1: #c01818; --c2: #ffe8e8; --c3: #5a0808; --c4: #ff3030; }
.kl .cmb.tier3 .cmb-t::after { content: ''; position: absolute; left: -30%; right: -30%; top: 45%; height: 6px; z-index: -2; background: radial-gradient(ellipse at center, rgba(255,60,40,.9), rgba(255,40,30,0) 70%); filter: blur(1px); }
.kl .cmb .n { font-size: clamp(34px, 7.2vh, 52px); }
.kl .cmb .w { font-size: clamp(22px, 4.7vh, 34px); }
.kl .cmb .pr { align-self: flex-start; font: 800 13px var(--font); color: #ffe27a; text-shadow: 0 1px 2px #000; transform: rotate(-8deg); }
.kl .gp { position: absolute; left: 23px; top: 23px; width: 6px; height: 9px; background: linear-gradient(135deg, #fff1b8, #e8b54a 60%, #b8743a); animation: gpFall 1.2s ease-in forwards; }
@keyframes gpFall { 0% { transform: translate(0,0) rotate(0); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) rotate(var(--r)); opacity: 0; } }
.kl .kbadge { position: fixed; left: 50%; top: calc(50% + 64px); width: 44px; height: 44px; margin: -22px 0 0 -22px; opacity: 0; }
body.touch .kl .kbadge { top: calc(50% + 84px); width: 36px; height: 36px; margin: -18px 0 0 -18px; }
.kl .kbadge.on { animation: kbIn 1.15s both; }
@keyframes kbIn { 0% { transform: scale(1.4); opacity: 0; } 9% { transform: scale(1); opacity: 1; } 78% { opacity: 1; } 100% { opacity: 0; } }
.kl .kbadge svg { width: 100%; height: 100%; overflow: visible; }
.kl .kb-f { fill: #2b2f35; stroke: #c7cbd2; stroke-width: 2.4; filter: drop-shadow(0 1px 2px #000); }
.kl .kb-i { fill: var(--bc); stroke: var(--bc); }
.kl .kbanner { position: fixed; left: 50%; top: 30%; transform: translateX(-50%); text-align: center; opacity: 0; --c0: #f6f8fa; --c1: #8f98a3; --c2: #ffffff; --c3: #4f5761; --c4: #c7ced6; }
.kl .kbanner.boss, .kl .kbanner.wipe { --c0: #ffd0d0; --c1: #c01818; --c2: #ffe8e8; --c3: #5a0808; --c4: #ff3030; }
.kl .kbanner.on { animation: banIn 2.05s both; }
@keyframes banIn { 0% { opacity: 0; clip-path: inset(0 100% 0 0); } 12% { opacity: 1; clip-path: inset(0 0 0 0); } 85% { opacity: 1; } 100% { opacity: 0; } }
.kl .kbanner b { filter: drop-shadow(0 3px 0 rgba(0,0,0,.5)); font-size: clamp(30px, 7vh, 54px); letter-spacing: .04em; transform: skewX(-12deg); }
.kl .kbanner small { display: block; margin-top: 4px; font: 700 14px var(--font); letter-spacing: .2em; color: #e8d6a8; text-shadow: 0 1px 2px #000; }
`);
