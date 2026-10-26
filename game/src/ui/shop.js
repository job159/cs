// Buy menu (CS2-style, desktop first; touch still works). Tabs: the weapon series 制式 / 反災 / 異能 / 傳承 / 神兵
// with their tier frames (a premium weapon shows up once its def is listed: defs.js isListed), 裝備 (kevlar, helmet,
// ammo, grenades) and 強化 (the money upgrades + the level traits). Opens with the buy key (B) while buying is
// allowed: the buy time anywhere, mid-round inside a buy zone (weapons and gear only; upgrades wait for the buy time).
// Not every weapon is a gun: cards, ammo and stats follow rules.js resourceKind (ammo / arrows / mana / charges /
// none) and a def may describe itself with shopStats [[label, 0..1], ...]. Keyboard (CS2 style): the number on a
// card buys it, Q / E switch tabs, arrows + Enter move / press the focus (main.js _menuKey). Upgrades that do nothing
// yet (護甲 without kevlar, 技能充能 without a 克金 weapon) are dimmed with the reason.
// Also here: PerkPicker (the level-up trait choice: F1-F3 or click), the HUD upgrade badges beside the vitals and the
// money gain readout under the money counter. Economy rules: match/rules.js, match/match.js.
import { CATS, listed, tierOf, skillText, slotOf } from '../weapons/defs.js';
import { THROWABLES } from '../weapons/throwables.js';
import { ECONOMY, UPGRADES, PERKS, PERK, upgradePrice, encodeUpgrades, priceOf, resourceKind, xpFor } from '../match/rules.js';
import { KEYMAP } from '../engine/input.js';
import { weaponIcon } from './icons.js';
import { TIERS, tierIcon, injectCSS } from './crosshairs.js';
import { keycap, esc } from './keyhints.js';
import { inventory, itemNames } from './inventory.js';
import { GRADES, finishDef, finishSwatch } from '../gfx/finishes.js';

const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const cash = (n) => '$' + Math.round(n).toLocaleString('en-US');
const pips = (n, max) => Array.from({ length: max }, (_, i) => `<i${i < n ? ' class="on"' : ''}></i>`).join('');

const SERIES = [
  { id: 'standard', zh: '制式武器', en: 'STANDARD', note: '寫實制式槍械　回合初期的主力，隨時可換' },
  { id: 'anti', zh: '反災系列', en: 'ANTI-CALAMITY', note: '入門級克金　一個招牌機制，命中累積後施放' },
  { id: 'exotic', zh: '異能', en: 'EXOTIC', note: '雙模式或 1–2 個技能　專屬準星、尾跡與命中色' },
  { id: 'legacy', zh: '傳承', en: 'LEGACY', note: '六階成長線　越用越強' },
  { id: 'mythic', zh: '神兵', en: 'MYTHIC', note: '全套演出　技能、大招、危機護甲與專屬擊殺特效' },
];
// primaries first: the starting kit is a sidearm, the first buy is an SMG or a rifle
const CAT_ORDER = ['smg', 'rifle', 'shotgun', 'mg', 'sniper', 'heavy', 'bow', 'crossbow', 'staff', 'wand', 'melee', 'pistol', 'grenade'];
const CAT_ZH = { bow: '弓', crossbow: '弩', staff: '法杖', wand: '法器' };
const CAT_EN = { pistol: 'PISTOLS', smg: 'SMG', rifle: 'RIFLES', shotgun: 'SHOTGUNS', mg: 'MACHINE GUNS', sniper: 'SNIPERS', heavy: 'HEAVY',
  bow: 'BOWS', crossbow: 'CROSSBOWS', staff: 'STAVES', wand: 'FOCI', melee: 'MELEE', grenade: 'THROWABLES' };
const catZh = (c) => CATS[c]?.zh || CAT_ZH[c] || c;
const catRank = (c) => { const i = CAT_ORDER.indexOf(c); return i < 0 ? 99 : i; };
const SLOT_ZH = { 1: '主武器', 2: '副武器', 3: '近戰', 4: '投擲物' };
/** Card corner: the slot it takes (premium cards also name the kind: 步槍・主武器, 弓・主武器, 近戰). */
const slotTag = (w, prem) => { const s = slotOf(w), z = SLOT_ZH[s] || ''; return prem && s <= 2 ? `${catZh(w.cat)}・${z}` : prem ? catZh(w.cat) : z; };

