// Mobile FPS controls: floating left stick, right-side look pad, fire buttons that also steer the view
// while held (CoD Mobile style), ADS toggle, reload / jump / crouch / grenade / use buttons and a weapon
// slot bar. Multi-touch: every pointer is bound to one role at pointerdown.
const SVG = {
  fire: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="9" fill="none" stroke="#fff" stroke-width="3"/><path d="M24 4v10M24 34v10M4 24h10M34 24h10" stroke="#fff" stroke-width="3"/></svg>',
  ads: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="14" fill="none" stroke="#fff" stroke-width="3"/><circle cx="24" cy="24" r="3" fill="#fff"/></svg>',
  reload: '<svg viewBox="0 0 48 48"><path d="M36 18a13 13 0 1 0 2 10" fill="none" stroke="#fff" stroke-width="3.5"/><path d="M38 8v11H27" fill="none" stroke="#fff" stroke-width="3.5"/></svg>',
  jump: '<svg viewBox="0 0 48 48"><path d="M12 30l12-12 12 12" fill="none" stroke="#fff" stroke-width="4"/></svg>',
  crouch: '<svg viewBox="0 0 48 48"><path d="M12 18l12 12 12-12" fill="none" stroke="#fff" stroke-width="4"/><path d="M12 36h24" stroke="#fff" stroke-width="3"/></svg>',
  grenade: '<svg viewBox="0 0 48 48"><circle cx="24" cy="28" r="11" fill="none" stroke="#fff" stroke-width="3"/><path d="M20 15h8v4h-8zM28 15l6-5" stroke="#fff" stroke-width="3" fill="none"/></svg>',
  use: '<svg viewBox="0 0 48 48"><path d="M16 22l8-8 8 8M24 14v22" fill="none" stroke="#fff" stroke-width="3.5"/></svg>',
  knife: '<svg viewBox="0 0 48 48"><path d="M10 38L34 10l4 4-24 26z" fill="#fff"/></svg>',
  special: '<svg viewBox="0 0 48 48"><path d="M24 6l5 12h13l-10 8 4 13-12-8-12 8 4-13-10-8h13z" fill="none" stroke="#fff" stroke-width="3"/></svg>',
  menu: '<svg viewBox="0 0 48 48"><path d="M12 15h24M12 24h24M12 33h24" stroke="#fff" stroke-width="3.5"/></svg>',
};

