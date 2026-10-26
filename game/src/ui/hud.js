// In-game HUD (DOM, CS2-inspired with the CSO zombie-mode layer): SVG crosshair registry (hit-reactive for premium
// tiers), skill meters around the crosshair, hit / kill markers, damage-direction wedges, vitals, ammo, money,
// round banner, kill feed, boss bar, XP bar, toasts, two-tier floating damage numbers, kill marks + streak, the
// skill dock (desktop ★/Q), skill CARD, ready border pulse, skill hint card, crisis-armour and aura chips.
// DOM writes are batched: text only changes when the value changes.
//
// Hooks other systems call (all optional-chained by callers):
//   onHit(info, res, target)              every damaging hit by us
//   killFeed(killer, weaponId, victim, head)   ('你' = a local kill: kill mark, streak, badge)
//   onSkillReady(ws) / readyPulse(ws) / onSkillDenied(ws, slot, c) / onSkillCast(ws, slot, sk, inst) / onCrisis(ws, cfg)
//   card(text, { color, sub })            招式名卡 CARD (§1.7.5): brush reveal 0.8 s, hold 1.2 s, fade 0.3 s at 22 % height
//   border(color, alpha <= 0.35, dur)     element screen border (DOM; §1.9 #4)
//   banner(text, { kind, sub })           chrome banner (round clear / boss / wipe)
//   showSkillHint(ws, force)              技能提示卡 (§1.9 #11)
//   clipEvent(id, o)                      clip 'hud' events: card | border | banner | hint | toast
//   setPrompt(text, use) / toast(text)    "按 E" / "按住 E" / "長按 ★" in the text become keycaps of the live bindings
//
// Desktop key hints (ui/keyhints.js; settings.keyHints, default on; hidden on touch): [B] 商店 / [Esc] 選單 by the
// money (a gold dot on 商店 while an upgrade / trait waits in the buy time), [R] 換彈 by a low magazine, [2] 副武器
// when the held weapon is dry mid-round, [B] 補充彈藥 when the reserve runs short where we can buy, [F] 檢視 by the
// weapon, [1]-[5] + [G] on the weapon bar (CS2 inventory: owned slots, grenade counts by type), [Q] / 長按 [Q] /
// mouse buttons with the skill names on the skill dock. The reserve counter pulses under one magazine.
// What the held weapon spends (ammo panel) -- not every weapon is a gun:
//   def.resource = 'ammo' | 'arrows' | 'mana' | 'charges' | 'none'  (or { kind, label, color }); by default from the
//   cat (melee none, bow / crossbow arrows, staff / wand mana, else ammo). Values: ws.ammo of def.mag, ws.reserve,
//   unless the special reports its own pool: special.resource(ws, g) -> { kind?, value, max, reserve?, label?, color? }.
// Teammate name tags (player/remote.js .nametag) fade while they sit over a HUD panel.
// Holding the 'score' action (Tab) shows the scoreboard (ui/scoreboard.js) over the rest; it never takes input.
import { weaponIcon } from './icons.js';
import * as SP from '../weapons/specials.js';
import { specialOf, hudInfo, auraState, paletteOf } from '../weapons/specials.js';
import { WEAPONS } from '../weapons/defs.js';
import { CrosshairView, MeterView, StarView, tierShape, injectCSS, registerCrosshair, CROSSHAIRS } from './crosshairs.js';
import { DamageNumbers } from './dmgnums.js';
import { KillLayer, registerKillMark, bakeKillMark } from './killmarks.js';
import { KeyHints, keycap, keyify, esc, bindSig } from './keyhints.js';
import { Scoreboard } from './scoreboard.js';

const el = (cls, parent, html = '') => { const d = document.createElement('div'); d.className = cls; if (html) d.innerHTML = html; parent?.appendChild(d); return d; };

const ICON_HP = '<svg viewBox="0 0 24 24"><path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z"/></svg>';
const ICON_ARMOR = '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5.2-3.4 9.6-8 11-4.6-1.4-8-5.8-8-11V5z"/></svg>';
const ICON_HEAD = '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="6"/><path d="M6 17h12v3H6z"/><circle cx="9.5" cy="9" r="1.6" fill="#000"/><circle cx="14.5" cy="9" r="1.6" fill="#000"/></svg>';
const AURA_ICON = { dmg: '<path d="M4 20L16 8l2-4 2 2-4 2L4 20z"/>', reloadSpeed: '<path d="M18 9a7 7 0 1 0 1 6" fill="none" stroke-width="2.6"/><path d="M19 3v6h-6"/>', regen: '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>' };
// crosshair by tier when the weapon names none (§1.9 #2: exotic and up get their own)
const TIER_XH = { exotic: 'xh_ring', legacy: 'xh_ring', mythic: 'xh_gem' };
const skinOf = (def) => def?.premium?.dmgSkin || ({ anti: 'anti', exotic: 'exotic', legacy: 'exotic', mythic: 'mythic' }[def?.tier || (def?.special ? 'anti' : '')] || 'standard');
const TAG_POS = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/;
// what a weapon spends when its def names nothing (def.resource)
const RES_BY_CAT = { melee: 'none', bow: 'arrows', crossbow: 'arrows', staff: 'mana', wand: 'mana' };
const RES_ICON = {
  arrows: '<svg viewBox="0 0 24 24"><path d="M4.5 19.5L18 6" fill="none" stroke-width="2"/><path d="M20.5 3.5l-1.6 6.2-4.6-4.6z"/><path d="M4.5 19.5l.6-4.4 1.8 1.8zM4.5 19.5l4.4-.6-1.8-1.8zM7.2 16.8l.6-4.4 1.8 1.8zM7.2 16.8l4.4-.6-1.8-1.8z"/></svg>',
  mana: '<svg viewBox="0 0 24 24"><path d="M12 2l6.5 9.5L12 22l-6.5-10.5z"/><path d="M12 2v20M5.5 11.5h13" fill="none" stroke-width="1" opacity=".55"/></svg>',
  charges: '<svg viewBox="0 0 24 24"><path d="M13.5 2L4.5 13.5h6.5L9.5 22l10-12.5h-6.5z"/></svg>',
};
const SLOT_ZH = { 1: '主武器', 2: '副武器', 3: '近戰' };
const GREN_ICON = {
  frag: '<svg viewBox="0 0 16 20"><path d="M6 3.4h4v2.4H6z"/><path d="M9.6 4.3l3.4-2.5 1 1.3-3.1 2.6z"/><ellipse cx="8" cy="12.7" rx="5.3" ry="6.3"/><path d="M3.2 11.2h9.6M3.2 14.2h9.6" stroke="#000" stroke-opacity=".35" stroke-width=".9"/></svg>',
  fire: '<svg viewBox="0 0 16 20"><path d="M6.3 5.2h3.4v3.1c1.9.9 2.9 2.4 2.9 4.6V19H3.4v-6.1c0-2.2 1-3.7 2.9-4.6z"/><path class="fl" d="M8 0c1.7 1.5 2.3 2.8 1.1 4.4H6.9C5.8 2.8 6.5 1.4 8 0z"/></svg>',
};

