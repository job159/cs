// Main menu, solo setup and armory screens, plus the cinematic menu backdrop (the current map slowly
// orbited by the game camera behind a dark gradient).
import * as THREE from 'three';
import { Screen, header, esc, ICON } from './kit.js';
import { DIFFICULTY, ROUNDS } from '../match/rules.js';
import { MAPS, mapInfo } from '../world/maps/index.js';
import { WEAPONS, CATS } from '../weapons/defs.js';
import { weaponIcon } from './icons.js';

/** UI text + colour per difficulty (multipliers come from match/rules.js). */
export const DIFF_INFO = {
  normal: { zh: '普通', en: 'NORMAL', color: '#7bd389', bg: 'rgba(123,211,137,.14)', desc: '標準的感染者強度，適合初次體驗。' },
  hard: { zh: '困難', en: 'HARD', color: '#f2b544', bg: 'rgba(242,181,68,.14)', desc: '感染者更耐打、攻擊更痛，開始出現精英。' },
  hell: { zh: '地獄', en: 'HELL', color: '#ee7b35', bg: 'rgba(238,123,53,.15)', desc: '大量精英與更密集的屍潮，需要團隊配合。' },
  calamity: { zh: '災厄', en: 'CALAMITY', color: '#e5432f', bg: 'rgba(229,67,47,.16)', desc: '最高難度：全員倒下即任務失敗，不能重試。' },
};
export const DIFF_IDS = Object.keys(DIFF_INFO);

export function diffLine(id) {
  const d = DIFFICULTY[id] || DIFFICULTY.normal;
  return `生命 ×${d.hpMul}　傷害 ×${d.dmgMul}　數量 ×${d.countMul}　重試 ${d.retries} 次`;
}

export function mapCard(info, { small = false } = {}) {
  return `<div class="map-card${small ? ' small' : ''}">
    <div class="mc-k">${esc(info.chapter || '作戰區域')}</div>
    <div class="mc-n"><b>${esc(info.zh)}</b><small>${esc(info.en)}</small></div>
    ${small ? '' : `<p>${esc(info.desc || '')}</p>`}
    <div class="mc-m"><span>${info.rounds || ROUNDS.length} 回合</span>${info.boss !== false ? '<span>首領戰</span>' : ''}<span>1–4 人</span></div>
  </div>`;
}

// ---------------------------------------------------------------- backdrop

/** Orbits the camera of a world-only game around the map's preview target (menus, lobby). */
export function orbitBackdrop(game, info, t) {
  const def = game.world.def || {};
  const pv = info?.preview || def.preview || {};
  const sp = game.world.playerSpawns?.[0];
  const target = pv.target ? new THREE.Vector3(...pv.target) : new THREE.Vector3(sp?.x || 0, (sp?.y || 0) + 1.5, sp?.z || 0);
  const r = pv.radius ?? 14, h = pv.height ?? 4, a = (pv.start ?? 0.6) + t * (pv.speed ?? 0.045);
  const cam = game.camera;
  cam.position.set(target.x + Math.sin(a) * r, target.y + h, target.z + Math.cos(a) * r);
  cam.lookAt(target);
  cam.updateMatrixWorld();
}

// ---------------------------------------------------------------- main menu

export class MainMenu extends Screen {
  constructor(app) {
    super(app, 'mm fe-shade', `
      <div class="mm-logo"><b>災厄前線</b><span>CALAMITY FRONT</span></div>
      <button class="mm-name" data-act="name" aria-label="玩家名稱">${ICON.user}<span></span>${ICON.edit}</button>
      <nav class="mm-nav">
        <button data-act="solo" class="pri"><b>單人遊戲</b><small>SOLO</small></button>
        <button data-act="mp"><b>多人連線</b><small>MULTIPLAYER</small></button>
        <button data-act="armory"><b>武器庫</b><small>ARMORY</small></button>
        <button data-act="settings"><b>設定</b><small>SETTINGS</small></button>
        <button data-act="exit"><b>離開</b><small>EXIT</small></button>
      </nav>
      <div class="mm-card"></div>
      <div class="mm-foot"><span class="mm-ver"></span></div>`);
    this.$('.mm-ver').textContent = `版本 ${app.version}　·　合作殭屍生存　1–4 人`;
  }

