// Main menu, solo setup, chapter select and armory screens, plus the cinematic menu backdrop (the current
// map seen through a slow curated camera dolly / orbit behind a dark gradient).
import * as THREE from 'three';
import { Screen, header, esc, ICON } from './kit.js';
import { DIFFICULTY, ROUNDS } from '../match/rules.js';
import { CHAPTERS, TRAINING, mapInfo, mapKicker, hasMap } from '../world/maps/index.js';
import { WEAPONS, CATS } from '../weapons/defs.js';
import { weaponIcon } from './icons.js';
import { mapThumb } from './mapthumb.js';

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

const ICON_TARGET = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" stroke-width="2"/></svg>';
const ICON_SWAP = '<svg viewBox="0 0 24 24"><path d="M4 8h14l-4-4M20 16H6l4 4" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

/** Kicker line of a map: 第一章 / 訓練場, plus a 建置中 badge for unfinished chapters. */
function kicker(info) {
  return `<span class="mc-k">${esc(mapKicker(info))}${info.status === 'wip' && !hasMap(info.id) ? '<em class="mc-wip">建置中</em>' : ''}</span>`;
}

/**
 * Map card. small: name + meta only (menu, lobby). act: renders a <button data-act=act> (opens chapter
 * select) with a 更換 hint instead of a <div>.
 */
export function mapCard(info, { small = false, act = '' } = {}) {
  const tag = act ? 'button' : 'div';
  return `<${tag} class="map-card${small ? ' small' : ''}${act ? ' pick' : ''}"${act ? ` data-act="${act}" aria-label="選擇地圖：${esc(info.zh)}"` : ''}>
    ${mapThumb(info, 'mc-bg')}
    <span class="mc-txt">
      ${kicker(info)}
      <span class="mc-n"><b>${esc(info.zh)}</b><small>${esc(info.en)}</small></span>
      ${small ? '' : `<span class="mc-obj">${ICON_TARGET}${esc(info.objective || '')}</span><span class="mc-d">${esc(info.desc || '')}</span>`}
      <span class="mc-m"><span>${info.rounds || ROUNDS.length} 回合</span>${info.boss !== false ? '<span>首領戰</span>' : ''}<span>1–4 人</span></span>
    </span>
    ${act ? `<span class="mc-chg">${ICON_SWAP}更換</span>` : ''}
  </${tag}>`;
}

// ---------------------------------------------------------------- chapter select

/**
 * Chapter select dialog: a horizontal strip of chapter cards (thumbnail, 第 N 章, name, rounds / boss),
 * then the training grounds; the description of the highlighted card only. Unfinished chapters are
 * listed with a 建置中 badge so the chapter structure is visible, but cannot be picked.
 * Resolves with the chosen map id, or null.
 */