const SVG = (d, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${d}</svg>`;
const ICON_AMMO = SVG('<path d="M5 10h4v11H5zM10 10h4v11h-4zM15 10h4v11h-4zM5 9c0-3 .9-5 2-6.4C8.1 4 9 6 9 9zM10 9c0-3 .9-5 2-6.4C13.1 4 14 6 14 9zM15 9c0-3 .9-5 2-6.4C18.1 4 19 6 19 9z"/>');
// money upgrade glyphs (shop tiles, HUD badges)
export const UP_ICON = {
  atk: SVG('<path d="M20.5 2.5H22V4L11 15l-2-2z"/><path d="M6 12.4l5.6 5.6-1.3 1.3-1.7-1.7-3 3-1.6-1.6 3-3-1.7-1.7z"/>'),
  hp: SVG('<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>'),
  armor: SVG('<path d="M12 2l8 3v6c0 5.2-3.4 9.6-8 11-4.6-1.4-8-5.8-8-11V5z"/>'),
  speed: SVG('<path d="M3.5 5l7 7-7 7-1.6-1.6L7.3 12 1.9 6.6zM12 5l7 7-7 7-1.6-1.6 5.4-5.4-5.4-5.4z"/>'),
  reload: SVG('<path d="M19.2 12.6A7.3 7.3 0 1 1 16.6 6" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M21.2 2.6v7.2H14z"/>'),
  ammo: ICON_AMMO,
  head: SVG('<circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="2.4"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" stroke="currentColor" stroke-width="2.2"/>'),
  charge: SVG('<path d="M13.5 2L4.5 13.5h6.5L9.5 22l10-12.5h-6.5z"/>'),
};
const GEAR_ICON = {
  armor: SVG('<path d="M8 2.5l4 2 4-2 3.5 2.5v15.3a1.2 1.2 0 0 1-1.2 1.2H5.7a1.2 1.2 0 0 1-1.2-1.2V5z"/><path d="M8 2.5c.4 2.6 1.8 4.2 4 4.2s3.6-1.6 4-4.2" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.2"/>'),
  helmet: SVG('<path d="M3 15.5a9 9 0 0 1 18 0v1.5H3z"/><path d="M1.5 17.5h21v2.2h-21z"/>'),
  ammo: ICON_AMMO,
  arrows: SVG('<path d="M4.5 19.5L18 6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20.5 3.5l-1.6 6.2-4.6-4.6zM4.5 19.5l.6-4.4 1.8 1.8zM4.5 19.5l4.4-.6-1.8-1.8z"/>'),
  frag: SVG('<path d="M6 3.4h4v2.4H6z"/><path d="M9.6 4.3l3.4-2.5 1 1.3-3.1 2.6z"/><ellipse cx="8" cy="12.7" rx="5.3" ry="6.3"/><path d="M3.2 11.2h9.6M3.2 14.2h9.6" stroke="#000" stroke-opacity=".35" stroke-width=".9"/>', '0 0 16 20'),
  fire: SVG('<path d="M6.3 5.2h3.4v3.1c1.9.9 2.9 2.4 2.9 4.6V19H3.4v-6.1c0-2.2 1-3.7 2.9-4.6z"/><path fill="#ff8a3a" d="M8 0c1.7 1.5 2.3 2.8 1.1 4.4H6.9C5.8 2.8 6.5 1.4 8 0z"/>', '0 0 16 20'),
};
const TAB_ICON = {
  gear: GEAR_ICON.armor,
  upgrade: SVG('<path d="M12 3l8 8h-5v3H9v-3H4zM9 16h6v2.4H9zM9 19.6h6V22H9z"/>'),
};
// level traits: F1-F3 choose (unless a binding took the key), see PerkPicker
export const PERK_KEYS = ['F1', 'F2', 'F3'];

/** Stat bars for a weapon card: a def's own shopStats, else melee or ranged ones from its numbers. */
function stats(w) {
  if (Array.isArray(w.shopStats)) return w.shopStats;
  const mob = Math.min(1, Math.max(0, ((w.speed ?? 5) - 3.6) / 2));
  if (resourceKind(w) === 'none') {
    const heavy = w.heavy?.dmg ?? w.dmg * 2.5;
    return [['傷害', Math.min(1, Math.sqrt(w.dmg / 300))], ['攻速', Math.min(1, (w.rpm || 60) / 240)], ['重擊', Math.min(1, Math.sqrt(heavy / 900))],
      ['範圍', Math.min(1, (w.range?.[0] ?? 1.8) / 4)], ['機動', mob]];
  }
  const shot = w.dmg * (w.pellets || 1), dps = (shot * (w.rpm || 60)) / 60;
  const acc = 1 - Math.min(1, ((w.spread?.[0] ?? 2) + (w.spread?.[1] ?? 0.5) * 2) / 9);
  return [['傷害', Math.min(1, Math.sqrt(shot / 320))], ['射速', Math.min(1, (w.rpm || 60) / 1200)], ['輸出', Math.min(1, dps / 900)], ['精準', acc], ['機動', mob]];
}

/** What a weapon card says about its ammunition (magazine / arrows / mana / charges / melee). */
function resText(w) {
  const k = resourceKind(w), r = typeof w.resource === 'object' ? w.resource : null, label = r?.label;
  if (k === 'none') return '近戰　不耗彈藥';
  if (k === 'mana') return `${label || '法力'} ${r?.max ?? w.mag ?? 100}　自動回復`;
  if (k === 'charges') return `${label || '充能'} ${r?.max ?? w.mag ?? ''} 格`;
  const res = Number.isFinite(w.reserve) ? w.reserve : '∞';
  return k === 'arrows' ? `${label || '箭矢'} ${w.mag}　備用 ${res}` : `彈匣 ${w.mag}　備彈 ${res}`;
}

/** A trait choice (shop and picker): key cap, name with the rank it reaches, what that rank does. */
function perkCard(id, traits, i, attr) {
  const p = PERK[id], r = (traits[id] || 0) + 1;
  return `<button class="pk" ${attr}="${id}"><kbd class="kc w">${PERK_KEYS[i] || ''}</kbd><span><b>${p.zh}${Number.isFinite(p.max) ? `<em class="pp">${pips(r, p.max)}</em>` : ''}</b><small>${p.desc(r)}</small></span></button>`;
}

export class Shop {
  constructor(game, root = document.getElementById('ui')) {
    this.game = game;
    const el = document.createElement('div');
    el.id = 'shop';
    el.innerHTML = `<div class="shop-panel" role="dialog" aria-label="購買選單">
      <header class="shop-head"><div class="shop-title"><b>購買</b><small>BUY MENU</small></div><div class="shop-phase"></div>
        <div class="shop-money"></div><button class="shop-close"></button></header>
      <div class="shop-body"><nav class="shop-tabs"></nav><div class="shop-main"></div></div>
      <footer class="shop-foot"></footer></div>`;
    root.appendChild(el);
    this.el = el;
    this.mainEl = el.querySelector('.shop-main');
    this.tabsEl = el.querySelector('.shop-tabs');
    this.moneyEl = el.querySelector('.shop-money');
    this.phaseEl = el.querySelector('.shop-phase');
    this.footEl = el.querySelector('.shop-foot');
    this.closeEl = el.querySelector('.shop-close');
    this.tab = 'standard';
    this.open = false;
    el.addEventListener('click', (e) => this._click(e));
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this._onKey = (e) => { if (!this.el.isConnected) { window.removeEventListener('keydown', this._onKey); return; } this._key(e); };
    window.addEventListener('keydown', this._onKey);
    this.badges = new UpgradeBadges(game);
    this.gain = new MoneyGain(game);
  }

  toggle() { if (this.open) this.close(true); else this.show(); }
  show() {
    const g = this.game;
    if (!g.match?.canBuy()) { g.hud?.toast('只能在購買時間或購買區購買'); g.audio?.play('ui_deny'); return; }
    this.open = true;
    this.el.classList.add('on');
    g.input.enabled = false;
    g.input.releaseAll();
    if (document.pointerLockElement) document.exitPointerLock();
    g.audio?.play('ui_open');
    this.render();
    clearInterval(this._iv);
    this._iv = setInterval(() => this._tick(), 200);
    g.app?._legend?.();   // the key legend under the menu (main.js)
  }
  /** relock: closed by the player (buy key / close button): straight back to mouse look on desktop. */
  close(relock = false) {
    clearInterval(this._iv);
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('on');
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
    this.game.input.enabled = true;
    this.game.app?._legend?.();
    if (relock) this._relock();
  }
  _relock() {
    const g = this.game, el = g.input?.el;
    if (!el || g.touch || document.pointerLockElement || matchMedia('(pointer: coarse)').matches) return;
    try { el.requestPointerLock?.()?.catch?.(() => {}); } catch { /* needs a user gesture: the lock hint asks for a click */ }
  }

  /** Upgrades / traits changed (match.js): the HUD badges, and the menu if it is open. */
  refresh() { this.badges.refresh(); if (this.open) this.render(); }
  /** Money earned (match.js addMoney): "+$300" under the HUD money counter. */
  moneyGain(n) { this.gain.add(n); }

  _tick() {
    if (!this.open || !this.el.isConnected) { clearInterval(this._iv); return; }
    this._head();
    if (this._signature() !== this._sig) this.render();
  }
  /** Everything the cards depend on: a change re-renders the open menu. */
  _signature() {
    const g = this.game, m = g.match, st = g.status, ar = g.arsenal, T = g.throwables;
    if (!m) return '';
    const owned = Object.values(ar?.owned || {}).map((w) => w.def.id + ':' + w.reserve).join(',');
    return `${m.money}|${m.canUpgrade()}|${encodeUpgrades(m.upgrades)}|${m.pendingPerks}|${Object.values(m.traits).join()}|${owned}|${ar?.current?.def.id}|`
      + `${Math.floor(st?.armor ?? 0)}|${st?.maxArmor}|${st?.helmet}|${st?.kevlar}|${T?.count.frag}|${T?.count.fire}`;
  }

  /**
   * Keyboard (desktop, CS2 style): 1-9 / 0 buy the numbered card of the tab, Q / E switch tabs; the arrow keys move
   * the focus between the tabs and the buy buttons and Enter presses the focused one (main.js _menuKey, the shop is
   * its root while open). The buy key closes the menu (game.js).
   */
  _key(e) {
    if (!this.open || !this.el.isConnected || e.repeat || e.ctrlKey || e.altKey || e.metaKey || document.body.classList.contains('fe-paused')) return;
    const g = this.game;
    const d = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
    if (d) {
      e.preventDefault();
      const n = d[1] === '0' ? 10 : +d[1];
      const card = this.mainEl.querySelector(`[data-n="${n}"]`), btn = card?.querySelector('.cbuy');
      if (!btn) return;
      btn.focus({ preventScroll: true });
      card.scrollIntoView({ block: 'nearest' });
      if (btn.disabled) { g.audio?.play('ui_deny'); card.classList.remove('deny'); void card.offsetWidth; card.classList.add('deny'); }
      else btn.click();
      return;
    }
    if (e.code === 'KeyQ' || e.code === 'KeyE') {
      e.preventDefault();
      const tabs = this._tabs(), i = tabs.findIndex((t) => t.id === this.tab);
      const next = tabs[(i + (e.code === 'KeyE' ? 1 : -1) + tabs.length) % tabs.length];
      if (next && next.id !== this.tab) { this.tab = next.id; g.audio?.play('ui_click'); this.render(); this.mainEl.scrollTop = 0; }
    }
  }

  _click(e) {
    const t = e.target.closest('[data-tab],[data-buy],[data-up],[data-perk],.shop-close');
    if (!t) return;
    const g = this.game, m = g.match;
    if (t.classList.contains('shop-close')) { this.close(true); return; }
    if (t.dataset.tab) { this.tab = t.dataset.tab; g.audio?.play('ui_click'); this.render(); this.mainEl.scrollTop = 0; return; }
    if (!m || t.disabled) return;
    let ok = false, key = '';
    if (t.dataset.up) { ok = m.buyUpgrade(t.dataset.up); key = 'up:' + t.dataset.up; }
    else if (t.dataset.perk) { ok = !!m.choosePerk(t.dataset.perk); key = 'tr:' + t.dataset.perk; if (ok) g.audio?.play('ui_equip'); }
    else {
      const id = t.dataset.buy;
      key = id;
      if (id === 'armor' || id === 'helmet') ok = m.buyArmor(id);
      else if (id === 'ammo') ok = m.buyAmmo();
      else if (id.startsWith('t_')) ok = m.buyThrowable(id.slice(2));
      else ok = m.buy(id);
    }
    this._flash = ok ? key : '';
    this.badges.refresh();
    this.render();
  }

  // ---------------------------------------------------------------- render
  _tabs() {
    const m = this.game.match, all = listed(), tabs = [];
    for (const s of SERIES) { const n = all.filter((w) => tierOf(w) === s.id).length; if (n) tabs.push({ ...s, n, icon: tierIcon(s.id, 15) }); }
    tabs.push({ id: 'gear', zh: '裝備', en: 'GEAR', icon: TAB_ICON.gear, sep: true });
    tabs.push({ id: 'upgrade', zh: '強化', en: 'UPGRADES', icon: TAB_ICON.upgrade, dot: m.pendingPerks > 0 });
    return tabs;
  }

  render() {
    const g = this.game, m = g.match;
    if (!m) return;
    const tabs = this._tabs();
    if (!tabs.some((t) => t.id === this.tab)) this.tab = tabs[0].id;
    // keyboard focus survives the re-render (a buy re-renders the cards): the same card's button / the same tab
    const fa = this.el.contains(document.activeElement) ? document.activeElement : null;
    const fk = fa?.dataset.tab ? 'tab:' + fa.dataset.tab : fa?.closest('[data-k]')?.dataset.k;
    this.tabsEl.innerHTML =tabs.map((t) => `${t.sep ? '<hr>' : ''}<button data-tab="${t.id}" class="${t.id === this.tab ? 'on' : ''}"><span class="ti">${t.icon}</span>`
      + `<span class="tl">${t.zh}<small>${t.en}</small></span>${t.n ? `<span class="n">${t.n}</span>` : ''}${t.dot ? '<i class="dot"></i>' : ''}</button>`).join('');
    this.closeEl.innerHTML = `${g.touch ? '' : keycap('buy')}<span>關閉</span>`;
    this._head();
    const top = this.mainEl.scrollTop;
    this.mainEl.innerHTML = this.tab === 'gear' ? this._gear() : this.tab === 'upgrade' ? this._upgrades() : this._weapons(this.tab);
    this.mainEl.scrollTop = top;
    for (const img of this.mainEl.querySelectorAll('img[data-icon]')) {
      // (a gun wearing an armory finish: its silhouette is painted with the finish, see _card)
      weaponIcon(g.renderer, img.dataset.icon).then((u) => { if (!u || !img.isConnected) return; img.src = u; img.parentElement.classList.contains('cskin') && img.parentElement.style.setProperty('--sil', `url(${u})`); });
    }
    if (this._flash) {
      const f = this.mainEl.querySelector(`[data-k="${this._flash}"]`);
      if (f) { f.classList.add('flash'); setTimeout(() => f.classList.remove('flash'), 600); }
      this._flash = '';
    }
    this._foot();
    this._sig = this._signature();
    if (fk) {
      const t = fk.startsWith('tab:') ? this.tabsEl.querySelector(`[data-tab="${fk.slice(4)}"]`) : this.mainEl.querySelector(`[data-k="${CSS.escape(fk)}"] .cbuy:not(:disabled)`);
      t?.focus({ preventScroll: true });
    }
  }

  _head() {
    const m = this.game.match;
    const money = cash(m.money);
    if (this.moneyEl.textContent !== money) this.moneyEl.textContent = money;
    const buyTime = m.state === 'warmup' || m.state === 'buy';
    const html = buyTime ? `<i></i><span>購買時間</span><b>${Math.max(0, Math.ceil(m.timer))}</b>` : '<i></i><span>購買區</span><small>回合中：武器與裝備</small>';
    if (html !== this._phaseH) { this._phaseH = html; this.phaseEl.innerHTML = html; this.phaseEl.classList.toggle('zone', !buyTime); }
  }

  /** Buy button: price, or why not (owned / full / locked); short of money shows how much is missing. */
  _btn(attr, id, price, { done, doneTxt, lock, lockTxt } = {}) {
    const m = this.game.match;
    if (done) return `<button class="cbuy" disabled><span class="ok">${doneTxt}</span></button>`;
    const poor = m.money < price;
    const tail = lock ? `<small class="lk">${lockTxt}</small>` : poor ? `<small>差 ${cash(price - m.money)}</small>` : '';
    return `<button class="cbuy" data-${attr}="${id}"${poor || lock ? ' disabled' : ''}><span>${cash(price)}</span>${tail}</button>`;
  }

  _weapons(tier) {
    const ar = this.game.arsenal, S = SERIES.find((s) => s.id === tier), T = TIERS[tier];
    const owned = new Set(Object.values(ar?.owned || {}).map((w) => w.def.id));
    const list = listed().filter((w) => tierOf(w) === tier);
    const cats = [...new Set(list.map((w) => w.cat))].sort((a, b) => catRank(a) - catRank(b));
    const intro = `<div class="tier-intro t-${tier}" style="--te:${T.edge};--th:${T.hi}">${tierIcon(tier, 20)}<b>${S.zh}</b><small>${S.en}</small><span>${S.note}</span></div>`;
    let n = 0;   // number keys 1-9, 0 in the order the cards appear
    // a series is a handful of weapons: one grid, the kind on each card; the standard arsenal goes by category
    if (tier !== 'standard') return intro + `<div class="shop-grid prem-grid">${list.sort((a, b) => catRank(a.cat) - catRank(b.cat) || priceOf(a) - priceOf(b)).map((w) => this._card(w, owned, ++n)).join('')}</div>`;
    return intro + cats.map((c) => `<div class="shop-sec">${catZh(c)}<small>${CAT_EN[c] || ''}</small></div><div class="shop-grid">`
      + list.filter((w) => w.cat === c).map((w) => this._card(w, owned, ++n)).join('') + '</div>').join('');
  }

  /** Number-key cap for the n-th card of a tab (1-9, then 0; none past ten, none on touch). */
  _num(n) { return n && n <= 10 && !this.game.touch ? `<kbd class="kc cnum">${n % 10}</kbd>` : ''; }

  _card(w, owned, n = 0) {
    const tier = tierOf(w), T = TIERS[tier] || TIERS.standard, prem = tier !== 'standard', sk = skillText(w), has = owned.has(w.id);
    const stripe = tier === 'mythic' ? `linear-gradient(90deg,${T.edge},${T.edge2},${T.edge})` : T.edge;
    // a standard gun with an equipped armory finish (CS2: your skins in the buy menu): the silhouette in the finish,
    // the grade colour along the bottom, the finish's name
    const it = !prem && inventory.equippedItem(w.id), G = it && (GRADES[finishDef(it.finish)?.grade] || GRADES.common);
    const style = prem ? ` style="--tc:${rgba(T.edge, 0.55)};--tb:${rgba(T.edge, 0.12)};--th:${T.hi};--tg:${rgba(T.edge, 0.7)};--ts:${stripe}"`
      : it ? ` style="--ts:${G.color};--gc:${G.color};--sw:${finishSwatch(it.finish)}"` : '';
    const img = `<img alt="" data-icon="${w.model || w.id}">`;
    return `<div class="card w${prem ? ' prem t-' + tier : ''}${it ? ' skin' : ''}${has ? ' owned' : ''}" data-k="${w.id}" data-n="${n}"${style}>
      <div class="ctop">${this._num(n)}${prem ? `${tierIcon(tier, 13)}<span class="tn">${T.zh}</span>` : ''}<span class="cslot">${slotTag(w, prem)}</span></div>
      ${it ? `<span class="cskin">${img}<span class="cfin" title="已裝備的塗裝（武器庫）"><i></i>${esc(itemNames(it).finish)}</span></span>` : img}
      <div class="cn">${w.zh}<small>${w.en}</small></div>
      ${sk ? `<div class="csk"><b>${sk.key} ${sk.zh}</b>${sk.desc}${sk.src ? `<small>充能：${sk.src}</small>` : ''}</div>` : ''}
      <div class="cs">${stats(w).map(([k, v]) => `<div><span>${k}</span><i style="--v:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></div>`).join('')}</div>
      <div class="cm">${resText(w)}</div>
      ${this._btn('buy', w.id, priceOf(w), { done: has, doneTxt: '已擁有' })}</div>`;
  }

  _gear() {
    const g = this.game, m = g.match, st = g.status, ws = g.arsenal?.current, T = g.throwables;
    const ammo = m.ammoOffer(ws), unit = ammo.kind === 'arrows' ? '支' : '發';
    let n = 0;
    const card = (it) => `<div class="card gear${it.done ? ' owned' : ''}" data-k="${it.id}" data-n="${++n}"><div class="gtop">${this._num(n)}<span class="gic">${it.icon}</span>`
      + `<div class="cn">${it.name}<small>${it.en}</small></div></div><div class="cd">${it.desc}</div>${it.now ? `<div class="cm">${it.now}</div>` : ''}`
      + this._btn('buy', it.id, it.price ?? 0, { done: it.done, doneTxt: it.doneTxt }) + '</div>';
    const armor = [
      { id: 'armor', icon: GEAR_ICON.armor, name: '防彈衣', en: 'KEVLAR', desc: `吸收 50% 傷害，隨受擊磨損${st.armorRegen ? `　脫戰修復 ${st.armorRegen}/秒` : ''}`,
        now: `耐久 ${Math.floor(st.armor)} / ${st.maxArmor}`, price: ECONOMY.armorPrice, done: st.armor >= st.maxArmor, doneTxt: '耐久已滿' },
      { id: 'helmet', icon: GEAR_ICON.helmet, name: '戰術頭盔', en: 'HELMET', desc: '受擊晃動與畫面震動減半', now: st.helmet ? '已配戴' : '',
        price: ECONOMY.helmetPrice, done: st.helmet, doneTxt: '已擁有' },
    ];
    const res = ws && Number.isFinite(ws.reserve) ? `${ws.def.zh}　備用 ${ws.reserve}` : ws ? ws.def.zh : '';
    const ammoCard = { id: 'ammo', icon: ammo.kind === 'arrows' ? GEAR_ICON.arrows : GEAR_ICON.ammo, name: ammo.label, en: { arrows: 'ARROWS', mana: 'MANA', charges: 'CHARGES' }[ammo.kind] || 'AMMO',
      desc: ammo.why ? '目前手上的武器' : `目前手上的武器 +${ammo.add} ${unit}`, now: res, price: ammo.price, done: !!ammo.why, doneTxt: ammo.why };
    const nades = Object.entries(THROWABLES).map(([k, t]) => {
      const n = T?.count[k] ?? 0;
      return { id: 't_' + k, icon: GEAR_ICON[k], name: t.zh, en: k === 'frag' ? 'HE GRENADE' : 'INCENDIARY',
        desc: k === 'frag' ? `範圍爆炸 ${t.dmg}，半徑 ${t.radius} m` : `落地起火 ${t.burn} 秒，每秒 ${t.dps}`, now: `持有 ${n} / ${t.max}`, price: t.price, done: n >= t.max, doneTxt: '已達上限' };
    });
    return `<div class="shop-sec">防具與彈藥<small>ARMOR &amp; AMMO</small></div><div class="shop-grid">${armor.map(card).join('')}${card(ammoCard)}</div>`
      + `<div class="shop-sec">投擲物<small>GRENADES</small><span class="sec-k">${g.touch ? '' : keycap('grenade')}</span></div><div class="shop-grid">${nades.map(card).join('')}</div>`;
  }

  _upgrades() {
    const g = this.game, m = g.match, open = m.canUpgrade();
    const tiles = UPGRADES.map((u, i) => {
      const l = m.upgrades[u.id] | 0, max = l >= u.max, note = max ? '' : m.upgradeNote?.(u.id) || '';
      // a note (護甲 without kevlar, 技能充能 without a 克金 weapon): still for sale, dimmed, the reason in gold
      return `<div class="up${max ? ' max' : ''}${note ? ' na' : ''}" data-k="up:${u.id}" data-n="${i + 1}"><div class="up-h">${this._num(i + 1)}<span class="up-ic">${UP_ICON[u.id]}</span>`
        + `<span class="up-n"><b>${u.zh}</b><small>${u.en}</small></span></div>`
        + `<div class="up-lvrow"><div class="up-pips">${pips(l, u.max)}</div><span class="up-lv">${max ? 'MAX' : 'Lv ' + l}<i>/${u.max}</i></span></div>`
        + `<div class="up-v"><span class="now">${u.show(l)}</span>${max ? '' : `<span class="arr">▸</span><span class="nx">${u.show(l + 1)}</span>`}</div>`
        + `<div class="up-d">${u.desc}${note ? `<em class="up-na">${note}</em>` : ''}</div>`
        + this._btn('up', u.id, upgradePrice(u.id, l), { done: max, doneTxt: '已達上限', lock: !open, lockTxt: '購買時間' }) + '</div>';
    }).join('');
    const lock = open ? '' : '<div class="upg-lock"><b>回合進行中</b>強化只在購買時間（回合之間）開放；購買區內仍可購買武器與裝備。</div>';
    return `${lock}<div class="upg"><section><div class="shop-sec">基礎面板<small>MONEY UPGRADES</small><span class="sec-n">本局有效・每位玩家各自強化</span></div>`
      + `<div class="ups">${tiles}</div></section><aside class="trs">${this._traits()}</aside></div>`;
  }

  _traits() {
    const m = this.game.match, pend = m.pendingPerks;
    const a = xpFor(m.level), b = xpFor(m.level + 1);
    let h = `<div class="tr-h"><b>戰技</b><small>TRAITS</small><span>Lv ${m.level}</span></div>`
      + `<div class="tr-xp"><i style="width:${(Math.max(0, Math.min(1, m.xpFrac || 0)) * 100).toFixed(1)}%"></i></div>`
      + `<div class="tr-xpn">${Math.floor(m.xp - a)} / ${b - a} XP</div>`
      + '<p class="tr-note">擊殺累積經驗，每次升級三選一。戰技是特殊能力（擊殺回血、賞金、彈藥回收⋯），基礎數值請用左側的金錢強化。</p>';
    if (pend > 0) h += `<div class="tr-sub">選擇戰技${pend > 1 ? `<em>${pend} 點</em>` : ''}</div><div class="tr-pick">${m.perkOptions().map((id, i) => perkCard(id, m.traits, i, 'data-perk')).join('')}</div>`;
    const owned = PERKS.filter((p) => m.traits[p.id] > 0);
    h += '<div class="tr-sub">已習得</div>' + (owned.length
      ? `<ul class="tr-own">${owned.map((p) => `<li data-k="tr:${p.id}"><b>${p.zh}</b><em class="pp">${pips(m.traits[p.id], p.max)}</em><small>${p.desc(m.traits[p.id])}</small></li>`).join('')}</ul>`
      : '<p class="tr-empty">尚未習得戰技</p>');
    return h;
  }

  _foot() {
    const g = this.game, ar = g.arsenal, st = g.status, T = g.throwables, m = g.match;
    const slot = (n) => { const ws = ar?.owned[n]; return ws ? `<span class="lo${ar.current === ws ? ' on' : ''}"><em>${n}</em>${ws.def.zh}</span>` : n === 1 ? '<span class="lo empty"><em>1</em>主武器：空</span>' : ''; };
    const ups = UPGRADES.filter((u) => m.upgrades[u.id] > 0).map((u) => `<i class="${m.upgrades[u.id] >= u.max ? 'max' : ''}" title="${u.zh}">${UP_ICON[u.id]}<b>${m.upgrades[u.id]}</b></i>`).join('');
    this.footEl.innerHTML = `<span class="lo-h">目前裝備</span>${slot(1)}${slot(2)}${slot(3)}`
      + `<span class="lo">${GEAR_ICON.frag}${T?.count.frag ?? 0}${GEAR_ICON.fire}${T?.count.fire ?? 0}</span>`
      + `<span class="lo">${GEAR_ICON.armor}${Math.floor(st.armor)}${st.helmet ? `${GEAR_ICON.helmet}` : ''}</span>`
      + (ups ? `<span class="lo-up">${ups}</span>` : '');
  }
}

// ------------------------------------------------------------------------------------- HUD: upgrade badges
// Owned upgrade levels as small glyphs right of the vitals (only what was bought; gold at max), refreshed on change.
class UpgradeBadges {
  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'upb';
    (game.hud?.vitals || game.hud?.root || document.getElementById('hud'))?.appendChild(this.el);
    this.key = null;
  }
  refresh() {
    const m = this.game.match, key = m ? encodeUpgrades(m.upgrades) : '';
    if (key === this.key) return;
    this.key = key;
    this.el.innerHTML = m ? UPGRADES.filter((u) => m.upgrades[u.id] > 0)
      .map((u) => `<i class="${m.upgrades[u.id] >= u.max ? 'max' : ''}">${UP_ICON[u.id]}<b>${m.upgrades[u.id]}</b></i>`).join('') : '';
  }
}

// "+$300" under the HUD money counter; gains within 1.6 s add up (CS2)
class MoneyGain {
  constructor(game) { this.game = game; this.sum = 0; this.t = -1e9; this.el = null; }
  add(n) {
    const host = this.game.hud?.money;
    if (!host || !(n > 0)) return;
    if (!this.el?.isConnected) { this.el = document.createElement('span'); this.el.className = 'mgain'; host.appendChild(this.el); }
    const now = performance.now();
    this.sum = now - this.t < 1600 ? this.sum + n : n;
    this.t = now;
    this.el.textContent = '+' + cash(this.sum);
    this.el.classList.remove('on'); void this.el.offsetWidth; this.el.classList.add('on');
  }
}

injectCSS('cf-upb', `
#hud .upb { display: flex; align-items: center; gap: 9px; margin-left: 4px; padding-left: 12px; border-left: 1px solid rgba(255,255,255,.16); }
#hud .upb:empty { display: none; }
#hud .upb i { display: flex; align-items: flex-end; gap: 1px; font-style: normal; color: #e9e6df; opacity: .82; }
#hud .upb i svg { width: 17px; height: 17px; fill: currentColor; color: inherit; filter: drop-shadow(0 1px 1px #000); }
#hud .upb i b { font: 700 14px/1 var(--num); min-width: 0; letter-spacing: 0; margin-bottom: -1px; }
#hud .upb i.max { color: #f2c66b; opacity: 1; }
#hud .upb i.max svg { filter: drop-shadow(0 0 3px rgba(242,181,68,.6)) drop-shadow(0 1px 1px #000); }
body.touch #hud .upb { display: none; }
#hud .money .mgain { position: absolute; left: 2px; top: 100%; margin-top: -2px; font: 700 17px/1 var(--num); color: #8fe388; opacity: 0; pointer-events: none; white-space: nowrap; }
#hud .money .mgain.on { animation: cfMgain 1.7s ease-out forwards; }
@keyframes cfMgain { 0% { opacity: 0; transform: translateY(-5px); } 8% { opacity: 1; transform: none; } 72% { opacity: 1; } 100% { opacity: 0; transform: translateY(4px); } }
`);

// ------------------------------------------------------------------------------------------ level-up traits
const AUTO = 12;   // s before the first offered trait is taken for the player

/**
 * Level-up trait choice (left, under the money): three offers, F1-F3 or a click; auto-picks after AUTO s. Only in
 * the buy time (QA: a strong player levels ~20 times by round 8 and the card kept opening mid-fight): during a round
 * the points wait as a small gold "戰技點" pill on the XP bar. F1-F3 never reach the browser (help / find) in a match.
 */
export class PerkPicker {
  constructor(game, perks, root = document.getElementById('ui')) {
    this.game = game;
    const el = document.createElement('div');
    el.id = 'perks';
    el.innerHTML = '<div class="pk-title"><b>等級提升</b><span>選擇戰技</span><em></em></div><div class="pk-list"></div><div class="pk-auto"><i></i></div>';
    root.appendChild(el);
    this.el = el;
    this.list = el.querySelector('.pk-list');
    this.countEl = el.querySelector('.pk-title em');
    this.autoEl = el.querySelector('.pk-auto i');
    // mid-round: the pending points as a pill beside the level
    this.mini = document.createElement('span');
    this.mini.className = 'pk-mini';
    (game.hud?.xp || game.hud?.root)?.appendChild(this.mini);
    this.list.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-p]');
      if (b) this.pick(b.dataset.p);
    });
    this._key = (e) => {
      if (!this.el.isConnected) { window.removeEventListener('keydown', this._key, true); return; }
      const i = PERK_KEYS.indexOf(e.code);
      if (i < 0 || KEYMAP[e.code]) return;
      e.preventDefault();   // (F1 help / F3 find: never mid-match)
      // the picker, or the shop's 強化 tab (same offers)
      const shop = this.game.shop, inShop = !!shop?.open && shop.tab === 'upgrade';
      if (e.repeat || !(this.on || inShop) || document.body.classList.contains('fe-paused')) return;
      const id = this.game.match?.perkOptions()[i];
      if (id) this.pick(id);
    };
    window.addEventListener('keydown', this._key, true);
    this.autoT = AUTO;
    this.sig = '';
  }
  pick(id) {
    const p = this.game.match?.choosePerk(id);
    if (!p) return;
    this.game.audio?.play('ui_equip');
    if (!this.game.shop?.open) this.game.hud?.toast(`戰技：${p.zh}`, 1200);
    this.autoT = AUTO;
  }
  update(dt) {
    const g = this.game, m = g.match;
    const pend = m?.pendingPerks || 0, buyTime = m?.state === 'warmup' || m?.state === 'buy';
    const on = pend > 0 && buyTime && !g.shop?.open && g.status?.alive !== false;
    if (this.on !== on) { this.on = on; this.el.classList.toggle('on', on); }
    const mini = pend > 0 && !on && !g.shop?.open ? `<b>戰技點 ${pend}</b><small>購買時間選擇</small>` : '';
    if (this.miniH !== mini) { this.miniH = mini; this.mini.innerHTML = mini; this.mini.classList.toggle('on', !!mini); }
    if (!on) { this.autoT = AUTO; return; }
    const opts = m.perkOptions();
    const sig = opts.join() + '|' + m.pendingPerks + '|' + opts.map((id) => m.traits[id] | 0).join();
    if (sig !== this.sig) {
      this.sig = sig;
      this.list.innerHTML = opts.map((id, i) => perkCard(id, m.traits, i, 'data-p')).join('');
      this.countEl.textContent = m.pendingPerks > 1 ? `${m.pendingPerks} 點` : '';
    }
    this.autoT -= dt;
    this.autoEl.style.transform = `scaleX(${Math.max(0, this.autoT / AUTO).toFixed(3)})`;
    if (this.autoT <= 0) this.pick(opts[0]);
  }
}