  enter() {
    this.$('.mm-name span').textContent = this.app.playerName;
    this.$('.mm-card').innerHTML = `<div class="mm-card-h">目前作戰</div>${mapCard(mapInfo(this.app.mapId), { small: true })}`;
    this.app.ensureBackdrop(this.app.mapId);
  }

  back() { this.onAct('exit'); return true; }

  onAct(act) {
    const app = this.app;
    if (act === 'solo') app.show('solo');
    else if (act === 'mp') app.show('mp');
    else if (act === 'armory') app.show('armory');
    else if (act === 'settings') app.openOverlay('settings');
    else if (act === 'name') app.editName().then(() => this.enter());
    else if (act === 'exit') {
      app.dialogs.confirm('離開遊戲', '確定要離開災厄前線嗎？', { ok: '離開', danger: true }).then((ok) => {
        if (!ok) return;
        if (window.NativeBridge?.exitApp) window.NativeBridge.exitApp();
        else { window.close(); setTimeout(() => app.toast('瀏覽器版本請直接關閉分頁'), 300); }
      });
    }
  }
}

// ---------------------------------------------------------------- solo setup

export class SoloSetup extends Screen {
  constructor(app) {
    super(app, 'solo fe-shade2', `${header('單人遊戲', 'SOLO')}
      <div class="fe-body solo-body">
        <section class="fe-panel solo-diff"><div class="fe-ph"><span>難度</span><small>DIFFICULTY</small></div><div class="diff-list fe-scroll"></div></section>
        <section class="solo-side">
          <div class="fe-panel solo-map"><div class="fe-ph"><span>地圖</span><small>MAP</small></div><div class="solo-maps"></div></div>
          <div class="fe-panel solo-ai">
            <div class="st-l"><b>AI 隊友</b><small>人數不足時由電腦補位</small></div>
            <span class="fe-tag">即將推出</span>
            <button class="st-toggle" disabled aria-label="AI 隊友"><i></i></button>
          </div>
          <button class="fe-btn pri big" data-act="start">${ICON.play}<span>開始作戰</span></button>
        </section>
      </div>`);
  }

  enter() {
    const app = this.app;
    this.diff = app.lastDiff;
    this.render();
    app.ensureBackdrop(app.mapId);
  }

  render() {
    const app = this.app;
    this.$('.diff-list').innerHTML = DIFF_IDS.map((id) => {
      const d = DIFF_INFO[id];
      return `<button class="diff${id === this.diff ? ' on' : ''}" data-act="diff" data-id="${id}" style="--c:${d.color};--cbg:${d.bg}">
        <span class="dn"><b>${d.zh}</b><small>${d.en}</small></span>
        <span class="dd">${esc(d.desc)}<small>${diffLine(id)}</small></span></button>`;
    }).join('');
    const maps = MAPS.length > 1
      ? MAPS.map((m) => `<button class="map-pick${m.id === app.mapId ? ' on' : ''}" data-act="map" data-id="${m.id}">${mapCard(m, { small: true })}</button>`).join('')
      : mapCard(mapInfo(app.mapId));
    this.$('.solo-maps').innerHTML = maps;
  }

  onAct(act, t) {
    const app = this.app;
    if (act === 'diff') { this.diff = t.dataset.id; app.lastDiff = this.diff; this.render(); }
    else if (act === 'map') { app.mapId = t.dataset.id; this.render(); app.ensureBackdrop(app.mapId); }
    else if (act === 'start') app.startSolo({ map: app.mapId, difficulty: this.diff });
  }
}

// ---------------------------------------------------------------- armory

const ARMORY_TABS = ['rifle', 'smg', 'pistol', 'shotgun', 'mg', 'sniper', 'heavy', 'melee'];
const MODE_ZH = { auto: '全自動', semi: '半自動', burst: '點放', bolt: '栓動', pump: '泵動', melee: '近戰', single: '單發' };

