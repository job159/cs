// End-of-match results: victory / defeat banner (map, difficulty, round reached, time, team wipes), our own line
// (kills, headshot rate, assists, downs / bleed-outs, level, damage, boss damage, money earned, upgrades bought, best
// weapon) with the upgrade levels we bought, then the squad table sorted by score with the MVP (multiplayer: every
// player from the host's replicated board; solo with AI teammates: you and the bots); play again / back to lobby /
// main menu. Rows and number formats are the Tab scoreboard's (ui/scoreboard.js): $14,105, 21,330.
// The 補給 strip by the buttons: the crate points this match earned (回合 / 首領 / 任務完成 x difficulty), the bar to
// the next crate filling from where it was, the crates it completed and a way to the armory's 補給箱 tab.
import { Screen, esc, ICON } from './kit.js';
import { inventory, EARN } from './inventory.js';
import { DIFF_INFO } from './menu.js';
import { mapInfo } from '../world/maps/index.js';
import { ROUNDS, UPGRADES } from '../match/rules.js';
import { num, cash, clock, hsPct, scoreOf, byScore, pickMvp, bestWeapon, soloRows, weaponCell, avatar, SCORE_RULE } from './scoreboard.js';

export { pickMvp };

export class ResultsScreen extends Screen {
  constructor(app) {
    super(app, 'results', `
      <div class="rs-banner"><small class="rs-en"></small><b class="rs-t"></b><span class="rs-sub"></span></div>
      <div class="rs-mid"></div>
      <div class="rs-foot"><div class="rs-sup"></div><div class="rs-btns"></div></div>`);
    this.again = () => this.refresh();   // a weapon silhouette arrived
  }

  enter(data) {
    this.data = data;
    this.app.game?.shop?.close?.();   // (the buy menu stayed open behind the results when the match ended in it)
    const { victory } = data;
    this.el.classList.toggle('win', !!victory);
    this.el.classList.toggle('lose', !victory);
    this.$('.rs-en').textContent = victory ? 'MISSION COMPLETE' : 'MISSION FAILED';
    this.$('.rs-t').textContent = victory ? '任務完成' : '任務失敗';
    const info = mapInfo(data.map);
    const d = DIFF_INFO[data.difficulty] || DIFF_INFO.normal;
    const wipes = data.stats?.deaths | 0;
    // (match time: the scoreboard's clock, a paused solo match excluded; the wall time when the match is gone)
    const g = this.app.game, m = g?.match;
    this.$('.rs-sub').innerHTML = `${esc(info.zh)}　·　<b style="color:${d.color}">${d.zh}</b>　·　抵達第 ${data.round} / ${ROUNDS.length} 回合　·　用時 ${clock(m?.elapsed || data.time)}`
      + (wipes ? `　·　全員陣亡 ${wipes} 次` : '');
    // solo: the line-up as the match left it (the game stays up behind the results until we leave them); our own
    // money upgrades for the chips (multiplayer too: they are ours)
    this.solo = data.mp ? null : m ? soloRows(g, this.app.playerName) : this._fallbackRows();
    this.board = null;   // multiplayer: the last board seen (kept if the room closes under the results)
    this.ups = m ? { ...m.upgrades } : null;
    this.renderMid();
    this.renderBtns();
    this.renderSupply();
  }

