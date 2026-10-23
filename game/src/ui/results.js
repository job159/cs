// End-of-match results: victory / defeat banner, round reached, time, own stats (kills, headshot rate, assists,
// downs, damage, boss damage, level, money earned), the squad table with MVP (multiplayer: every player; solo with
// AI teammates: you and the bots); play again / back to lobby / main menu.
import { Screen, esc, ICON } from './kit.js';
import { DIFF_INFO } from './menu.js';
import { mapInfo } from '../world/maps/index.js';
import { ROUNDS } from '../match/rules.js';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const num = (n) => Math.round(n || 0).toLocaleString('en-US');
const cash = (n) => '$' + num(n);   // (the shop's format: $14,105)

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
    const squad = !mp && this.data.squad?.length ? this.data.squad : null;
    // multiplayer: the table already lists everyone's kills / headshots / damage / money, so the tiles only add what
    // it does not show; solo: the whole line-up (with AI teammates their table follows)
    const tiles = mp
      ? [['爆頭率', hsr + '%'], ['助攻', s.assists | 0], ['倒地', s.downs | 0], ['等級', 'Lv ' + (this.data.level || 1)]]
      : [['擊殺', s.kills | 0], ['爆頭率', hsr + '%'], ['助攻', s.assists | 0], ['倒地', s.downs | 0],
        ['總傷害', num(s.damage)], ['首領傷害', num(s.bossDamage)], ['等級', 'Lv ' + (this.data.level || 1)], ['賺取金錢', cash(s.money)]];
    let html = `<div class="rs-tiles">${tiles.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
    const row = (r, mvp, cells) => `<div class="rt-r${r.self ? ' self' : ''}${r.id === mvp ? ' mvp' : ''}"><span class="rt-n">${r.id === mvp ? `<i class="rt-mvp">${ICON.star}MVP</i>` : ''}`
      + `<span class="rt-nm">${esc(r.name)}</span>${r.host ? '<em>房主</em>' : r.ai ? '<em>AI</em>' : ''}</span>${cells.map((c) => `<span>${c}</span>`).join('')}</div>`;
    if (mp) {
      const rows = this.app.coop?.boardRows() || [];
      const mvp = pickMvp(rows);
      html += `<div class="rs-table c6"><div class="rt-h"><span>玩家</span><span>擊殺</span><span>爆頭</span><span>傷害</span><span>首領傷害</span><span>金錢</span></div>
        ${rows.map((r) => row(r, mvp, [r.k, r.h, num(r.d), num(r.b), cash(r.m)])).join('')}</div>`;
    } else if (squad) {
      // you + the AI teammates (MVP by kills, then headshots, then damage)
      const rows = [{ id: 'me', name: this.app.playerName, self: true, k: s.kills | 0, h: s.headshots | 0, d: s.damage || 0, b: s.bossDamage || 0, downs: s.downs | 0 },
        ...squad.map((b, i) => ({ ...b, id: 'ai' + i, name: b.name.replace(/^［AI］/, ''), ai: true }))];
      const mvp = pickMvp(rows.map((r) => ({ ...r, m: r.d })));
      html += `<div class="rs-table c6"><div class="rt-h"><span>隊伍</span><span>擊殺</span><span>爆頭</span><span>傷害</span><span>首領傷害</span><span>倒地</span></div>
        ${rows.map((r) => row(r, mvp, [r.k, r.h, num(r.d), num(r.b), r.downs | 0])).join('')}</div>`;
    }
    this.$('.rs-mid').innerHTML = html;
    this.el.classList.toggle('mp', !!mp);
    this.el.classList.toggle('squad', !!squad);
  }

  renderBtns() {
    const app = this.app, mp = !!this.data.mp && !!app.room;
    const host = mp && app.room.isHost;
    const b = [];
    if (!mp || host) b.push(`<button class="fe-btn pri big" data-act="again">${ICON.play}<span>再來一局</span></button>`);
    if (mp) b.push(`<button class="fe-btn big" data-act="lobby"><span>返回大廳</span></button>`);
    b.push(`<button class="fe-btn big" data-act="menu"><span>主選單</span></button>`);
    if (mp && !host) b.unshift('<span class="rs-wait"><i class="fe-spin"></i>等待房主開始下一局…</span>');
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
