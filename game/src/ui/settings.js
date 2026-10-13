// Player settings: persisted in localStorage ('cf.settings'), applied live to the renderer, input,
// touch controls, HUD (crosshair / markers / numbers), audio buses and haptics; plus the settings
// screen (tabs 操作 / 畫面 / 準星 / 音效), usable from the main menu and from the pause menu. Rows that do not
// apply to the device are hidden (mouse sensitivity on phones; touch sensitivity, gyro, haptics, left-handed
// layout and HUD button size / opacity on desktop).
import { Screen, header, esc } from './kit.js';
import { haptic } from '../weapons/arsenal.js';

const KEY = 'cf.settings';

export const DEFAULTS = {
  touchSens: 1.0, mouseSens: 1.0, adsSens: 1.0, gyro: 'off', gyroSens: 1.0, fov: 96, leftHanded: false, haptics: true,
  hudScale: 100, hudAlpha: 100,
  quality: 'auto', showFps: false,
  xhColor: '#4dff6a', xhSize: 9, xhGap: 4, xhThick: 2, xhDot: false, hitmarker: true, damageNumbers: true,
  master: 90, sfx: 100, music: 55,
};

export const XH_COLORS = ['#4dff6a', '#f2e34a', '#4de7ff', '#ffffff', '#ff4fd8', '#ff5a3d'];

/** Picks a quality tier for 'auto': phones medium (low on <= 4 GB devices), desktops high. */
export function autoQuality() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (!coarse) return 'high';
  const mem = navigator.deviceMemory || 4;
  return mem <= 3 ? 'low' : 'medium';
}

