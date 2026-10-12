// In-game pause menu (Esc / Android Back / the touch HUD menu button): resume, settings, leave the
// fight (confirmed). Solo freezes the simulation; in multiplayer the match keeps running underneath.
import { Screen, esc, ICON } from './kit.js';
import { DIFF_INFO } from './menu.js';
import { mapInfo } from '../world/maps/index.js';
import { ROUNDS } from '../match/rules.js';

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
      <div class="pz-info"></div>`);
  }

  enter() {
    const app = this.app, g = app.game, m = g?.match, mp = !!app.room;
    this.$('.pz-title b').textContent = mp ? '選單' : '已暫停';
    this.$('.pz-title small').textContent = mp ? 'MENU' : 'PAUSED';
    this.$('.pz-note').textContent = mp ? '多人遊戲不會暫停，戰鬥仍在進行中。' : '';
    const info = mapInfo(app.matchInfo?.map);
    const d = DIFF_INFO[app.matchInfo?.difficulty] || DIFF_INFO.normal;
    const rows = [['地圖', esc(info.zh)], ['難度', `<b style="color:${d.color}">${d.zh}</b>`]];
    if (m) {
      rows.push(['回合', `${Math.max(1, m.round)} / ${ROUNDS.length}`], ['擊殺', String(m.stats.kills)], ['爆頭', String(m.stats.headshots)]);
      if (!mp) rows.push(['剩餘重試', String(m.retries)]);
    }
    if (mp) rows.push(['房號', esc(app.room.code)], ['玩家', String(app.room.players().length)]);
    this.$('.pz-info').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }

  back() { this.app.resume(); return true; }

  onAct(act) {
    const app = this.app;
    if (act === 'resume') app.resume();
    else if (act === 'settings') app.openOverlay('settings');
    else if (act === 'quit') {
      const host = app.room?.isHost;
      const text = !app.room ? '目前的進度不會保存。' : host ? '你是房主：離開會結束所有玩家的這場戰鬥並關閉房間。' : '你將離開房間，回到多人連線選單。';
      app.dialogs.confirm('離開戰鬥', text, { ok: '離開戰鬥', danger: true }).then((ok) => { if (ok) app.quitMatch(); });
    }
  }
}
