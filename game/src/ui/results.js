// End-of-match results: victory / defeat banner, round reached, time, own stats (kills, headshots,
// money earned), per-player table with MVP in multiplayer; play again / back to lobby / main menu.
import { Screen, esc, ICON } from './kit.js';
import { DIFF_INFO } from './menu.js';
import { mapInfo } from '../world/maps/index.js';
import { ROUNDS } from '../match/rules.js';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** MVP: most kills, then headshots, then money. Returns the row's id or null. */
export function pickMvp(rows) {
  let best = null;
  for (const r of rows) if (!best || r.k > best.k || (r.k === best.k && (r.h > best.h || (r.h === best.h && r.m > best.m)))) best = r;
  return best && best.k > 0 ? best.id : null;
}

export class ResultsScreen extends Screen {
  constructor(app) {
    super(app, 'results', `
      <div class="rs-banner"><small class="rs-en"></small><b class="rs-t"></b><span class="rs-sub"></span></div>
      <div class="rs-mid"></div>
      <div class="rs-btns"></div>`);
  }

  enter(data) {
    this.data = data;
    const { victory } = data;
    this.el.classList.toggle('win', !!victory);
    this.el.classList.toggle('lose', !victory);
    this.$('.rs-en').textContent = victory ? 'MISSION COMPLETE' : 'MISSION FAILED';
    this.$('.rs-t').textContent = victory ? '任務完成' : '任務失敗';
    const info = mapInfo(data.map);
    const d = DIFF_INFO[data.difficulty] || DIFF_INFO.normal;
    this.$('.rs-sub').innerHTML = `${esc(info.zh)}　·　<b style="color:${d.color}">${d.zh}</b>　·　抵達第 ${data.round} / ${ROUNDS.length} 回合　·　用時 ${fmtTime(data.time)}`;
    this.renderMid();
    this.renderBtns();
  }

  renderMid() {
    const { stats, mp } = this.data;
    const s = stats || { kills: 0, headshots: 0, money: 0 };
    const hsr = s.kills ? Math.round((s.headshots / s.kills) * 100) : 0;
    const tiles = [['擊殺', s.kills, 'KILLS'], ['爆頭', s.headshots, 'HEADSHOTS'], ['爆頭率', hsr + '%', 'HS RATE'], ['賺取金錢', '$' + Math.round(s.money), 'EARNED']];
    let html = `<div class="rs-tiles">${tiles.map(([k, v, en]) => `<div><small>${en}</small><b>${v}</b><span>${k}</span></div>`).join('')}</div>`;
    if (mp) {
      const rows = this.app.coop?.boardRows() || [];
      const mvp = pickMvp(rows);
      html += `<div class="rs-table"><div class="rt-h"><span>玩家</span><span>擊殺</span><span>爆頭</span><span>金錢</span></div>
        ${rows.map((r) => `<div class="rt-r${r.self ? ' self' : ''}${r.id === mvp ? ' mvp' : ''}"><span class="rt-n">${r.id === mvp ? `<i class="rt-mvp">${ICON.star}MVP</i>` : ''}${esc(r.name)}${r.host ? '<em>房主</em>' : ''}</span><span>${r.k}</span><span>${r.h}</span><span>$${Math.round(r.m)}</span></div>`).join('')}</div>`;
    }
    this.$('.rs-mid').innerHTML = html;
    this.el.classList.toggle('mp', !!mp);
  }

  renderBtns() {
    const app = this.app, mp = !!this.data.mp && !!app.room;
    const host = mp && app.room.isHost;
    const b = [];
    if (!mp || host) b.push(`<button class="fe-btn pri big" data-act="again">${ICON.play}<span>再來一局</span></button>`);
    if (mp) b.push(`<button class="fe-btn big" data-act="lobby"><span>返回大廳</span></button>`);
    b.push(`<button class="fe-btn big" data-act="menu"><span>主選單</span></button>`);
    this.$('.rs-btns').innerHTML = b.join('');
  }

  /** New scoreboard from the host (multiplayer). */
  refresh() { if (this.app.screen === this) this.renderMid(); }

  back() { this.onAct(this.data?.mp && this.app.room ? 'lobby' : 'menu'); return true; }

  onAct(act) {
    const app = this.app;
    if (act === 'again') {
      if (app.room) app.coop.hostStart();
      else app.startSolo({ map: this.data.map, difficulty: this.data.difficulty, bots: this.data.bots ?? app.botCount });
    } else if (act === 'lobby') app.backToLobby();
    else if (act === 'menu') {
      if (app.room) {
        app.dialogs.confirm('回到主選單', app.room.isHost ? '你是房主，回到主選單會關閉房間。' : '你將離開這個房間。', { ok: '離開房間', danger: true })
          .then((ok) => { if (ok) { app.leaveRoom(); app.toMenu(); } });
      } else app.toMenu();
    }
  }
}