  /** The 補給 strip: this match's crate points (rendered once: the bar animates from the old progress to the new). */
  renderSupply() {
    const box = this.$('.rs-sup');
    const r = this.app.game?.rewards?.result || (Date.now() - (inventory.lastMatch?.at || 0) < 60000 ? inventory.lastMatch : null);
    clearTimeout(this._supT);
    if (!r) { box.innerHTML = ''; box.classList.remove('on'); return; }
    const per = EARN.perCrate, mul = r.mul || 1;
    const n = (k, unit) => Math.round((r.parts?.[k] || 0) / (unit * mul));
    const parts = [['回合', n('round', EARN.round), r.parts?.round], ['首領', n('boss', EARN.boss), r.parts?.boss], ['任務完成', 0, r.parts?.victory]]
      .filter(([, , v]) => v > 0).map(([k, c, v]) => `<span>${k}${c > 1 ? ` ×${c}` : ''}<b>+${Math.round(v)}</b></span>`);
    if (mul !== 1) parts.push(`<span class="mul">難度 ×${mul}</span>`);
    const pct = (v) => `${Math.max(0, Math.min(100, (v / per) * 100)).toFixed(1)}%`;
    box.classList.add('on');
    box.classList.toggle('got', r.got > 0);
    box.innerHTML = `<i class="rsp-ic" aria-hidden="true"></i>
      <div class="rsp-txt">
        <div class="rsp-h"><b>補給</b><small>SUPPLY</small><em>${r.pts > 0 ? `+${r.pts}` : '+0'}</em>${parts.length ? `<span class="rsp-parts">${parts.join('')}</span>` : '<span class="rsp-parts"><span>清除一回合即可獲得補給點數</span></span>'}</div>
        <div class="rsp-bar"><i><u style="width:${pct(r.before)}"></u></i><span><b>${Math.floor(r.after)}</b> / ${per}</span></div>
      </div>
      ${r.got > 0 ? `<div class="rsp-got"><span>獲得補給箱<b>×${r.got}</b></span><button class="fe-btn sm" data-act="crates">前往開啟</button></div>` : `<div class="rsp-got dim"><span>持有補給箱<b>${inventory.crates.owned}</b></span>${inventory.crates.owned ? '<button class="fe-btn sm" data-act="crates">前往開啟</button>' : ''}</div>`}`;
    // fill: from the old progress to 100 % once per crate completed (a pulse each), then to the new progress
    const u = box.querySelector('.rsp-bar u');
    const steps = [...Array(Math.min(3, r.got | 0)).fill(100), r.after];
    let i = 0;
    const next = () => {
      if (!u.isConnected || i >= steps.length) return;
      const to = steps[i++];
      u.style.transition = 'width .7s cubic-bezier(.3,.7,.2,1)';
      u.style.width = pct(to);
      if (to >= 100) {
        this._supT = setTimeout(() => {
          box.classList.remove('pulse'); void box.offsetWidth; box.classList.add('pulse');
          this.app.audio.play('ui_equip');
          u.style.transition = 'none'; u.style.width = '0%'; void u.offsetWidth;
          next();
        }, 760);
      }
    };
    this._supT = setTimeout(next, 650);
  }

  /** Solo rows from the end-of-match data alone (no match left to read). */
  _fallbackRows() {
    const s = this.data.stats || {};
    return [{ id: 'me', name: this.app.playerName, slot: 0, self: true, k: s.kills | 0, h: s.headshots | 0, a: s.assists | 0, d: s.damage || 0, b: s.bossDamage || 0,
      lv: this.data.level || s.level || 1, m: s.money || 0, up: s.upgrades | 0, dn: s.downs | 0, dd: s.died | 0, bw: bestWeapon(s.weaponKills) },
    ...(this.data.squad || []).map((b, i) => ({ ...b, id: 'ai' + i, name: String(b.name || '').replace(/^［AI］/, ''), slot: i + 1, ai: true, a: 0, dn: b.downs | 0, dd: 0, lv: null, m: null, up: null }))];
  }

