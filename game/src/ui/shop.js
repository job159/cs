// Buy menu (CS-style categories, touch friendly): weapon cards with silhouettes, price, stat bars and
// owned state; equipment (kevlar, helmet, ammo). Opens with B / the BUY button while buying is allowed.
import { WEAPONS, CATS } from '../weapons/defs.js';
import { weaponIcon } from './icons.js';

const TABS = [
  { id: 'pistol', zh: '手槍' }, { id: 'smg', zh: '衝鋒槍' }, { id: 'rifle', zh: '步槍' }, { id: 'shotgun', zh: '霰彈槍' },
  { id: 'mg', zh: '機槍' }, { id: 'sniper', zh: '狙擊槍' }, { id: 'heavy', zh: '重型' }, { id: 'melee', zh: '近戰' }, { id: 'gear', zh: '裝備' },
];

function stats(w) {
  const dps = (w.dmg * (w.pellets || 1) * w.rpm) / 60;
  const acc = 1 - Math.min(1, ((w.spread?.[0] ?? 2) + (w.spread?.[1] ?? 0.5) * 2) / 9);
  return [
    ['傷害', Math.min(1, Math.sqrt((w.dmg * (w.pellets || 1)) / 320))],
    ['射速', Math.min(1, w.rpm / 1200)],
    ['輸出', Math.min(1, dps / 900)],
    ['精準', acc],
    ['機動', Math.min(1, ((w.speed ?? 5) - 3.6) / 2)],
  ];
}

export class Shop {
  constructor(game, root = document.getElementById('ui')) {
    this.game = game;
    const el = document.createElement('div');
    el.id = 'shop';
    el.innerHTML = `<div class="shop-panel">
      <div class="shop-head"><b>購買裝備</b><span class="shop-money"></span><button class="shop-close">✕</button></div>
      <div class="shop-body"><nav class="shop-tabs"></nav><div class="shop-grid"></div></div></div>`;
    root.appendChild(el);
    this.el = el;
    this.grid = el.querySelector('.shop-grid');
    this.moneyEl = el.querySelector('.shop-money');
    this.tabsEl = el.querySelector('.shop-tabs');
    this.tab = 'rifle';
    this.tabsEl.innerHTML = TABS.map((t) => `<button data-tab="${t.id}">${t.zh}</button>`).join('');
    this.tabsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { this.tab = b.dataset.tab; this.render(); game.audio?.play('ui_click'); } });
    el.querySelector('.shop-close').addEventListener('click', () => this.close());
    this.grid.addEventListener('click', (e) => {
      const b = e.target.closest('[data-buy]');
      if (!b) return;
      const id = b.dataset.buy;
      const m = game.match;
      if (!m) return;
      if (id === 'armor' || id === 'helmet') m.buyArmor(id);
      else if (id === 'ammo') m.buyAmmo();
      else m.buy(id);
      this.render();
    });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.open = false;
  }

  toggle() { this.open ? this.close() : this.show(); }
  show() {
    if (!this.game.match?.canBuy()) { this.game.hud?.toast('只能在購買時間或購買區購買'); return; }
    this.open = true;
    this.el.classList.add('on');
    this.game.input.enabled = false;
    this.game.input.releaseAll();
    if (document.pointerLockElement) document.exitPointerLock();
    this.render();
  }
  close() { this.open = false; this.el.classList.remove('on'); this.game.input.enabled = true; }

  render() {
    const g = this.game, m = g.match;
    this.moneyEl.textContent = `$${m?.money ?? 0}`;
    for (const b of this.tabsEl.children) b.classList.toggle('on', b.dataset.tab === this.tab);
    if (this.tab === 'gear') {
      const st = g.status;
      const ws = g.arsenal.current;
      const ammoPrice = ws ? Math.max(50, Math.round(ws.def.price * 0.12)) : 0;
      this.grid.innerHTML = [
        ['armor', '防彈衣 Kevlar', '吸收 50% 傷害，耐久 100', 650, st.armor >= 100],
        ['helmet', '戰術頭盔 Helmet', '降低受擊晃動與畫面震動', 350, st.helmet],
        ['ammo', '彈藥補充', `補充目前武器兩個彈匣（${ws ? ws.def.zh : ''}）`, ammoPrice, false],
      ].map(([id, name, desc, price, owned]) => `<div class="card gear${owned ? ' owned' : ''}"><div class="cn">${name}</div><div class="cd">${desc}</div>
        <button data-buy="${id}" ${owned || (m?.money ?? 0) < price ? 'disabled' : ''}>${owned ? '已擁有' : '$' + price}</button></div>`).join('');
      return;
    }
    const owned = new Set(Object.values(g.arsenal.owned).map((w) => w.def.id));
    const list = Object.values(WEAPONS).filter((w) => w.cat === this.tab).sort((a, b) => a.price - b.price);
    this.grid.innerHTML = list.map((w) => `<div class="card${owned.has(w.id) ? ' owned' : ''}" data-id="${w.id}">
      <img alt=""><div class="cn">${w.zh} <small>${w.en}</small></div>
      <div class="cs">${stats(w).map(([k, v]) => `<div><span>${k}</span><i style="width:${(v * 100).toFixed(0)}%"></i></div>`).join('')}</div>
      <div class="cm">${w.mag ? `${w.mag} / ${w.reserve}` : '—'}　${CATS[w.cat]?.zh || ''}</div>
      <button data-buy="${w.id}" ${owned.has(w.id) || (m?.money ?? 0) < w.price ? 'disabled' : ''}>${owned.has(w.id) ? '已擁有' : '$' + w.price}</button></div>`).join('');
    for (const card of this.grid.querySelectorAll('[data-id]')) {
      weaponIcon(g.renderer, card.dataset.id).then((u) => { if (u) card.querySelector('img').src = u; });
    }
  }
}

export class PerkPicker {
  constructor(game, perks, root = document.getElementById('ui')) {
    this.game = game;
    const el = document.createElement('div');
    el.id = 'perks';
    el.innerHTML = '<div class="pk-title">升級　選擇強化</div><div class="pk-list"></div>';
    root.appendChild(el);
    this.el = el;
    this.list = el.querySelector('.pk-list');
    this.list.innerHTML = perks.map((p) => `<button data-p="${p.id}"><b>${p.zh}</b><span>${p.desc}</span></button>`).join('');
    this.list.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-p]');
      if (b) { game.match?.choosePerk(b.dataset.p); game.audio?.play('ui_click'); this.autoT = 8; }
    });
    this.autoT = 8;
  }
  update(dt) {
    const m = this.game.match;
    const on = !!m && m.pendingPerks > 0;
    this.el.classList.toggle('on', on);
    if (!on) { this.autoT = 8; return; }
    this.autoT -= dt;
    if (this.autoT <= 0) { m.choosePerk(); this.autoT = 8; }
  }
}