export class HUD {
  constructor(game, root = document.getElementById('hud')) {
    this.game = game;
    this.root = root;
    root.innerHTML = '';
    // headless QA: castSkill, hudInfo, meterAdd, startSkill... and the HUD registries
    if (game.debug) { game.debug.specials = SP; game.debug.hudkit = { registerCrosshair, registerKillMark, bakeKillMark }; }
    // damage numbers are on by default (the CSO feel); readyReminder = the 2.5 s ready reminder (§1.7.1);
    // screenBorder = element screen borders (§1.14 #6); keyHints = desktop keycap hints (ui/keyhints.js)
    this.settings = { crosshairColor: '#4dff6a', crosshairGap: 4, crosshairLen: 9, crosshairThick: 2, dot: true, hitmarker: true, damageNumbers: true, readyReminder: true, screenBorder: true, keyHints: true };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('cf.hud') || '{}')); } catch { /* defaults */ }
    // ready border pulse + buff border sit under everything else
    this.borderEl = el('skborder', root);
    // crosshair + its meters
    this.xh = new CrosshairView(root);
    this.mts = el('mts', root);
    this.meterViews = []; this.meterKey = '';
    this.hit = el('hitmark', root, '<i></i><i></i><i></i><i></i>');
    this.headIcon = el('hit-head', root, ICON_HEAD);
    // damage direction wedges (06b §9.3.5)
    this.dirEl = el('dmgdir2', root);
    this.dirWedges = [];
    // vitals + crisis armour / aura chips
    this.vitals = el('vitals', root, `<div class="hp">${ICON_HP}<b>100</b></div><div class="ar">${ICON_ARMOR}<b>0</b></div>`);
    this.hpEl = this.vitals.querySelector('.hp b');
    this.arEl = this.vitals.querySelector('.ar b');
    this.hpBox = this.vitals.querySelector('.hp');
    this.chips = el('skchips', root);
    this.crisisEl = el('crisis', this.chips, `<svg viewBox="-14 -14 28 28">${tierShape('legacy', 12, 'class="cr-bg"')}<clipPath id="crClip"><rect class="cr-clip" x="-14" y="14" width="28" height="28"/></clipPath>${tierShape('legacy', 12, 'class="cr-fill" clip-path="url(#crClip)"')}${tierShape('legacy', 12, 'class="cr-edge"')}</svg><span></span>`);
    this.crisisClip = this.crisisEl.querySelector('.cr-clip');
    this.crisisLabel = this.crisisEl.querySelector('span');
    this.auraEl = el('auras', this.chips);
    // ammo: what the held weapon spends (magazine / arrows / mana / charges / nothing), name, silhouette
    this.ammo = el('ammo', root, '<div class="mag"><i class="rk"></i><b>0</b><span>/ 0</span></div><div class="rbar"></div><div class="wname"></div><div class="wrow"><img class="wicon" alt=""></div>');
    this.magRow = this.ammo.querySelector('.mag');
    this.magEl = this.magRow.querySelector('b');
    this.resEl = this.magRow.querySelector('span');
    this.rkEl = this.magRow.querySelector('.rk');
    this.rbar = this.ammo.querySelector('.rbar');
    this.wnameEl = this.ammo.querySelector('.wname');
    this.wiconEl = this.ammo.querySelector('.wicon');
    this.meter = el('spmeter', this.ammo, '<span></span><div><i></i><u></u></div>');
    this.meterLabel = this.meter.querySelector('span');
    this.meterFill = this.meter.querySelector('i');
    this.meterWin = this.meter.querySelector('u');
    // desktop skill dock: ★ face + the skill names with their keys ([Q] tap / 長按 [Q] ultimate / mouse alt);
    // touch shows these on its buttons instead
    this.dock = el('skdock', root, '<div class="sk-star"></div><div class="sk-lab"><div class="sk-l sk-tap"></div><div class="sk-l sk-ult"></div><div class="sk-l sk-alt"></div></div>');
    this.star = new StarView(this.dock.querySelector('.sk-star'));
    this.skTap = this.dock.querySelector('.sk-tap');
    this.skUlt = this.dock.querySelector('.sk-ult');
    this.altEl = this.dock.querySelector('.sk-alt');
    // weapon bar (desktop, CS2 inventory): owned slots with their keys + the grenade row; wakes on a switch
    this.inv = el('inv', root);
    this.invWake = 0;
    // money (+ [B] 商店 / [Esc] 選單), round, feed, boss, xp, toast, prompt
    this.money = el('money', root, '<span>$</span><b>0</b><i class="mkh"></i>');
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
    this.spec = el('spec', root);     // spectating line while bled out (bottom centre, clear of the COMBO)
    // CSO layer: numbers, kill marks / streak / badges / banners, skill CARD, hint card
    this.nums = new DamageNumbers(root, game);
    this.kills = new KillLayer(root, game);
    this.cardEl = el('skcard', root, '<b></b><svg viewBox="0 0 200 14" preserveAspectRatio="none"><path d="M4 9 C40 2 90 12 130 6 S180 4 196 8"/></svg><small></small>');
    this.hintEl = el('skhint', root);
    this.hints = new KeyHints({ money: this.money.querySelector('.mkh'), mag: this.magRow, weapon: this.ammo.querySelector('.wrow') });
    // Tab scoreboard (held 'score' action; ui/scoreboard.js): over everything else on the HUD, never takes input
    this.scoreboard = new Scoreboard(game, root);
    this.inspT = 0;
    // teammate name tags (player/remote.js appends them here); HUD panel rects they fade over, refreshed twice a second
    this.tagEls = root.getElementsByClassName('nametag');
    this.tagW = new WeakMap();
    this.zones = []; this.zoneT = 0;
    this.cache = {};
    this.hitT = 0; this.hitKill = false; this.headT = 0;
    this.feedItems = [];
    this.bossLagV = 1;
    this.visible = true;
    this.borderT = 0; this.borderDur = 0; this.borderA = 0;
    this.cardT = 0; this.hintT = 0; this.hintPending = null;
    this._sndAt = -1;
    this._pred = [];
  }

  _set(key, node, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    node[prop] = value;
  }

  weaponChanged(ws) {
    this._set('wname', this.wnameEl, `${ws.def.zh} ${ws.def.en}`);
    // (no model yet: no silhouette, not the previous weapon's)
    weaponIcon(this.game.renderer, ws.def.model || ws.def.id).then((url) => { if (this.game.arsenal.current !== ws) return; if (url) this.wiconEl.src = url; else this.wiconEl.removeAttribute('src'); });
    // [F] 檢視 shows for a while after each draw; the weapon bar wakes; the panel sizes are measured again
    this.inspT = 6; this.invWake = 3; this.zoneT = 0;
    // the first 3 times a premium weapon comes out, its controls card follows once the fight lets up (§1.9 #11)
    if (ws.def.special?.skills || ws.def.special?.hint) {
      let n = 0;
      try { n = +(localStorage.getItem('cf.hint.' + ws.def.id) || 0); } catch { /* private mode */ }
      if (n < 3) this.hintPending = ws;
    }
  }
  ammoChanged() { /* picked up by update() */ }

  /** Desktop key hints on: keycaps in prompts / toasts and the hint chips (settings.keyHints, never on touch). */
  get keyHints() { return this.settings.keyHints !== false && !document.body.classList.contains('touch'); }
  /** Text with "按 E" / "長按 ★"... as HTML: keycaps of the live bindings while key hints are on, else escaped. */
  _keyText(text) { return this.keyHints ? keyify(text) : esc(text); }

  toast(text, ms = 1400) {
    this.toastEl.innerHTML = this._keyText(text);
    this.toastEl.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  /**
   * The armory's 試用 (test range): a top banner with what is being tried and the way back; the money and its
   * [B] 商店 hint go (nothing to buy there).
   */
  setTryout(label) {
    this.tryEl?.remove();
    this.money.classList.toggle('off', !!label);
    if (!label) { this.tryEl = null; return; }
    this.tryEl = el('trybar', this.money.parentNode, `<em>試用中</em><b>${esc(label)}</b><span>${this.keyHints ? '<kbd class="kc w">Esc</kbd>' : ''}返回武器庫</span>`);
  }

  /** Bottom-centre hint; `use` = it asks for the use key (touch shows its use button while one is up). */
  setPrompt(text, use = true) {
    const k = text ? text + '|' + this.keyHints + bindSig() : '';
    if (this.cache.promptT !== k) { this.cache.promptT = k; this.prompt.innerHTML = text ? this._keyText(text) : ''; }
    this.prompt.classList.toggle('on', !!text);
    this.promptUse = !!text && use;
  }

  /** Called by weapons and skills for every damaging hit. */
  onHit(info, res, target) {
    const g = this.game;
    this.xh.hit();
    // melee hits report no point: the target's centre stands in
    const point = info.point || (this.settings.damageNumbers ? target?.center?.() : null);
    if (this.settings.damageNumbers && point) {
      const def = WEAPONS[info.weapon] || g.arsenal?.def;
      const n = res?.damage ?? info.amount;
      if (n > 0.5) this.nums.add(point, n, { head: !!info.headshot, crit: n >= 120, armored: !!info.armored, elem: info.elem || (info.burn ? 'fire' : null), skin: skinOf(def), hex: def?.special ? paletteOf(def) : null, target: target?.zombie || target });
    }
    // our kill as we see it (instant; guests predict): kill mark / streak / badge -- the host's later kill feed line
    // for it is then skipped (_pred), kills no hit reported (grenades, fire) come through killFeed
    if (res?.killed) {
      const z = target?.zombie || target;
      this._pred.push(g.time);
      this._localKill(WEAPONS[info.weapon] || g.arsenal?.def, info.weapon, z?.def?.zh, !!info.headshot, { knife: !!info.melee, explosive: !!info.explosive });
    }
    if (!this.settings.hitmarker) return;
    this.hitT = 1;
    if (res?.killed) this.hitKill = true;
    if (info.headshot) this.headT = 1;
    // one marker sound per 30 ms (area skills hit many at once)
    if (g.time - this._sndAt > 0.03 || res?.killed) {
      this._sndAt = g.time;
      g.audio?.play(res?.killed ? (info.headshot ? 'headshot_kill' : 'killmarker') : info.headshot ? 'hitmarker_head' : 'hitmarker', { volume: 0.7 });
    }
  }

  killFeed(killer, weaponId, victim, headshot) {
    const item = el('fi', null, `<span class="k">${killer}</span><img alt="">${headshot ? `<i class="hs">${ICON_HEAD}</i>` : ''}<span class="v">${victim}</span>`);
    const def = WEAPONS[weaponId];
    if (def?.tier === 'mythic') item.classList.add('mythic');   // gold-edged weapon silhouette (§1.9 #10)
    weaponIcon(this.game.renderer, def?.model || weaponId, { w: 160, h: 60 }).then((u) => { if (u) item.querySelector('img').src = u; });
    this.feed.prepend(item);
    this.feedItems.unshift({ el: item, t: 6 });
    while (this.feedItems.length > 5) this.feedItems.pop().el.remove();
    if (killer === '你') {
      while (this._pred.length && this.game.time - this._pred[0] > 2.5) this._pred.shift();
      if (this._pred.length) this._pred.shift();
      else this._localKill(def, weaponId, victim, headshot);
    }
  }

  /** Our kill: kill mark (exotic and up), streak marks, badge; the wave's last zombie / a boss = final version. */
  _localKill(def, weaponId, victim, head, how = {}) {
    const g = this.game, m = g.match;
    const tier = def?.tier;
    const boss = !!m && !!victim && (victim === m.boss?.zombie?.def?.zh || victim === m.boss?.name || victim === m.bossName);
    const left = m ? (m.isMirror ? (m.left ?? 9) - 1 : (m.queue?.length ?? 1) + (g.zombies?.alive ?? 1)) : 1;
    const final = boss || !!m && m.state === 'round' && left <= 0;
    const mark = def?.premium?.killMark || (tier === 'exotic' || tier === 'mythic' || tier === 'legacy' ? 'km_generic' : null);
    const explosive = how.explosive || !!def && (def.projectile || def.cat === 'heavy' || def.cat === 'grenade') || weaponId === 'he' || weaponId === 'fire';
    this.kills.kill({ mark, tint: def?.special ? paletteOf(def).core : '#ffc74a', gold: tier === 'mythic', head, knife: how.knife || def?.cat === 'melee', explosive: explosive && !head, final });
    if (boss) this.kills.banner('BOSS 擊破！', { kind: 'boss', sub: victim });
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

  // ---------------------------------------------------------------- premium skill presentation
  /** 招式名卡: "〔主名〕．〔招式名〕" brush-written at 22 % height, never over the centre. */
  card(text, { color = '#ffc74a', sub = '' } = {}) {
    const b = this.cardEl.querySelector('b');
    b.innerHTML = [...text].map((ch, i) => `<i style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</i>`).join('');
    this.cardEl.querySelector('small').textContent = sub;
    this.cardEl.style.setProperty('--cc', color);
    this.cardEl.classList.remove('on'); void this.cardEl.offsetWidth; this.cardEl.classList.add('on');
    this.cardT = 2.3;
  }
  /** Element-coloured screen border (buffs; alpha capped at 0.35, from 45 % of the screen radius). */
  border(color, alpha = 0.3, dur = 1) {
    if (this.settings.screenBorder === false) return;   // its own comfort toggle (§1.14 #6)
    this.borderEl.style.setProperty('--bc', color);
    this.borderA = Math.min(0.35, alpha); this.borderDur = dur; this.borderT = dur;
  }
  /** Ready reminder (every 2.5 s while ready): a 0.3 s border flash at alpha 0.08 (§1.7.1 beat 7). */
  readyPulse(ws) { if (this.borderT <= 0) this.border(paletteOf(ws.def).rim, 0.08, 0.3); this.star.burst(4); }
  onSkillReady(ws) {
    const hex = paletteOf(ws.def);
    this.xh.el.style.setProperty('--rc', hex.rim);
    // the 4 crosshair nodes light 80 ms apart with 4 rising tones (§1.9 #2); shape + sound + haptic, not colour alone
    [1, 1.122, 1.26, 1.498].forEach((p, i) => setTimeout(() => this.game.audio?.play('xh_node', { volume: 0.4, pitch: p }), i * 80));
    this.border(hex.rim, 0.1, 0.3);
    this.star.burst(10);
    this.game.touch?.skillReady?.(ws);
  }
  onSkillDenied(ws, slot, c) {
    this.star.shake();
    this.game.touch?.skillDenied?.(ws, slot, c);
    // one line per 1.2 s (mashing the key must not strobe the toast); c.need = the missing fraction of the cost
    const now = performance.now();
    if (c.why === this._denyWhy && now - this._denyAt < 1200) return;
    this._denyWhy = c.why; this._denyAt = now;
    if (c.why === 'hold') this.toast('長按 ★ 施放大招', 900);
    else if (c.why === 'meter') this.toast(`${slot === 'ult' ? '大招' : '技能'}計量不足（${Math.max(0, Math.floor((1 - c.need) * 100))}%／需 100%）`, 1000);
    else if (c.why === 'cd') this.toast('技能冷卻中', 700);
  }
  onSkillCast(ws, slot, sk) {
    this.star.burst(slot === 'ult' ? 10 : 6);
    this.game.touch?.skillCast?.(ws, slot, sk);
    this.hintEl.classList.remove('on'); this.hintT = 0;
  }
  onCrisis(ws, cfg) {
    this.crisisEl.classList.remove('shatter'); void this.crisisEl.offsetWidth; this.crisisEl.classList.add('shatter');
    this.card(cfg.name || '危機護甲', { color: paletteOf(ws.def).rim });
  }
  banner(text, opts) { this.kills.banner(text, opts); }
  /** Clip 'hud' events from the Arsenal (anim track). */
  clipEvent(id, o = {}) {
    const ws = this.game.arsenal?.current, hex = ws ? paletteOf(ws.def) : {};
    if (id === 'card') this.card(o.text || '', { color: o.color || hex.rim, sub: o.sub });
    else if (id === 'border') this.border(o.color || hex.rim, o.a ?? 0.25, o.dur ?? 1);
    else if (id === 'banner') this.banner(o.text || '', o);
    else if (id === 'hint' && ws) this.showSkillHint(ws, true);
    else if (o.text) this.toast(o.sub ? `${o.text}　${o.sub}` : o.text, (o.dur ?? 1.6) * 1000);
  }

  /** 技能提示卡: ◎ / ★ tap / ★ hold rows + the meter sources, beside the ★ key, 4 s, α <= 0.6 (§1.9 #11). */
  showSkillHint(ws, force = false) {
    // v1 series specials describe their controls in special.hint { tap / alt / hold: { zh, desc }, src }
    const sk = ws?.def.special?.skills || ws?.def.special?.hint;
    if (!sk) return;
    // controls: the touch glyphs, or the bound keys on desktop
    const q = keycap('special'), ctl = this.keyHints && q ? { alt: keycap('alt'), tap: `${q} 點按`, hold: `長按 ${q}`, ult: `長按 ${q}` } : { alt: '◎', tap: '★ 點按', hold: '★ 長按', ult: '★ 長按' };
    const name = (s, slot) => s && (s.zh || s.id) ? `<li class="h-${slot}"><i></i><b>${ctl[slot]}</b><span>${s.zh || s.id}${s.desc ? `<small>${s.desc}</small>` : ''}</span></li>` : '';
    const srcs = ws.def.special.hint?.src ? [ws.def.special.hint.src] : Object.values(ws.def.special.meters || {}).map((c) => c.src || c.label || c.zh).filter(Boolean);
    this.hintEl.innerHTML = `<h4>${ws.def.zh}</h4><ul>${name(sk.alt, 'alt')}${name(sk.tap, 'tap')}${name(sk.hold, 'hold')}${name(sk.ult, 'ult')}</ul>${srcs.length ? `<p>計量：${srcs.join('／')}</p>` : ''}`;
    this.hintEl.style.setProperty('--hc', paletteOf(ws.def).rim);
    this.hintEl.classList.add('on');
    this.hintT = 4;
    if (!force) { try { localStorage.setItem('cf.hint.' + ws.def.id, String(+(localStorage.getItem('cf.hint.' + ws.def.id) || 0) + 1)); } catch { /* private mode */ } }
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const g = this.game;
    const st = g.status;
    const ar = g.arsenal;
    this.root.style.visibility = this.visible ? 'visible' : 'hidden';
    if (!this.visible) return;
    this.scoreboard.update(dt, !!g.input?.state.held.score);
    // bled out: no crosshair, a spectating line instead
    const dead = st?.alive === false;
    const kh = this.keyHints;
    if (this.cache.kh !== kh) { this.cache.kh = kh; this.root.classList.toggle('kh-off', !kh); }
    this._set('spec', this.spec, dead ? (g.spectating ? `觀戰　<b>${esc(g.spectating)}</b>${kh ? `<span>${keycap('fire')} 切換</span>` : '<span>開火切換</span>'}` : '你已陣亡　等待回合結束') : '', 'innerHTML');
    this.spec.classList.toggle('on', dead);
    const ws = ar?.current, def = ar?.def;
    const info = ws ? hudInfo(ws, g) : null;
    // crosshair: gap follows the real spread cone
    const scoped = g.renderer.post.scopeMask > 0;
    const aim = g.vm?.aim ?? 0;
    const showXh = !dead && !!def && !scoped && def.cat !== 'melee' && aim < 0.6;
    const H = window.innerHeight;
    const focal = (H / 2) / Math.tan((g.camera.fov * Math.PI) / 360);
    const gapPx = ar?.current ? Math.max(this.settings.crosshairGap, Math.tan((ar.spreadDeg() * Math.PI) / 180) * focal * 0.6) : this.settings.crosshairGap;
    const tier = info?.tier || def?.tier || 'standard';
    // a weapon's own xh_* until it is registered: its tier's generic one
    const xhId = (CROSSHAIRS[info?.crosshair] ? info.crosshair : TIER_XH[tier]) || 'xh_default';
    this.xh.update(dt, { id: xhId, gap: gapPx, settings: this.settings, color: xhId === 'xh_default' ? this.settings.crosshairColor : info?.hex.core || '#fff',
      color2: info?.hex.rim, hitColor: info?.hex.core || '#ffffff', react: !!info, ready: !!(info?.ready || info?.star?.tap && info.v1), active: !!info?.star?.active,
      nodes: !!info?.star?.has, visible: showXh, dot: !dead && !!def && !scoped }); // the centre dot stays for melee / ADS (user: always on)
    this._meters(info, !dead && !scoped);
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
      this._set('ar', this.arEl, String(Math.floor(st.armor)));   // (a sliver left absorbs nothing: no "1")
      this.hpBox.classList.toggle('low', st.hp < 30);
    }
    this._chips(info);
    // ammo panel: what the held weapon spends (not every weapon is a gun: arrows, mana, charges, nothing)
    let low = false, empty = false, reloadable = false, kind = 'none', resLow = 0;
    if (ws) {
      const r = this._resource(ws, g);
      kind = r.kind;
      if (this.cache.rkind !== kind) { this.cache.rkind = kind; this.ammo.className = 'ammo k-' + kind; this.rkEl.innerHTML = RES_ICON[kind] || ''; this.cache.rbar = null; this.zoneT = 0; }
      if (kind === 'none') { this._set('mag', this.magEl, ''); this._set('res', this.resEl, ''); }
      else {
        const v = Math.max(0, Math.floor(r.value)), max = r.max || 0, pool = kind === 'mana' || kind === 'charges';
        this._set('mag', this.magEl, r.inf ? '∞' : String(v));
        this._set('res', this.resEl, pool ? (max ? '/ ' + max : '') : '/ ' + (Number.isFinite(r.reserve) ? r.reserve : '∞'));
        empty = !r.inf && v <= 0;
        // (a 1-3 round magazine -- bow, bolt action, double barrel -- is only low when empty)
        low = !r.inf && (kind === 'mana' ? v < max * 0.25 : kind === 'charges' ? v <= 0 : max > 0 && v <= (max > 3 ? Math.ceil(max * 0.25) : 0));
        reloadable = !pool && !r.inf && max > 0 && v < max && ws.def.reload > 0 && r.reserve > 0;
        if (pool) this._resBar(kind, v, max, r.color);
        // a finite reserve under one magazine pulses (1), an empty one is red (2)
        else if (!r.inf && max > 0 && Number.isFinite(r.reserve)) resLow = r.reserve <= 0 ? 2 : r.reserve < max ? 1 : 0;
      }
      this.magEl.classList.toggle('low', low);
      if (this.cache.resLow !== resLow) { this.cache.resLow = resLow; this.resEl.classList.toggle('warn', resLow === 1); this.resEl.classList.toggle('out', resLow === 2); }
      const m = specialOf(ws)?.meter?.(ws, g);
      this.meter.style.display = m ? '' : 'none';
      if (m) {
        this._set('mlab', this.meterLabel, m.label);
        this.meterFill.style.width = (Math.max(0, Math.min(1, m.value)) * 100).toFixed(1) + '%';
        this.meterFill.style.background = m.color;
        this.meter.classList.toggle('ready', !!m.ready);
        if (m.window && !Array.isArray(m.window[0])) { this.meterWin.style.display = ''; this.meterWin.style.left = (m.window[0] * 100) + '%'; this.meterWin.style.width = ((m.window[1] - m.window[0]) * 100) + '%'; }
        else this.meterWin.style.display = 'none';
      }
    }
    // desktop skill dock: ★ + the skill names with their keys
    const dockOn = !dead && !!(info?.star?.has || info?.alt?.has);
    if (this.cache.dock !== dockOn) { this.cache.dock = dockOn; this.dock.classList.toggle('on', dockOn); this.zoneT = 0; }
    if (dockOn) {
      this.star.update(info.star, info.hex, tier);
      this._dockLabels(ws, info);
    }
    // key hint chips (money, magazine, weapon), the weapon bar, name tags off the panels
    const m = g.match;
    this.inspT = Math.max(0, this.inspT - dt);
    if (kh) {
      const melee = !dead && kind === 'none' && (def?.cat === 'melee' || def?.mode === 'melee');
      const canBuy = !!m?.canBuy?.(), buyTime = m?.state === 'warmup' || m?.state === 'buy';
      // out of everything to shoot: the weapon to fall back on ([2] 副武器), and the shop's refill while it is open to
      // us (buy time / buy zone: dry, under a magazine, or in the buy time anything short of the full reserve)
      const dry = !dead && !!ws && !!m?.dry?.(ws);
      const fb = dry && m.state === 'round' ? m.fallbackSlot?.() : null;
      let refill = null;
      if (!dead && ws && canBuy && (resLow || dry || buyTime)) {
        const o = m.ammoOffer?.(ws);
        if (o && !o.why && o.price <= m.money && (resLow || dry || ws.reserve < (ar.maxReserve?.(ws) ?? 0))) refill = { label: o.label, hot: dry };
      }
      this.hints.update({
        canBuy, low, empty, reloadable, reloading: ar?.state === 'reload', reloadLabel: kind === 'arrows' ? '裝箭' : '換彈',
        swap: fb != null ? { action: 'slot' + fb, label: SLOT_ZH[fb] || '切換武器' } : null, refill, shopDot: buyTime && canBuy && !!m?.upgradeWaiting?.(),
        // [F] 檢視 for a while after each draw and through the calm of the buy phase
        inspect: !!ws && !dead && ar.state !== 'reload' && (this.inspT > 0 || !m || m.state === 'warmup' || m.state === 'buy'),
        mode: def?.alt === 'burst' && !info?.star?.has ? (ws.burstMode ? '半自動' : '三連發') : '',
        melee: melee ? { light: '攻擊', heavy: def.heavy && !info?.alt?.has ? '重擊' : null } : null,
      });
    }
    this._inventory(dt, ar, g);
    this._tags(dt);
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
    // border / card / hint timers
    if (this.borderT > 0) {
      this.borderT = Math.max(0, this.borderT - dt);
      const u = this.borderDur > 0 ? this.borderT / this.borderDur : 0, edge = Math.min(1, (1 - u) / 0.15, u / 0.3);
      this.borderEl.style.opacity = (this.borderA * Math.max(0, edge)).toFixed(3);
    } else if (this.borderEl.style.opacity !== '0') this.borderEl.style.opacity = '0';
    if (this.cardT > 0 && (this.cardT -= dt) <= 0) this.cardEl.classList.remove('on');
    if (this.hintT > 0 && (this.hintT -= dt) <= 0) this.hintEl.classList.remove('on');
    // pending hint card: only out of combat (no shot fired / hit taken for 2 s) and with the weapon still in hand
    if (this.hintPending) {
      if (ar?.current !== this.hintPending || dead) this.hintPending = null;
      else if ((ar.sinceShot ?? 9) > 2 && g.time - (st?.lastHitAt ?? -9) > 2 && this.cardT <= 0) { this.showSkillHint(this.hintPending); this.hintPending = null; }
    }
    if (this.hintT > 0 && ((ar?.sinceShot ?? 9) < 0.1 || g.time - (st?.lastHitAt ?? -9) < 0.1)) { this.hintT = 0; this.hintEl.classList.remove('on'); }
    this._drawDirs(st, dt);
    this.nums.update(dt);
    this.kills.update(dt);
  }

  /** What the held weapon spends: { kind, value, max, reserve, inf, label, color } (resource contract: file header). */
  _resource(ws, g) {
    const def = ws.def, r = def.resource, o = specialOf(ws)?.resource?.(ws, g);
    const kind = o?.kind || (typeof r === 'string' ? r : r?.kind) || RES_BY_CAT[def.cat] || (def.mode === 'melee' ? 'none' : 'ammo');
    return { kind, value: o?.value ?? ws.ammo, max: o?.max ?? r?.max ?? def.mag, reserve: o?.reserve ?? ws.reserve,
      inf: kind !== 'none' && !!g.arsenal._mods?.(ws).infinite, label: o?.label || r?.label, color: o?.color || r?.color };
  }
  /** Pool bar under the number: a fill for mana, one pip per charge (up to 12). */
  _resBar(kind, v, max, color) {
    const pips = kind === 'charges' && max > 0 && max <= 12;
    if (pips) {
      const k = `c${v}/${max}`;
      if (this.cache.rbar !== k) { this.cache.rbar = k; this.rbar.innerHTML = Array.from({ length: max }, (_, i) => `<em${i < v ? ' class="on"' : ''}></em>`).join(''); }
    } else {
      if (this.cache.rbar !== 'fill') { this.cache.rbar = 'fill'; this.cache.rw = null; this.rbar.innerHTML = '<i></i>'; }
      const w = (max > 0 ? Math.min(1, v / max) * 100 : 0).toFixed(1) + '%';
      if (this.cache.rw !== w) { this.cache.rw = w; this.rbar.firstChild.style.width = w; }
    }
    if (this.cache.rcol !== (color || '')) { this.cache.rcol = color || ''; if (color) this.rbar.style.setProperty('--rc', color); else this.rbar.style.removeProperty('--rc'); }
  }

  /** Skill dock rows: [Q] tap skill, 長按 [Q] ultimate, mouse alt skill -- names from the def's skill data (v2) / hint (v1). */
  _dockLabels(ws, info) {
    const sp = ws.def.special || {}, sk = sp.skills || sp.hint || {};
    const key = ws.def.id + bindSig();
    if (this.cache.dockK !== key) {
      this.cache.dockK = key;
      const row = (pre, action, s) => s?.zh || s?.id ? `${pre ? `<small>${pre}</small>` : ''}${keycap(action)}<span>${esc(s.zh || s.id)}</span>` : '';
      this.skTap.innerHTML = info.star?.has ? row('', 'special', sk.tap) : '';
      this.skUlt.innerHTML = info.star?.has ? row('長按', 'special', sk.ult || sk.hold) : '';
      this.altEl.innerHTML = info.alt?.has ? row('', 'alt', sk.alt?.zh || sk.alt?.id ? sk.alt : { zh: '異能' }) : '';
    }
    const st = info.star || {}, alt = info.alt;
    const tog = (n, c, on) => { if (n.classList.contains(c) !== on) n.classList.toggle(c, on); };
    tog(this.skTap, 'rdy', !!st.tap && !st.active); tog(this.skTap, 'act', !!st.active && !st.ultActive); tog(this.skTap, 'dim', !st.tap && !st.active);
    tog(this.skUlt, 'rdy', !!st.ult && !st.ultActive); tog(this.skUlt, 'act', !!st.ultActive); tog(this.skUlt, 'dim', !st.ult && !st.ultActive);
    if (alt) { tog(this.altEl, 'rdy', !!alt.ok && !alt.active); tog(this.altEl, 'act', !!alt.active); tog(this.altEl, 'dim', !alt.ok && !alt.active); }
  }

  /** Weapon bar (desktop): owned slots with their keys (the held one lit) + the grenade row; rests dim, wakes on a switch. */
  _inventory(dt, ar, g) {
    if (!ar) return;
    const T = g.throwables;
    const slots = Object.keys(ar.owned).map(Number).sort((a, b) => a - b);
    const gk = T ? Object.keys(T.count) : [];
    const gsel = T && (T.count[T.selected] > 0 ? T.selected : gk.find((k) => T.count[k] > 0));
    const gkey = gk.map((k) => k + T.count[k]).join(',') + gsel;
    const key = slots.map((s) => s + ':' + ar.owned[s].def.id).join(',') + '|' + gkey + '|' + bindSig();
    if (this.cache.inv !== key) {
      this.cache.inv = key;
      const rows = slots.map((s) => `<div class="iv" data-s="${s}"><span class="nm">${esc(ar.owned[s].def.zh)}</span><img alt="">${keycap('slot' + s)}</div>`);
      if (T) rows.push(`<div class="iv ig">${gk.map((k) => `<span class="gk${k === gsel ? ' on' : ''}${T.count[k] ? '' : ' z'}">${GREN_ICON[k] || GREN_ICON.frag}<b>${T.count[k]}</b></span>`).join('')}${keycap('grenade')}</div>`);
      this.inv.innerHTML = rows.join('');
      // silhouettes (cached by icons.js); a weapon without a model shows its name instead
      for (const row of this.inv.querySelectorAll('[data-s]')) {
        const d = ar.owned[row.dataset.s].def;
        weaponIcon(g.renderer, d.model || d.id, { w: 160, h: 60 }).then((u) => { if (u && row.isConnected) { row.querySelector('img').src = u; row.classList.add('ic'); } });
      }
      this.cache.invCur = null;
      this.invWake = Math.max(this.invWake, 2.5);   // bought / picked up / thrown: show what changed
      this.zoneT = 0;
    }
    const cur = ar.pendingSlot ?? ar.slot;
    if (this.cache.invCur !== cur) {
      this.cache.invCur = cur;
      for (const row of this.inv.querySelectorAll('[data-s]')) row.classList.toggle('on', +row.dataset.s === cur);
    }
    const s = g.input?.state;
    if (s?.pressed.next || s?.pressed.prev) this.invWake = 3;
    this.invWake = Math.max(0, this.invWake - dt);
    const wake = this.invWake > 0;
    if (this.cache.invW !== wake) { this.cache.invW = wake; this.inv.classList.toggle('wake', wake); }
  }

  /** Teammate name tags (player/remote.js) fade while over a HUD panel; panel rects re-read twice a second. */
  _tags(dt) {
    if ((this.zoneT -= dt) <= 0) this._measure();
    const tags = this.tagEls;
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i];
      if (t.style.display === 'none') continue;
      const p = TAG_POS.exec(t.style.transform);
      if (!p) continue;
      let w = this.tagW.get(t);
      if (!w) { w = t.offsetWidth; if (!w) continue; this.tagW.set(t, w); }
      const x = +p[1], y = +p[2], l = x - w / 2, r = x + w / 2, top = y - 24;   // anchored at its bottom centre
      let over = false;
      for (const z of this.zones) if (r > z[0] && l < z[2] && y > z[1] && top < z[3]) { over = true; break; }
      if (t.classList.contains('occl') !== over) t.classList.toggle('occl', over);
    }
  }
  /** Ammo panel size (the weapon bar sits above it, the skill dock left of it) and, with tags up, the panel rects. */
  _measure() {
    this.zoneT = 0.5;
    const a = this.ammo.getBoundingClientRect();
    const aw = Math.round(a.width / 4) * 4, ah = Math.round(a.height / 2) * 2;
    if (aw && this.cache.aw !== aw) { this.cache.aw = aw; this.root.style.setProperty('--ammo-w', aw + 'px'); }
    if (ah && this.cache.ah !== ah) { this.cache.ah = ah; this.root.style.setProperty('--ammo-h', ah + 'px'); }
    this.zones.length = 0;
    if (!this.tagEls.length) return;
    for (const n of [this.money, this.ammo, this.vitals, this.xp, this.inv, this.dock, this.round, this.feed, this.boss, this.chips, this.prompt, this.spec, document.getElementById('perks')]) {
      const b = n?.getBoundingClientRect();
      if (b && b.width > 2 && b.height > 2) this.zones.push([b.left - 6, b.top - 6, b.right + 6, b.bottom + 6]);
    }
  }

  /** Crosshair-anchored meters (60 % opacity mirrors); a new view set whenever the weapon or the meter types change. */
  _meters(info, show) {
    const list = show && info ? info.meters.filter((m) => m.type && m.type !== 'bar') : [];
    const key = list.map((m) => m.type).join(',');
    if (key !== this.meterKey) {
      this.meterKey = key;
      this.mts.innerHTML = '';
      const seen = {};
      this.meterViews = list.map((m) => { const v = new MeterView(m.type, seen[m.type] = (seen[m.type] ?? -1) + 1); this.mts.appendChild(v.el); return v; });
    }
    for (let i = 0; i < list.length; i++) this.meterViews[i].set(list[i]);
  }

  /** Crisis armour (shield: progress fill, ready glow, shatter on trigger) and active team auras. */
  _chips(info) {
    const c = info?.crisis, on = !!c?.has;
    if (this.cache.cr !== on) { this.cache.cr = on; this.crisisEl.style.display = on ? 'block' : 'none'; }   // (the sheet hides it by default)
    if (on) {
      const k = `${Math.round(c.frac * 50)}|${c.ready}|${c.used}`;
      if (this.cache.crk !== k) {
        this.cache.crk = k;
        this.crisisClip.setAttribute('y', (12 - c.frac * 24).toFixed(1));
        this.crisisEl.classList.toggle('ready', c.ready);
        this.crisisEl.classList.toggle('used', c.used);
        this.crisisEl.style.setProperty('--crc', info.hex.rim);
        this.crisisLabel.textContent = c.used ? '已觸發' : c.ready ? '護甲' : Math.floor(c.frac * 100) + '%';
      }
    }
    const a = auraState(this.game);
    const k = Object.entries(a).map(([t, v]) => `${t}:${t === 'regen' ? v.toFixed(1) : Math.round((v - 1) * 100)}`).join(',');
    if (this.cache.aura !== k) {
      this.cache.aura = k;
      this.auraEl.innerHTML = Object.entries(a).filter(([t, v]) => t === 'regen' ? v > 0 : Math.abs(v - 1) > 0.005).map(([t, v]) =>
        `<i class="au"><svg viewBox="0 0 24 24">${AURA_ICON[t] || '<circle cx="12" cy="12" r="6"/>'}</svg>${t === 'regen' ? '+' + v.toFixed(0) + '/s' : (v > 1 ? '+' : '') + Math.round((t === 'reloadSpeed' ? v - 1 : v - 1) * 100) + '%'}</i>`).join('');
    }
  }

  /** Red trapezoid wedges on a 110 px circle toward the attacker, 0.85 -> 0 over 1 s (06b §9.3.5). */
  _drawDirs(st, dt) {
    const dirs = st?.hitDirs || [];
    while (this.dirWedges.length < dirs.length) {
      const w = el('dw', this.dirEl, '<svg viewBox="0 0 64 14"><path d="M2 0H62L54 14H10Z"/></svg>');
      this.dirWedges.push(w);
    }
    for (let i = 0; i < this.dirWedges.length; i++) {
      const w = this.dirWedges[i], d = dirs[i];
      if (!d) { if (w.style.display !== 'none') w.style.display = 'none'; continue; }
      w.style.display = '';
      const deg = (-d.angle * 180) / Math.PI;
      w.style.transform = `rotate(${deg.toFixed(1)}deg) translateY(-110px)`;
      w.style.opacity = (Math.min(1, d.t) * 0.85).toFixed(2);
    }
  }
}