function weaponStats(w) {
  const dps = (w.dmg * (w.pellets || 1) * (w.rpm || 60)) / 60;
  const acc = 1 - Math.min(1, ((w.spread?.[0] ?? 2) + (w.spread?.[1] ?? 0.5) * 2) / 9);
  return [
    ['傷害', Math.min(1, Math.sqrt((w.dmg * (w.pellets || 1)) / 320))],
    ['射速', Math.min(1, (w.rpm || 60) / 1200)],
    ['輸出', Math.min(1, dps / 900)],
    ['精準', acc],
    ['機動', Math.min(1, ((w.speed ?? 5) - 3.6) / 2)],
  ];
}

export class Armory extends Screen {
  constructor(app) {
    super(app, 'armory fe-shade2', `${header('武器庫', 'ARMORY', { right: '<span class="fe-hint">局內於購買時間購買</span>' })}
      <nav class="ar-tabs fe-seg"></nav>
      <div class="fe-body ar-body">
        <div class="ar-grid fe-scroll"></div>
        <section class="fe-panel ar-detail"></section>
      </div>`);
    this.tab = 'rifle';
    this.sel = 'akm';
  }

  enter() { this.render(); }

  onAct(act, t) {
    if (act === 'tab') { this.tab = t.dataset.tab; this.sel = this._list()[0]?.id; this.render(); }
    else if (act === 'pick') { this.sel = t.dataset.id; this.render(); }
  }

  _list() { return Object.values(WEAPONS).filter((w) => w.cat === this.tab).sort((a, b) => a.price - b.price); }

  render() {
    const tabs = ARMORY_TABS.filter((c) => Object.values(WEAPONS).some((w) => w.cat === c));
    this.$('.ar-tabs').innerHTML = tabs.map((c) => `<button data-act="tab" data-tab="${c}" class="${c === this.tab ? 'on' : ''}">${CATS[c]?.zh || c}</button>`).join('');
    const list = this._list();
    this.$('.ar-grid').innerHTML = list.map((w) => `<button class="ar-card${w.id === this.sel ? ' on' : ''}" data-act="pick" data-id="${w.id}">
      <span class="ar-img"><img alt=""><i class="ar-ph"></i></span><b>${esc(w.zh)}</b><small>${esc(w.en)}</small><span class="ar-price">${w.price ? '$' + w.price : '初始裝備'}</span></button>`).join('');
    for (const card of this.$$('.ar-card')) this._icon(card.querySelector('.ar-img'), card.dataset.id);
    const w = WEAPONS[this.sel] || list[0];
    const det = this.$('.ar-detail');
    if (!w) { det.innerHTML = ''; return; }
    det.innerHTML = `<div class="ad-img ar-img big"><img alt=""><i class="ar-ph"></i></div>
      <div class="ad-n"><b>${esc(w.zh)}</b><small>${esc(w.en)}</small></div>
      <div class="ad-tags"><span>${CATS[w.cat]?.zh || ''}</span>${w.mode ? `<span>${MODE_ZH[w.mode] || w.mode}</span>` : ''}${w.mag ? `<span>彈匣 ${w.mag} / ${w.reserve}</span>` : ''}<span>${w.price ? '$' + w.price : '初始'}</span></div>
      <div class="ad-stats">${w.cat === 'melee' ? '' : weaponStats(w).map(([k, v]) => `<div><span>${k}</span><i><u style="width:${(v * 100).toFixed(0)}%"></u></i></div>`).join('')}</div>`;
    this._icon(det.querySelector('.ad-img'), w.id, true);
  }

  _icon(box, id, big = false) {
    weaponIcon(this.app.renderer, id, big ? { w: 384, h: 144 } : undefined).then((u) => {
      if (!box.isConnected) return;
      if (u) { box.querySelector('img').src = u; box.classList.add('ok'); }
      else box.classList.add('none');
    });
  }
}
