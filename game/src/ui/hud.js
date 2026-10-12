// In-game HUD (DOM, CS2-inspired): dynamic crosshair, hit / kill markers, damage-direction arcs, vitals,
// ammo, money, round banner, kill feed, boss bar, XP bar, toasts and optional floating damage numbers.
// DOM writes are batched: text only changes when the value changes.
import { weaponIcon } from './icons.js';

const el = (cls, parent, html = '') => { const d = document.createElement('div'); d.className = cls; if (html) d.innerHTML = html; parent?.appendChild(d); return d; };

const ICON_HP = '<svg viewBox="0 0 24 24"><path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z"/></svg>';
const ICON_ARMOR = '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5.2-3.4 9.6-8 11-4.6-1.4-8-5.8-8-11V5z"/></svg>';
const ICON_HEAD = '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="6"/><path d="M6 17h12v3H6z"/><circle cx="9.5" cy="9" r="1.6" fill="#000"/><circle cx="14.5" cy="9" r="1.6" fill="#000"/></svg>';

export class HUD {
  constructor(game, root = document.getElementById('hud')) {
    this.game = game;
    this.root = root;
    root.innerHTML = '';
    this.settings = { crosshairColor: '#4dff6a', crosshairGap: 4, crosshairLen: 9, crosshairThick: 2, dot: false, hitmarker: true, damageNumbers: false };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('cf.hud') || '{}')); } catch { /* defaults */ }
    // crosshair
    this.xh = el('xh', root);
    this.xhLines = ['t', 'b', 'l', 'r'].map((k) => el('xh-l xh-' + k, this.xh));
    this.xhDot = el('xh-dot', this.xh);
    this.hit = el('hitmark', root, '<i></i><i></i><i></i><i></i>');
    this.headIcon = el('hit-head', root, ICON_HEAD);
    // damage direction
    this.dirCv = document.createElement('canvas');
    this.dirCv.className = 'dmgdir';
    root.appendChild(this.dirCv);
    this.dirCtx = this.dirCv.getContext('2d');
    // vitals
    this.vitals = el('vitals', root, `<div class="hp">${ICON_HP}<b>100</b></div><div class="ar">${ICON_ARMOR}<b>0</b></div>`);
    this.hpEl = this.vitals.querySelector('.hp b');
    this.arEl = this.vitals.querySelector('.ar b');
    this.hpBox = this.vitals.querySelector('.hp');
    // ammo
    this.ammo = el('ammo', root, '<div class="mag"><b>0</b><span>/ 0</span></div><div class="wname"></div><img class="wicon" alt="">');
    this.magEl = this.ammo.querySelector('b');
    this.resEl = this.ammo.querySelector('span');
    this.wnameEl = this.ammo.querySelector('.wname');
    this.wiconEl = this.ammo.querySelector('.wicon');
    // money, round, feed, boss, xp, toast, prompt, numbers
    this.money = el('money', root, '<span>$</span><b>0</b>');
    this.moneyEl = this.money.querySelector('b');
    this.round = el('roundbar', root, '<div class="rt"></div><div class="rs"></div>');
    this.roundT = this.round.querySelector('.rt');
    this.roundS = this.round.querySelector('.rs');
    this.feed = el('feed', root);
    this.boss = el('bossbar', root, '<div class="bn"></div><div class="bb"><i></i><u></u></div>');
    this.bossName = this.boss.querySelector('.bn');
    this.bossFill = this.boss.querySelector('i');
    this.bossLag = this.boss.querySelector('u');
    this.xp = el('xpbar', root, '<b>Lv 1</b><div><i></i></div>');
    this.xpLv = this.xp.querySelector('b');
    this.xpFill = this.xp.querySelector('i');
    this.toastEl = el('toast', root);
    this.prompt = el('prompt', root);
    this.nums = el('dmgnums', root);
    this.cache = {};
    this.hitT = 0; this.hitKill = false; this.headT = 0;
    this.feedItems = [];
    this.bossLagV = 1;
    this.visible = true;
  }

  _set(key, node, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    node[prop] = value;
  }

  weaponChanged(ws) {
    this._set('wname', this.wnameEl, `${ws.def.zh} ${ws.def.en}`);
    weaponIcon(this.game.renderer, ws.def.id).then((url) => { if (url && this.game.arsenal.current === ws) this.wiconEl.src = url; });
  }
  ammoChanged() { /* picked up by update() */ }

  toast(text, ms = 1400) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  setPrompt(text) { this._set('prompt', this.prompt, text || ''); this.prompt.classList.toggle('on', !!text); }

  /** Called by weapons for every damaging hit. */
  onHit(info, res, target) {
    if (!this.settings.hitmarker) return;
    this.hitT = 1;
    if (res?.killed) this.hitKill = true;
    if (info.headshot) this.headT = 1;
    if (this.settings.damageNumbers && info.point) this._number(info.point, Math.round(res?.damage ?? info.amount), info.headshot);
    this.game.audio?.play(res?.killed ? (info.headshot ? 'headshot_kill' : 'killmarker') : info.headshot ? 'hitmarker_head' : 'hitmarker', { volume: 0.7 });
  }

  _number(point, n, head) {
    const d = el('dn' + (head ? ' head' : ''), this.nums, String(n));
    d._p = point.clone(); d._t = 0; d._dx = (Math.random() - 0.5) * 30;
    this._numsList = this._numsList || [];
    this._numsList.push(d);
    if (this._numsList.length > 24) this._numsList.shift().remove();
  }

  killFeed(killer, weaponId, victim, headshot) {
    const item = el('fi', null, `<span class="k">${killer}</span><img alt="">${headshot ? `<i class="hs">${ICON_HEAD}</i>` : ''}<span class="v">${victim}</span>`);
    weaponIcon(this.game.renderer, weaponId, { w: 160, h: 60 }).then((u) => { if (u) item.querySelector('img').src = u; });
    this.feed.prepend(item);
    this.feedItems.unshift({ el: item, t: 6 });
    while (this.feedItems.length > 5) this.feedItems.pop().el.remove();
  }

  setRound(title, sub) { this._set('rt', this.roundT, title || ''); this._set('rs', this.roundS, sub || ''); }
  setBoss(name, frac) {
    this.boss.classList.toggle('on', !!name);
    if (!name) return;
    this._set('bn', this.bossName, name);
    this.bossFill.style.width = (frac * 100).toFixed(1) + '%';
    this.bossLagV = Math.max(frac, this.bossLagV - 0.004);
    if (frac > this.bossLagV) this.bossLagV = frac;
    this.bossLag.style.width = (this.bossLagV * 100).toFixed(1) + '%';
  }

  update(dt) {
    const g = this.game;
    const st = g.status;
    const ar = g.arsenal;
    this.root.style.visibility = this.visible ? 'visible' : 'hidden';
    if (!this.visible) return;
    // crosshair: gap follows the real spread cone
    const def = ar?.def;
    const scoped = g.renderer.post.scopeMask > 0;
    const aim = g.vm?.aim ?? 0;
    const showXh = def && !scoped && def.cat !== 'melee' && aim < 0.6;
    this.xh.style.opacity = showXh ? 1 : 0;
    if (showXh) {
      const H = window.innerHeight;
      const focal = (H / 2) / Math.tan((g.camera.fov * Math.PI) / 360);
      const gapPx = Math.max(this.settings.crosshairGap, Math.tan((ar.spreadDeg() * Math.PI) / 180) * focal * 0.6);
      const s = this.settings, gp = Math.round(gapPx);
      const k = `${gp}|${s.crosshairColor}|${s.crosshairLen}|${s.crosshairThick}`;
      if (this.cache.xh !== k) {
        this.cache.xh = k;
        const [t, b, l, r] = this.xhLines;
        const L = s.crosshairLen, T = s.crosshairThick;
        const put = (n, w, h, x, y) => Object.assign(n.style, { width: w + 'px', height: h + 'px', left: x + 'px', top: y + 'px', background: s.crosshairColor });
        put(t, T, L, -T / 2, -gp - L); put(b, T, L, -T / 2, gp); put(l, L, T, -gp - L, -T / 2); put(r, L, T, gp, -T / 2);
        this.xhDot.style.cssText = `display:${s.dot ? 'block' : 'none'};background:${s.crosshairColor}`;
      }
    }
    // hit marker
    this.hitT = Math.max(0, this.hitT - dt * 5);
    this.hit.style.opacity = this.hitT.toFixed(2);
    this.hit.classList.toggle('kill', this.hitKill);
    if (this.hitT <= 0) this.hitKill = false;
    this.hit.style.transform = `translate(-50%,-50%) scale(${(1 + this.hitT * 0.25).toFixed(3)})`;
    this.headT = Math.max(0, this.headT - dt * 2.2);
    this.headIcon.style.opacity = this.headT.toFixed(2);
    // vitals
    if (st) {
      this._set('hp', this.hpEl, String(Math.max(0, Math.ceil(st.hp))));
      this._set('ar', this.arEl, String(Math.ceil(st.armor)));
      this.hpBox.classList.toggle('low', st.hp < 30);
    }
    // ammo
    const ws = ar?.current;
    if (ws) {
      const melee = ws.def.cat === 'melee';
      this.ammo.classList.toggle('melee', melee);
      this._set('mag', this.magEl, melee ? '∞' : String(ws.ammo));
      this._set('res', this.resEl, melee ? '' : '/ ' + ws.reserve);
      this.magEl.classList.toggle('low', !melee && ws.ammo <= Math.ceil(ws.def.mag * 0.25));
    }
    this._set('money', this.moneyEl, String(g.match?.money ?? 0));
    if (g.match) {
      const lv = g.match.level || 1;
      this._set('lv', this.xpLv, 'Lv ' + lv);
      this.xpFill.style.width = ((g.match.xpFrac || 0) * 100).toFixed(1) + '%';
    }
    // kill feed ageing
    for (let i = this.feedItems.length - 1; i >= 0; i--) {
      const it = this.feedItems[i];
      it.t -= dt;
      if (it.t < 0.5) it.el.style.opacity = Math.max(0, it.t * 2).toFixed(2);
      if (it.t <= 0) { it.el.remove(); this.feedItems.splice(i, 1); }
    }
    this._drawDirs(st);
    this._updateNumbers(dt);
  }

  _drawDirs(st) {
    const cv = this.dirCv;
    const W = window.innerWidth, H = window.innerHeight;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = this.dirCtx;
    if (!st || !st.hitDirs.length) { if (this._dirsDrawn) { ctx.clearRect(0, 0, W, H); this._dirsDrawn = false; } return; }
    ctx.clearRect(0, 0, W, H);
    this._dirsDrawn = true;
    const r = Math.min(W, H) * 0.22;
    for (const d of st.hitDirs) {
      const a = -d.angle - Math.PI / 2;
      ctx.strokeStyle = `rgba(230,30,20,${Math.min(1, d.t).toFixed(2)})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r, a - 0.32, a + 0.32);
      ctx.stroke();
    }
  }

  _updateNumbers(dt) {
    if (!this._numsList?.length) return;
    const cam = this.game.camera;
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = this._numsList.length - 1; i >= 0; i--) {
      const d = this._numsList[i];
      d._t += dt;
      if (d._t > 0.9) { d.remove(); this._numsList.splice(i, 1); continue; }
      const p = d._p.clone().project(cam);
      if (p.z > 1) { d.style.display = 'none'; continue; }
      d.style.display = '';
      const x = (p.x * 0.5 + 0.5) * W + d._dx * d._t, y = (-p.y * 0.5 + 0.5) * H - d._t * 50;
      d.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${(1 + Math.max(0, 0.25 - d._t) * 2).toFixed(2)})`;
      d.style.opacity = Math.min(1, (0.9 - d._t) * 3).toFixed(2);
    }
  }
}