export class Settings {
  constructor() {
    this.v = { ...DEFAULTS };
    try {
      // older per-feature keys (HUD crosshair, touch sensitivity) seed the first load
      const hud = JSON.parse(localStorage.getItem('cf.hud') || 'null');
      if (hud) Object.assign(this.v, { xhColor: hud.crosshairColor ?? this.v.xhColor, xhGap: hud.crosshairGap ?? this.v.xhGap, xhSize: hud.crosshairLen ?? this.v.xhSize,
        xhThick: hud.crosshairThick ?? this.v.xhThick, xhDot: hud.dot ?? this.v.xhDot, hitmarker: hud.hitmarker ?? true, damageNumbers: hud.damageNumbers ?? true });
      const ts = localStorage.getItem('cf.touchSens');
      if (ts) this.v.touchSens = +ts || 1;
      Object.assign(this.v, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch { /* defaults */ }
    this.listeners = new Set();
  }
  get(k) { return this.v[k]; }
  set(k, value) {
    if (this.v[k] === value) return;
    this.v[k] = value;
    this.save();
    for (const fn of this.listeners) fn(k, value);
  }
  reset() {
    this.v = { ...DEFAULTS };
    this.save();
    for (const fn of this.listeners) fn(null);
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch { /* private mode */ } }
  onChange(fn) { this.listeners.add(fn); }
}

/**
 * Applies every setting to the running systems. Cheap: safe to call on each change and whenever a
 * new game (HUD, touch controls) is created. qualityLock: a ?q= dev override wins over the setting.
 */
export function applySettings(app) {
  const s = app.settings.v;
  const { renderer, input, audio } = app;
  input.mouseSens = s.mouseSens;
  input.touchSens = s.touchSens;
  if (!app.qualityLock) {
    const q = s.quality === 'auto' ? autoQuality() : s.quality;
    if (renderer.qualityName !== q) renderer.setQuality(q);
  }
  audio.setVolume('master', s.master / 100);
  audio.setVolume('sfx', s.sfx / 100);
  audio.setVolume('music', s.music / 100);
  haptic.enabled = !!s.haptics;
  app.gyro?.setMode(s.gyro, s.gyroSens);
  document.body.classList.toggle('lefty', !!s.leftHanded);
  document.body.style.setProperty('--tb-scale', String((s.hudScale || 100) / 100));
  document.body.style.setProperty('--tb-alpha', String((s.hudAlpha || 100) / 100));
  app.fpsEl?.classList.toggle('on', !!s.showFps);
  const g = app.game;
  if (!g) return;
  g.hfov = s.fov;
  g.adsSens = s.adsSens;
  g._updateFov?.();
  if (g.touch) g.touch.sens = s.touchSens;
  if (g.hud) {
    Object.assign(g.hud.settings, { crosshairColor: s.xhColor, crosshairLen: s.xhSize, crosshairGap: s.xhGap, crosshairThick: s.xhThick,
      dot: s.xhDot, hitmarker: s.hitmarker, damageNumbers: s.damageNumbers });
    g.hud.cache.xh = null;
  }
}

// ---------------------------------------------------------------- settings screen

const TABS = [
  { id: 'ctl', zh: '操作', en: 'CONTROLS' },
  { id: 'gfx', zh: '畫面', en: 'GRAPHICS' },
  { id: 'xh', zh: '準星', en: 'CROSSHAIR' },
  { id: 'snd', zh: '音效', en: 'AUDIO' },
];

const QUALITY_OPTS = [['auto', '自動'], ['low', '低'], ['medium', '中'], ['high', '高'], ['ultra', '極致']];

function slider(key, zh, desc, min, max, step, fmt = (v) => v) {
  return { type: 'slider', key, zh, desc, min, max, step, fmt };
}
function toggle(key, zh, desc) { return { type: 'toggle', key, zh, desc }; }
const touch = (r) => ({ ...r, dev: 'touch' });
const mouse = (r) => ({ ...r, dev: 'mouse' });
const pct = (v) => `${v}%`;

const ROWS = {
  ctl: [
    touch(slider('touchSens', '觸控視角靈敏度', '滑動畫面轉動視角的速度', 0.3, 3, 0.05, (v) => v.toFixed(2))),
    mouse(slider('mouseSens', '滑鼠靈敏度', '滑鼠轉動視角的速度', 0.2, 4, 0.05, (v) => v.toFixed(2))),
    slider('adsSens', '開鏡靈敏度', '開鏡瞄準時的視角速度倍率（已依放大倍率換算）', 0.3, 1.5, 0.05, (v) => `×${v.toFixed(2)}`),
    touch({ type: 'seg', key: 'gyro', zh: '陀螺儀瞄準', desc: '轉動、傾斜手機來微調準星', opts: [['off', '關'], ['ads', '開鏡時'], ['always', '永遠']] }),
    touch({ ...slider('gyroSens', '陀螺儀靈敏度', '', 0.3, 3, 0.05, (v) => v.toFixed(2)), when: (s) => s.gyro !== 'off' }),
    slider('fov', '視野範圍 FOV', '水平視角（度）', 80, 110, 1, (v) => `${v}°`),
    touch(toggle('leftHanded', '左手操作', '射擊鍵與移動搖桿左右對調')),
    touch(toggle('haptics', '震動回饋', '射擊、受傷時手機震動')),
    touch(slider('hudScale', '按鈕大小', '戰鬥畫面觸控按鈕的大小', 80, 130, 5, pct)),
    touch(slider('hudAlpha', '按鈕不透明度', '降低可看清更多畫面', 30, 100, 5, pct)),
  ],
  gfx: [
    { type: 'seg', key: 'quality', zh: '畫面品質', desc: '自動依裝置效能選擇；陰影與特效數量於下一局完整生效', opts: QUALITY_OPTS },
    toggle('showFps', '顯示 FPS', '在畫面角落顯示每秒幀數'),
  ],
  xh: [
    { type: 'colors', key: 'xhColor', zh: '準星顏色', desc: '' },
    slider('xhSize', '準星長度', '', 2, 20, 1, (v) => `${v}px`),
    slider('xhGap', '準星間距', '最小間距（射擊擴散時會自動張開）', 0, 14, 1, (v) => `${v}px`),
    slider('xhThick', '準星粗細', '', 1, 4, 1, (v) => `${v}px`),
    toggle('xhDot', '中心點', ''),
    toggle('hitmarker', '命中標記', '擊中時準星出現 ✕ 標記與音效'),
    toggle('damageNumbers', '傷害數字', '在目標上方顯示傷害數值'),
  ],
  snd: [
    slider('master', '主音量', '', 0, 100, 1, (v) => `${v}`),
    slider('sfx', '音效', '槍聲、殭屍與環境音', 0, 100, 1, (v) => `${v}`),
    slider('music', '音樂', '', 0, 100, 1, (v) => `${v}`),
  ],
};

export class SettingsScreen extends Screen {
  constructor(app) {
    super(app, 'fe-settings fe-shade2', `${header('設定', 'SETTINGS', { right: '<button class="fe-btn ghost sm" data-act="reset">恢復預設</button>' })}
      <div class="fe-body st-body">
        <nav class="st-tabs">${TABS.map((t) => `<button data-act="tab" data-tab="${t.id}"><b>${t.zh}</b><small>${t.en}</small></button>`).join('')}</nav>
        <div class="st-pane fe-scroll"></div>
      </div>`);
    this.tab = 'ctl';
    this.pane = this.$('.st-pane');
    this.pane.addEventListener('input', (e) => {
      const t = e.target;
      if (t.type !== 'range') return;
      const row = ROWS[this.tab].find((r) => r.key === t.dataset.key);
      if (!row) return;
      const v = +t.value;
      t.closest('.st-row').querySelector('.st-val').textContent = row.fmt(v);
      this._fill(t);
      app.settings.set(row.key, v);
      if (this.tab === 'xh') this._preview();
    });
  }

  enter(data = {}) {
    this.returnTo = data.returnTo || null;
    this.render();
  }

  back() {
    this.app.closeOverlay(this);
    return true;
  }

  onAct(act, t) {
    const s = this.app.settings;
    if (act === 'tab') { this.tab = t.dataset.tab; this.render(); }
    else if (act === 'toggle') { s.set(t.dataset.key, !s.get(t.dataset.key)); this.render(); }
    else if (act === 'seg') {
      const { key, v } = t.dataset;
      if (key === 'gyro' && v !== 'off') {
        // iOS needs the motion permission from this tap; Android / desktop resolve at once
        this.app.gyro.requestPermission().then((ok) => {
          if (!ok || !this.app.gyro.supported) { this.app.toast('此裝置無法使用陀螺儀'); return; }
          s.set(key, v); this.render();
        });
        return;
      }
      s.set(key, v); this.render();
    }
    else if (act === 'color') { s.set('xhColor', t.dataset.v); this.render(); }
    else if (act === 'reset') {
      this.app.dialogs.confirm('恢復預設設定', '所有設定都會回到預設值。', { ok: '恢復預設' }).then((ok) => { if (ok) { s.reset(); this.render(); } });
    }
  }

  /** Rows of the current tab that apply to this device / these settings. */
  _rows() {
    const s = this.app.settings.v;
    const touchUI = this.app.touchMode, fine = !matchMedia('(pointer: coarse)').matches;
    return ROWS[this.tab].filter((r) => (r.dev !== 'touch' || touchUI) && (r.dev !== 'mouse' || fine || !touchUI) && (!r.when || r.when(s)));
  }

  render() {
    const s = this.app.settings.v;
    for (const b of this.$$('.st-tabs button')) b.classList.toggle('on', b.dataset.tab === this.tab);
    const rows = this._rows().map((r) => {
      const label = `<div class="st-l"><b>${esc(r.zh)}</b>${r.desc ? `<small>${esc(r.desc)}</small>` : ''}</div>`;
      let ctl = '';
      if (r.type === 'slider') {
        ctl = `<div class="st-slider"><input type="range" min="${r.min}" max="${r.max}" step="${r.step}" value="${s[r.key]}" data-key="${r.key}" aria-label="${esc(r.zh)}"><span class="st-val">${r.fmt(s[r.key])}</span></div>`;
      } else if (r.type === 'toggle') {
        ctl = `<button class="st-toggle${s[r.key] ? ' on' : ''}" data-act="toggle" data-key="${r.key}" role="switch" aria-checked="${!!s[r.key]}" aria-label="${esc(r.zh)}"><i></i></button>`;
      } else if (r.type === 'seg') {
        ctl = `<div class="fe-seg">${r.opts.map(([v, zh]) => `<button data-act="seg" data-key="${r.key}" data-v="${v}" class="${s[r.key] === v ? 'on' : ''}">${zh}</button>`).join('')}</div>`;
      } else if (r.type === 'colors') {
        ctl = `<div class="st-colors">${XH_COLORS.map((c) => `<button data-act="color" data-v="${c}" class="${s.xhColor === c ? 'on' : ''}" style="--sw:${c}" aria-label="${c}"><i></i></button>`).join('')}</div>`;
      }
      return `<div class="st-row">${label}${ctl}</div>`;
    }).join('');
    // crosshair preview stays pinned at the top of the pane while its rows scroll underneath
    const extra = this.tab === 'xh' ? '<div class="st-row st-sticky"><div class="st-l"><b>預覽</b><small>實際大小</small></div><div class="st-xhprev"><div class="xp-bg"></div><div class="xp-xh"></div></div></div>' : '';
    const qNote = this.tab === 'gfx' && this.app.qualityLock ? '<p class="st-note">網址參數 ?q= 已鎖定畫質。</p>' : '';
    const autoNote = this.tab === 'gfx' && s.quality === 'auto' ? `<p class="st-note">目前自動選擇：${QUALITY_OPTS.find((o) => o[0] === autoQuality())[1]}</p>` : '';
    this.pane.innerHTML = extra + rows + qNote + autoNote;
    for (const r of this.pane.querySelectorAll('input[type=range]')) this._fill(r);
    if (this.tab === 'xh') this._preview();
  }

  _fill(r) {
    const p = ((+r.value - +r.min) / (+r.max - +r.min)) * 100;
    r.style.setProperty('--p', p.toFixed(1) + '%');
  }

  _preview() {
    const box = this.pane.querySelector('.xp-xh');
    if (!box) return;
    const s = this.app.settings.v;
    const L = s.xhSize, T = s.xhThick, G = s.xhGap, c = s.xhColor;
    const bar = (w, h, x, y) => `<i style="width:${w}px;height:${h}px;left:${x}px;top:${y}px;background:${c}"></i>`;
    box.innerHTML = bar(T, L, -T / 2, -G - L) + bar(T, L, -T / 2, G) + bar(L, T, -G - L, -T / 2) + bar(L, T, G, -T / 2)
      + (s.xhDot ? bar(2, 2, -1, -1) : '');
  }
}