injectCSS('cf-hud2', `
.skborder { position: fixed; inset: 0; opacity: 0; pointer-events: none; background: radial-gradient(ellipse at center, transparent 45%, var(--bc, #ffc74a) 115%); }
.dmgdir2 { position: fixed; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; }
.dmgdir2 .dw { position: absolute; left: -32px; top: -7px; width: 64px; height: 14px; transform-origin: 32px 7px; }
.dmgdir2 .dw svg { width: 100%; height: 100%; display: block; }
.dmgdir2 .dw path { fill: #e61e14; stroke: rgba(0,0,0,.5); stroke-width: 1; }
.skchips { position: fixed; left: calc(18px + var(--safe-left, 0px)); bottom: calc(88px + var(--safe-bottom, 0px)); display: flex; gap: 8px; align-items: center; pointer-events: none; }
body.touch .skchips { bottom: calc(72px + var(--safe-bottom, 0px)); }
body.lefty.touch .skchips { left: auto; right: calc(18px + var(--safe-right, 0px)); }
.crisis { position: relative; width: 30px; height: 30px; display: none; }
.crisis svg { width: 30px; height: 30px; overflow: visible; }
.crisis .cr-bg { fill: rgba(0,0,0,.45); stroke: none; } .crisis .cr-fill { fill: var(--crc, #ffc74a); opacity: .55; } .crisis .cr-edge { fill: none; stroke: #fff; stroke-width: 1.4; opacity: .7; }
.crisis.ready .cr-fill { opacity: .95; } .crisis.ready svg { filter: drop-shadow(0 0 4px var(--crc)); animation: pulse 1.2s infinite; }
.crisis.used { opacity: .35; }
.crisis span { position: absolute; left: 34px; top: 7px; font: 700 12px var(--font); white-space: nowrap; color: #eee; }
.crisis.shatter svg { animation: crShatter .5s ease-out; }
@keyframes crShatter { 0% { transform: scale(1); } 30% { transform: scale(1.5) rotate(-8deg); filter: brightness(3); } 100% { transform: scale(1); } }
.auras { display: flex; gap: 6px; }
.auras .au { display: flex; align-items: center; gap: 2px; font: 700 12px var(--num); font-style: normal; color: #9ff7c8; background: rgba(0,0,0,.45); padding: 1px 5px 1px 3px; border-radius: 2px; }
.auras .au svg { width: 14px; height: 14px; fill: currentColor; stroke: currentColor; }
.skdock { position: fixed; right: calc(var(--ammo-w, 210px) + 24px + var(--safe-right, 0px)); bottom: calc(14px + var(--safe-bottom, 0px)); display: none; align-items: center; gap: 12px; pointer-events: none;
  padding: 6px 14px 6px 8px; border-radius: 3px; background: linear-gradient(90deg, rgba(0,0,0,.5), rgba(0,0,0,.42) 75%, rgba(0,0,0,.12)); }
.skdock.on { display: flex; }
body.touch .skdock { display: none !important; }
.skdock .sk-star { flex: none; width: 44px; height: 44px; border-radius: 50%; background: rgba(10,12,14,.45); }
.skdock .sk-star::before { content: '★'; position: absolute; inset: 0; display: grid; place-items: center; font-size: 20px; color: #fff; }
.skdock .sk-lab { display: flex; flex-direction: column; gap: 4px; }
.skdock .sk-l { display: flex; align-items: center; gap: 5px; white-space: nowrap; font: 600 12px/17px var(--font); letter-spacing: .06em; color: #e4dfd4; transition: opacity .2s, color .2s; }
.skdock .sk-l:empty { display: none; }
.skdock .sk-l small { font: 600 11px/17px var(--font); color: #a9a397; letter-spacing: .04em; }
.skdock .sk-l.dim { opacity: .5; }
.skdock .sk-l.rdy { color: #fff; }
.skdock .sk-l.rdy .kc { border-color: rgba(242,181,68,.9); color: #ffe6b0; box-shadow: inset 0 -2px 0 rgba(0,0,0,.38), 0 0 6px rgba(242,181,68,.5); }
.skdock .sk-l.act { color: #ffd27a; text-shadow: 0 0 6px #ffb43a, 0 1px 2px #000; }
.skdock .sk-l.act .kc { border-color: #ffd27a; color: #fff; }
.skcard { position: fixed; left: 50%; top: 22%; transform: translate(-50%, -50%); text-align: center; pointer-events: none; opacity: 0; }
.skcard.on { animation: cardLife 2.3s linear both; }
@keyframes cardLife { 0% { opacity: 1; } 87% { opacity: 1; } 100% { opacity: 0; } }
.skcard b { display: block; white-space: nowrap; font: 900 clamp(30px, 7.5vh, 56px)/1.1 "Noto Serif TC", "Source Han Serif TC", "Songti TC", "PMingLiU", serif; letter-spacing: .08em;
  color: #fff8ec; -webkit-text-stroke: 1.5px #1a0d08; paint-order: stroke fill; text-shadow: 0 0 14px var(--cc), 0 2px 0 rgba(0,0,0,.6); }
.skcard b i { font-style: normal; display: inline-block; clip-path: inset(0 0 100% 0); }
.skcard.on b i { animation: cardInk .32s calc(var(--i) * 75ms) cubic-bezier(.2,.7,.3,1) forwards; }
@keyframes cardInk { 0% { clip-path: inset(0 0 100% 0); transform: translateY(-6px) scale(1.15); filter: blur(2px); } 100% { clip-path: inset(0 0 -10% 0); transform: none; filter: none; } }
.skcard svg { display: block; width: 80%; height: 12px; margin: 2px auto 0; overflow: visible; }
.skcard svg path { fill: none; stroke: var(--cc); stroke-width: 3.2; stroke-linecap: round; stroke-dasharray: 220; stroke-dashoffset: 220; filter: drop-shadow(0 0 4px var(--cc)); }
.skcard.on svg path { animation: cardSwash .5s .5s ease-out forwards; }
@keyframes cardSwash { to { stroke-dashoffset: 0; } }
.skcard small { display: block; margin-top: 2px; font: 600 12px var(--num); letter-spacing: .3em; color: #e8d6a8; text-shadow: 0 1px 2px #000; }
.skhint { position: fixed; right: calc(14px + var(--safe-right, 0px)); top: 16%; width: min(250px, 30vw); padding: 8px 12px 9px; background: rgba(8,10,12,.6); border: 1px solid var(--hc, #ffc74a);
  border-left-width: 3px; border-radius: 3px; font-family: var(--font); color: #eee; opacity: 0; transform: translateX(14px); transition: opacity .35s, transform .35s; pointer-events: none; }
.skhint.on { opacity: .95; transform: none; }
body.touch .skhint { top: 12%; right: calc(4% + var(--safe-right, 0px)); }
.skhint h4 { margin: 0 0 5px; font-size: 13px; letter-spacing: .12em; color: var(--hc); }
.skhint ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.skhint li { display: grid; grid-template-columns: 14px 64px 1fr; align-items: center; gap: 6px; font-size: 12px; }
.skhint li i { width: 10px; height: 10px; border: 1.5px solid var(--hc); border-radius: 50%; }
.skhint li.h-tap i { animation: hTap 1s infinite; } .skhint li.h-ult i, .skhint li.h-hold i { border-radius: 50%; background: conic-gradient(var(--hc) 0 var(--p, 0%), transparent 0); animation: hHold 1.2s infinite; }
.skhint li.h-alt i { border-radius: 2px; transform: rotate(45deg); }
@keyframes hTap { 0%, 100% { transform: scale(1); } 20% { transform: scale(.6); } }
@property --p { syntax: '<percentage>'; inherits: false; initial-value: 0%; }
@keyframes hHold { 0% { --p: 0%; } 60%, 100% { --p: 100%; } }
.skhint li b { font: 700 12px var(--num); color: #fff; } .skhint li small { display: block; color: #aaa; font-size: 11px; }
.skhint p { margin: 6px 0 0; font-size: 11px; color: #bbb; }
.feed .fi.mythic img { filter: drop-shadow(0 0 1px #e8b54a) drop-shadow(0 0 1px #e8b54a); }
`);