  renderMid() {
    const data = this.data, mp = !!data.mp, app = this.app;
    const live = mp && app.coop?.boardRows();
    if (live?.length) this.board = live;
    const rows = byScore(mp ? [...(this.board || [])] : [...(this.solo || [])]);
    const s = data.stats || {};
    // our line: the board's row (multiplayer: the host's counts), else the match's own stats
    const me = rows.find((r) => r.self) || { k: s.kills | 0, h: s.headshots | 0, a: s.assists | 0, d: s.damage || 0, b: s.bossDamage || 0, m: s.money || 0,
      lv: data.level || 1, up: s.upgrades | 0, dn: s.downs | 0, dd: s.died | 0, bw: null };
    const tiles = [
      ['擊殺', num(me.k)], ['爆頭率', `${hsPct(me)}<small>%</small>`], ['助攻', num(me.a)], ['倒地／陣亡', `${me.dn | 0}<small>／</small>${me.dd | 0}`],
      ['等級', `<small>Lv</small>${me.lv || data.level || 1}`], ['總傷害', num(me.d)], ['首領傷害', num(me.b)], ['賺取金錢', cash(me.m)],
      ['購買強化', `${me.up | 0}<small>級</small>`], ['最佳武器', weaponCell(app.renderer, me.bw, this.again), 'rs-best'],
    ];
    let html = `<div class="rs-tiles">${tiles.map(([k, v, cls]) => `<div${cls ? ` class="${cls}"` : ''}><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
    const ups = UPGRADES.filter((u) => this.ups?.[u.id] > 0);
    if (ups.length) html += `<div class="rs-ups"><span>已購強化</span>${ups.map((u) => `<em>${u.zh}<b>Lv ${this.ups[u.id]}</b><small>${u.show(this.ups[u.id])}</small></em>`).join('')}</div>`;
    // the squad table: multiplayer, or solo with AI teammates
    if (rows.length > 1) {
      const mvp = pickMvp(rows);
      const dash = '<i class="sb-none">—</i>';
      const row = (r) => `<div class="rt-r${r.self ? ' self' : ''}${r.id === mvp ? ' mvp' : ''}">`
        + `<span class="rt-n">${avatar(r)}<span class="rt-nm">${esc(r.name)}</span>${r.id === mvp ? `<i class="rt-mvp">${ICON.star}MVP</i>` : ''}${r.host ? '<em>房主</em>' : r.ai ? '<em>AI</em>' : ''}</span>`
        + [r.lv ? `<small>Lv</small>${r.lv}` : dash, num(scoreOf(r)), num(r.k), `${hsPct(r)}<small>%</small>`, num(r.a), `${r.dn | 0}<small>／</small>${r.dd | 0}`,
          num(r.d), num(r.b), r.m == null ? dash : cash(r.m), r.up == null ? dash : num(r.up)].map((c) => `<span>${c}</span>`).join('')
        + `<span class="rt-w">${weaponCell(app.renderer, r.bw, this.again)}</span></div>`;
      html += `<div class="rs-table"><div class="rt-h"><span>${mp ? '玩家' : '隊伍'}</span><span>等級</span><span>分數</span><span>擊殺</span><span>爆頭</span><span>助攻</span>`
        + `<span>倒地／陣亡</span><span>傷害</span><span>首領傷害</span><span>賺取金錢</span><span>強化</span><span>最佳武器</span></div>${rows.map(row).join('')}`
        + `<div class="rt-f">${SCORE_RULE}</div></div>`;
    }
    this.$('.rs-mid').innerHTML = html;
    this.el.classList.toggle('mp', mp);
    this.el.classList.toggle('squad', rows.length > 1);
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

  leave() { clearTimeout(this._supT); }

  /** New scoreboard from the host (multiplayer), or a weapon silhouette that just arrived. */
  refresh() { if (this.app.screen === this) this.renderMid(); }

  back() { this.onAct(this.data?.mp && this.app.room ? 'lobby' : 'menu'); return true; }

  onAct(act) {
    const app = this.app;
    if (act === 'crates') {
      // the armory's 補給箱 tab (multiplayer: that leaves the room, asked first like 主選單)
      const go = () => { app.toMenu(); app.show('armory', { tab: 'crates' }); };
      if (app.room) {
        app.dialogs.confirm('前往武器庫', app.room.isHost ? '你是房主，前往武器庫會關閉房間。' : '你將離開這個房間。', { ok: '離開房間', danger: true })
          .then((ok) => { if (ok) { app.leaveRoom(); go(); } });
      } else go();
    } else if (act === 'again') {
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
