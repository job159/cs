// In-game pause menu (Esc / Android Back / the touch HUD menu button): resume, settings, leave the
// fight (confirmed). Solo freezes the simulation; in multiplayer the match keeps running underneath.
// Desktop: a controls card (the live key bindings) under the match info, with a shortcut to the 按鍵 settings.
import { Screen, esc, ICON } from './kit.js';
import { DIFF_INFO } from './menu.js';
import { mapInfo } from '../world/maps/index.js';
import { ROUNDS } from '../match/rules.js';
import { injectCSS } from './crosshairs.js';
import { primaryKey, bindLabel } from '../engine/keybinds.js';

// [label, actions shown as keys]
const CONTROLS = [
  ['移動', ['f', 'l', 'b', 'r']], ['跳躍', ['jump']], ['蹲下', ['crouch']], ['換彈', ['reload']],
  ['武器特殊技', ['special']], ['投擲手雷', ['grenade']], ['檢視武器', ['inspect']], ['互動／救援', ['use']],
  ['購買選單', ['buy']], ['切換武器', ['slot1', 'next']],
];

injectCSS('pause-pc-css', `
.pz-side { margin-left: auto; margin-right: 1rem; display: flex; flex-direction: column; gap: .6rem; min-width: 15rem; }
.pz-side .pz-info { margin: 0; }
.pz-keys { background: var(--fe-panel); border: 1px solid var(--fe-line); padding: .35rem .95rem .55rem; }
.pz-kh { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; padding: .25rem 0 .35rem; border-bottom: 1px solid rgba(255,255,255,.08); }
.pz-kh b { font-size: .8rem; font-weight: 700; letter-spacing: .16em; color: var(--accent); }
.pz-kh button { background: none; border: 0; padding: 0; font-size: var(--fs-xs); color: var(--dim); letter-spacing: .04em; }
.pz-kh button:hover, .pz-kh button:focus-visible { color: #fff; text-decoration: underline; text-underline-offset: 3px; outline: none; }
.pz-kl { display: grid; grid-template-columns: 1fr 1fr; gap: .1rem 1.4rem; margin-top: .35rem; }
.pz-kl div { display: flex; align-items: center; justify-content: space-between; gap: .6rem; min-height: 1.6rem; font-size: .8rem; color: #cfc9be; white-space: nowrap; }
.pz-kl span { display: inline-flex; gap: 3px; }
.pz-kl .kc { height: 19px; min-width: 19px; font-size: 11px; }
body.touch .pz-keys { display: none; }
@media (max-height: 560px) { .pz-keys { display: none; } }
`);

const kcap = (code) => { const t = bindLabel(code); return `<kbd class="kc${t.length > 1 ? ' w' : ''}">${esc(t)}</kbd>`; };

export class PauseMenu extends Screen {
  constructor(app) {
    super(app, 'pause', `
      <div class="pz-panel">
        <div class="pz-title"><b></b><small></small></div>
        <p class="pz-note"></p>
        <nav class="pz-nav">
          <button class="fe-btn pri big" data-act="resume">${ICON.play}<span>繼續</span></button>
          <button class="fe-btn big" data-act="settings"><span>設定</span></button>
          <button class="fe-btn big danger" data-act="quit"><span>離開戰鬥</span></button>
        </nav>
      </div>
      <div class="pz-side"><div class="pz-info"></div><div class="pz-keys"></div></div>`);
  }

  enter() {
    const app = this.app, g = app.game, m = g?.match, mp = !!app.room;
    this.el.classList.toggle('mp', mp); // lighter backdrop: the fight keeps going underneath
    this.$('.pz-title b').textContent = mp ? '選單' : '已暫停';
    this.$('.pz-title small').textContent = mp ? 'MENU' : 'PAUSED';
    this.$('.pz-note').textContent = mp ? '多人遊戲不會暫停，戰鬥仍在進行中。' : '';
    const info = mapInfo(app.matchInfo?.map);
    const d = DIFF_INFO[app.matchInfo?.difficulty] || DIFF_INFO.normal;
    const rows = [['地圖', esc(info.zh)], ['難度', `<b style="color:${d.color}">${d.zh}</b>`]];
    if (m) {
      rows.push(['回合', `${Math.max(1, m.round)} / ${ROUNDS.length}`], ['擊殺', String(m.stats.kills)], ['爆頭', String(m.stats.headshots)], ['助攻', String(m.stats.assists | 0)]);
      if (!mp) rows.push(['剩餘重試', String(m.retries)]);
    }
    if (mp) rows.push(['房號', esc(app.room.code)], ['玩家', String(app.room.players().length)]);
    this.$('.pz-info').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    // controls card (re-rendered on every open: bindings may have changed in the settings)
    const keys = (acts) => {
      if (acts[0] === 'slot1') return kcap('Digit1') + '<i style="opacity:.6;font-style:normal">–</i>' + kcap('Digit5') + kcap('Wheel');
      return acts.map((a) => primaryKey(a)).filter(Boolean).map(kcap).join('');
    };
    this.$('.pz-keys').innerHTML = `<div class="pz-kh"><b>操作</b><button data-act="keys">變更按鍵 ›</button></div>
      <div class="pz-kl">${CONTROLS.map(([zh, acts]) => `<div>${zh}<span>${keys(acts) || '<em style="color:#ff9584;font-style:normal">未設定</em>'}</span></div>`).join('')}</div>`;
  }

  back() { this.app.resume(); return true; }

  /** Multiplayer: we took damage while the menu is open (red edge flash). */
  hurt() {
    this.el.classList.remove('hurt');
    void this.el.offsetWidth;
    this.el.classList.add('hurt');
  }

  onAct(act) {
    const app = this.app;
    if (act === 'resume') app.resume();
    else if (act === 'settings') app.openOverlay('settings');
    else if (act === 'keys') app.openOverlay('settings', { tab: 'keys' });
    else if (act === 'quit') {
      const host = app.room?.isHost;
      const text = !app.room ? '目前的進度不會保存。' : host ? '你是房主：離開會結束所有玩家的這場戰鬥並關閉房間。' : '你將離開房間，回到多人連線選單。';
      app.dialogs.confirm('離開戰鬥', text, { ok: '離開戰鬥', danger: true }).then((ok) => { if (ok) app.quitMatch(); });
    }
  }
}