export class TouchControls {
  constructor(input, game, root = document.getElementById('ui')) {
    this.input = input;
    this.game = game;
    this.sens = 1;
    try { this.sens = +(localStorage.getItem('cf.touchSens') || 1); } catch { /* default */ }
    const el = document.createElement('div');
    el.id = 'touch';
    el.innerHTML = `
      <div class="t-look"></div>
      <div class="t-move"><div class="t-base"><div class="t-knob"></div></div></div>
      <button class="tb t-fire big" data-a="fire">${SVG.fire}</button>
      <button class="tb t-fire2" data-a="fire">${SVG.fire}</button>
      <button class="tb t-ads" data-a="ads">${SVG.ads}</button>
      <button class="tb t-reload" data-a="reload">${SVG.reload}</button>
      <button class="tb t-jump" data-a="jump">${SVG.jump}</button>
      <button class="tb t-crouch" data-a="crouch">${SVG.crouch}</button>
      <button class="tb t-grenade" data-a="grenade">${SVG.grenade}</button>
      <button class="tb t-special" data-a="special">${SVG.special}</button>
      <button class="tb t-use" data-a="use">${SVG.use}</button>
      <button class="tb t-menu" data-a="pause">${SVG.menu}</button>
      <button class="tb t-buy" data-a="buy">購買</button>
      <div class="t-slots"></div>`;
    root.appendChild(el);
    this.el = el;
    this.base = el.querySelector('.t-base');
    this.knob = el.querySelector('.t-knob');
    this.slotsEl = el.querySelector('.t-slots');
    this.ptr = new Map(); // pointerId -> { role, x, y, ox, oy, action }
    this.adsOn = false;
    this.crouchOn = false;
    el.addEventListener('pointerdown', (e) => this._down(e), { passive: false });
    this._wh = { move: (e) => this._move(e), up: (e) => this._up(e) };
    window.addEventListener('pointermove', this._wh.move, { passive: false });
    window.addEventListener('pointerup', this._wh.up);
    window.addEventListener('pointercancel', this._wh.up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.slotCache = '';
  }

  _down(e) {
    e.preventDefault();
    const t = e.target.closest('[data-a],[data-slot],.t-move,.t-look');
    if (!t) return;
    this.game.audio?.unlock();
    const p = { role: null, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY };
    if (t.dataset.slot) { this.input.press('slot' + t.dataset.slot); setTimeout(() => this.input.release('slot' + t.dataset.slot), 50); return; }
    const a = t.dataset.a;
    if (a === 'fire') { p.role = 'fire'; this.input.press('fire'); t.classList.add('on'); p.btn = t; }
    else if (a === 'ads') { this.adsOn = !this.adsOn; this.adsOn ? this.input.press('alt') : this.input.release('alt'); t.classList.toggle('on', this.adsOn); return; }
    else if (a === 'crouch') { this.crouchOn = !this.crouchOn; this.crouchOn ? this.input.press('crouch') : this.input.release('crouch'); t.classList.toggle('on', this.crouchOn); return; }
    else if (a) { p.role = 'btn'; p.action = a; this.input.press(a); t.classList.add('on'); p.btn = t; }
    else if (t.classList.contains('t-move')) {
      p.role = 'move';
      this.base.style.cssText = `display:block;left:${e.clientX}px;top:${e.clientY}px`;
      this.knob.style.transform = 'translate(-50%,-50%)';
    } else p.role = 'look';
    try { t.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    this.ptr.set(e.pointerId, p);
  }

  _move(e) {
    const p = this.ptr.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (p.role === 'look' || p.role === 'fire') {
      const k = 0.0052 * this.sens;
      this.input.addLook(dx * k, dy * k);
    } else if (p.role === 'move') {
      const R = 58;
      let mx = (e.clientX - p.ox) / R, my = (e.clientY - p.oy) / R;
      const l = Math.hypot(mx, my);
      if (l > 1) { mx /= l; my /= l; }
      const dead = 0.12;
      const mag = Math.max(0, (Math.min(1, l) - dead) / (1 - dead));
      const nx = l > 1e-4 ? (mx / Math.max(1, l)) : 0;
      this.input.setStick(l > 1e-4 ? (mx / Math.max(l, 1e-4)) * mag : 0, l > 1e-4 ? (-my / Math.max(l, 1e-4)) * mag : 0);
      this.knob.style.transform = `translate(calc(-50% + ${(mx * R).toFixed(1)}px), calc(-50% + ${(my * R).toFixed(1)}px))`;
      void nx;
    }
  }

  _up(e) {
    const p = this.ptr.get(e.pointerId);
    if (!p) return;
    this.ptr.delete(e.pointerId);
    if (p.role === 'fire') { if (![...this.ptr.values()].some((q) => q.role === 'fire')) this.input.release('fire'); p.btn?.classList.remove('on'); }
    else if (p.role === 'btn') { this.input.release(p.action); p.btn?.classList.remove('on'); }
    else if (p.role === 'move') { this.input.setStick(0, 0); this.base.style.display = 'none'; }
  }

  /** Refresh the weapon slot bar from the arsenal (cheap: only on change). */
  update() {
    const ar = this.game.arsenal;
    if (!ar) return;
    const canBuy = !!this.game.match?.canBuy();
    if (canBuy !== this._canBuy) { this._canBuy = canBuy; this.el.classList.toggle('can-buy', canBuy); }
    const slots = Object.keys(ar.owned).map(Number).sort();
    const key = slots.map((s) => s + ':' + ar.owned[s].def.id).join(',') + '|' + ar.slot;
    if (key === this.slotCache) return;
    this.slotCache = key;
    this.slotsEl.innerHTML = slots.filter((s) => s <= 3).map((s) => `<button class="slot${s === ar.slot ? ' on' : ''}" data-slot="${s}"><span>${s}</span>${ar.owned[s].def.zh}</button>`).join('');
  }

  setVisible(v) {
    this.el.style.display = v ? '' : 'none';
    if (!v) this.releaseAll();
  }

  /** Lets go of every held control (pause menu, buy menu, results). */
  releaseAll() {
    for (const p of this.ptr.values()) p.btn?.classList.remove('on');
    this.ptr.clear();
    this.base.style.display = 'none';
    this.input.setStick(0, 0);
    if (this.adsOn) { this.adsOn = false; this.el.querySelector('.t-ads')?.classList.remove('on'); }
  }

  dispose() {
    window.removeEventListener('pointermove', this._wh.move);
    window.removeEventListener('pointerup', this._wh.up);
    window.removeEventListener('pointercancel', this._wh.up);
    this.el.remove();
  }
}