export function pickMap(app, current) {
  let sel = hasMap(current) ? current : null;
  const card = (m) => {
    const locked = !hasMap(m.id);
    return `<button class="ch-card${m.id === sel ? ' on' : ''}${locked ? ' locked' : ''}" data-id="${m.id}" ${locked ? 'aria-disabled="true"' : ''}>
      ${mapThumb(m, 'ch-img')}${locked ? `<span class="ch-lock">${ICON.lock}建置中</span>` : ''}
      <span class="ch-k">${esc(mapKicker(m))}</span><b>${esc(m.zh)}</b><small>${esc(m.en)}</small>
      <span class="ch-m">${m.rounds || ROUNDS.length} 回合${m.boss !== false ? '　·　首領戰' : ''}</span></button>`;
  };
  const body = document.createElement('div');
  body.className = 'ch';
  body.innerHTML = `<div class="ch-strip fe-hscroll">
      ${CHAPTERS.map(card).join('')}${TRAINING.length ? `<span class="ch-sep" aria-hidden="true"></span>${TRAINING.map(card).join('')}` : ''}
    </div><div class="ch-detail"></div>`;
  const detail = body.querySelector('.ch-detail');
  const show = (id) => {
    const m = mapInfo(id);
    const locked = !hasMap(m.id);
    detail.innerHTML = `<span class="ch-obj">${ICON_TARGET}${esc(m.objective || '')}</span><p>${esc(m.desc || '')}${locked ? '<em>這一章仍在建置中，完成後即可遊玩。</em>' : ''}</p>`;
  };
  show(sel || current || CHAPTERS[0]?.id || TRAINING[0]?.id);
  const d = app.dialogs.show({ title: '選擇章節', body, cls: 'wide ch-dlg', dismiss: false, backCancels: true,
    buttons: [{ label: '取消', value: false }, { label: '選擇', cls: 'pri ch-ok', value: true }] });
  const ok = d.el.querySelector('.ch-ok');
  const upd = () => { ok.disabled = !sel; };
  body.addEventListener('click', (e) => {
    const b = e.target.closest('.ch-card');
    if (!b) return;
    show(b.dataset.id); // a locked chapter only shows its details (with the 建置中 note)
    if (b.classList.contains('locked')) return;
    sel = b.dataset.id;
    for (const c of body.querySelectorAll('.ch-card')) c.classList.toggle('on', c === b);
    upd();
  });
  body.addEventListener('dblclick', (e) => { const b = e.target.closest('.ch-card:not(.locked)'); if (b) d.close(true); });
  upd();
  requestAnimationFrame(() => body.querySelector('.ch-card.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  return d.done.then((v) => (v === true && sel ? sel : null));
}

// ---------------------------------------------------------------- backdrop

const _v = new THREE.Vector3(), _t = new THREE.Vector3();

/** Positions the camera of a world-only game for the menu backdrop: curated dolly path or slow orbit. */
export function orbitBackdrop(game, info, t) {
  const def = game.world.def || {};
  const pv = info?.preview || def.preview || {};
  const cam = game.camera;
  if (pv.path?.length >= 2) {
    // closed Catmull-Rom loop through [x, y, z, tx, ty, tz] keys, one lap per `period` seconds
    if (!pv._curves) {
      pv._curves = [
        new THREE.CatmullRomCurve3(pv.path.map((k) => new THREE.Vector3(k[0], k[1], k[2])), true, 'centripetal'),
        new THREE.CatmullRomCurve3(pv.path.map((k) => new THREE.Vector3(k[3], k[4], k[5])), true, 'centripetal'),
      ];
    }
    const u = ((t / (pv.period || 60)) % 1 + 1) % 1;
    pv._curves[0].getPoint(u, _v);
    pv._curves[1].getPoint(u, _t);
    cam.position.copy(_v);
    cam.lookAt(_t);
  } else {
    const sp = game.world.playerSpawns?.[0];
    const target = pv.target ? _t.set(...pv.target) : _t.set(sp?.x || 0, (sp?.y || 0) + 1.5, sp?.z || 0);
    const r = pv.radius ?? 14, h = pv.height ?? 4, a = (pv.start ?? 0.6) + t * (pv.speed ?? 0.045);
    cam.position.set(target.x + Math.sin(a) * r, target.y + h, target.z + Math.cos(a) * r);
    cam.lookAt(target);
  }
  cam.updateMatrixWorld();
}

// ---------------------------------------------------------------- main menu

const canExit = () => !!window.NativeBridge?.exitApp;

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
        ${canExit() ? '<button data-act="exit"><b>離開</b><small>EXIT</small></button>' : ''}
      </nav>
      <div class="mm-card"></div>
      <div class="mm-foot"><span class="mm-ver"></span></div>`);
    this.$('.mm-ver').textContent = `版本 ${app.version}　·　合作殭屍生存　1–4 人`;
  }

  enter() {
    this.$('.mm-name span').textContent = this.app.playerName;
    this.$('.mm-card').innerHTML = `<div class="mm-card-h">作戰地圖</div>${mapCard(mapInfo(this.app.mapId), { small: true, act: 'map' })}`;
    this.app.ensureBackdrop(this.app.mapId);
  }

  /** Back on the title screen: ask to exit the app (Android); the web build has nothing to go back to. */
  back() { if (canExit()) this.onAct('exit'); return true; }

  onAct(act) {
    const app = this.app;
    if (act === 'solo') app.show('solo');
    else if (act === 'mp') app.show('mp');
    else if (act === 'armory') app.show('armory');
    else if (act === 'settings') app.openOverlay('settings');
    else if (act === 'name') app.editName().then(() => this.enter());
    else if (act === 'map') pickMap(app, app.mapId).then((id) => { if (id) { app.mapId = id; this.enter(); } });
    else if (act === 'exit' && canExit()) {
      app.dialogs.confirm('離開遊戲', '確定要離開災厄前線嗎？', { ok: '離開', danger: true }).then((ok) => { if (ok) window.NativeBridge.exitApp(); });
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
          <div class="solo-map"></div>
          <div class="fe-panel solo-ai">
            <div class="st-l"><b>AI 隊友</b><small>由電腦補位的隊友</small></div>
            <div class="fe-seg ai-seg"></div>
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
    this.$('.solo-map').innerHTML = mapCard(mapInfo(app.mapId), { act: 'map' });
    const n = app.botCount;
    this.$('.ai-seg').innerHTML = [[0, '關'], [1, '1'], [2, '2'], [3, '3']].map(([v, t]) => `<button data-act="bots" data-v="${v}" class="${v === n ? 'on' : ''}" aria-label="AI 隊友 ${t}">${t}</button>`).join('');
  }

  onAct(act, t) {
    const app = this.app;
    if (act === 'diff') { this.diff = t.dataset.id; app.lastDiff = this.diff; this.render(); }
    else if (act === 'map') pickMap(app, app.mapId).then((id) => { if (id) { app.mapId = id; this.render(); app.ensureBackdrop(id); } });
    else if (act === 'bots') { app.botCount = +t.dataset.v; this.render(); }
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

function weaponNums(w) {
  const rows = [['傷害', w.pellets ? `${w.dmg}×${w.pellets}` : String(w.dmg)], ['爆頭倍率', `×${w.head ?? 4}`]];
  if (w.rpm && w.cat !== 'melee') rows.push(['射速', `${w.rpm} RPM`]);
  if (w.reload) rows.push(['換彈', `${w.reload.toFixed(1)} 秒`]);
  if (w.speed) rows.push(['移動速度', `${w.speed.toFixed(1)} m/s`]);
  if (w.range) rows.push(['有效距離', `${w.range[0]}–${w.range[1]} m`]);
  return rows;
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
    // bars never drop below a sliver, so a weak stat still reads as a (short) bar rather than a missing one
    det.innerHTML = `<div class="ad-img ar-img big"><img alt=""><i class="ar-ph"></i></div>
      <div class="ad-n"><b>${esc(w.zh)}</b><small>${esc(w.en)}</small></div>
      <div class="ad-tags"><span>${CATS[w.cat]?.zh || ''}</span>${w.mode ? `<span>${MODE_ZH[w.mode] || w.mode}</span>` : ''}${w.mag ? `<span>彈匣 ${w.mag} / ${Number.isFinite(w.reserve) ? w.reserve : '∞'}</span>` : ''}<span>${w.price ? '$' + w.price : '初始'}</span></div>
      <div class="ad-cols">
        <div class="ad-stats">${w.cat === 'melee' ? '' : weaponStats(w).map(([k, v]) => `<div><span>${k}</span><i><u style="width:${(Math.max(0.06, v) * 100).toFixed(0)}%"></u></i></div>`).join('')}</div>
        <div class="ad-nums">${weaponNums(w).map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>
      </div>`;
    this._icon(det.querySelector('.ad-img'), w.id, true);
  }

  _icon(box, id, big = false) {
    box.classList.add('loading');
    weaponIcon(this.app.renderer, id, big ? { w: 384, h: 144 } : undefined).then((u) => {
      if (!box.isConnected) return;
      box.classList.remove('loading');
      if (u) { box.querySelector('img').src = u; box.classList.add('ok'); }
      else box.classList.add('none');
    }, () => { box.classList.remove('loading'); box.classList.add('none'); });
  }
}
