// Tab scoreboard (CS2-style; held on the bound 'score' action, desktop) over the game: chapter / map, mode,
// difficulty, round, infected left / buy-time countdown, match clock, wipe retries; one row per player and AI
// teammate -- avatar initial in the slot colour, name, level, score, kills, headshot %, assists, downs / bleed-outs,
// damage, boss damage, money, the weapon in hand (tier-coded silhouette), ping and P2P / relay in multiplayer; MVP
// star, downed / dead / loading state, sorted by score (rows slide to their new place). Never takes input: no
// pointer events, no keys of its own. The same rows feed the results screen (ui/results.js).
//
// Row fields (net/coop.js boardRows in multiplayer -- host-authoritative, replicated; game.app.coop -- soloRows here
// otherwise):
//   id, name, slot, self, host, ai
//   k kills, h headshots, a assists, d damage, b boss damage, bw best weapon (most kills): counted where the zombies
//     run (host / solo: Match.tally)
//   lv level, c money now, m money earned, sp spent, up upgrade levels bought, dn downs, dd bleed-outs: each player's
//     own client (null for AI teammates: they have no economy, no levels)
// Live, added by liveRows (scoreboard only): st 'up' | 'down' | 'dead' | 'wait', w weapon in hand,
//   net { rtt, relay } | 'host' | null (solo).
import { esc, ICON } from './kit.js';
import { weaponIcon } from './icons.js';
import { TIERS, tierIcon } from './crosshairs.js';
import { DIFF_INFO } from './menu.js';
import { WEAPONS, tierOf } from '../weapons/defs.js';
import { ROUNDS } from '../match/rules.js';
import { mapInfo, mapKicker } from '../world/maps/index.js';

// ------------------------------------------------------------------------------------------------ formatting
export const num = (n) => Math.round(n || 0).toLocaleString('en-US');
export const cash = (n) => '$' + num(n);   // (the shop's format: $14,105)
export const clock = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`;
export const hsPct = (r) => (r.k ? Math.round(((r.h | 0) / r.k) * 100) : 0);

/** Score (sort order, MVP): kills x10, headshots x5, assists x5, damage / 200, boss damage / 100 on top. */
export const scoreOf = (r) => Math.round((r.k | 0) * 10 + (r.h | 0) * 5 + (r.a | 0) * 5 + (r.d || 0) / 200 + (r.b || 0) / 100);
export const SCORE_RULE = '分數＝擊殺×10＋爆頭×5＋助攻×5＋傷害÷200＋首領傷害÷100';

/** Rows by score (then kills, damage, slot). */
export const byScore = (rows) => rows.sort((a, b) => scoreOf(b) - scoreOf(a) || (b.k | 0) - (a.k | 0) || (b.d || 0) - (a.d || 0) || (a.slot | 0) - (b.slot | 0));

/** MVP: the best score (ties: kills, then damage). Returns the row's id, or null while nobody scored. */
export function pickMvp(rows) {
  let best = null;
  for (const r of rows) if (!best || scoreOf(r) > scoreOf(best) || (scoreOf(r) === scoreOf(best) && ((r.k | 0) > (best.k | 0) || ((r.k | 0) === (best.k | 0) && (r.d || 0) > (best.d || 0))))) best = r;
  return best && scoreOf(best) > 0 ? best.id : null;
}

/** The weapon with the most kills in a { weapon id: kills } map, or null. */
export function bestWeapon(wk) {
  let best = null, n = 0;
  for (const [id, k] of Object.entries(wk || {})) if (k > n) { n = k; best = id; }
  return best;
}

// kill-report ids that are not weapon defs (weapons/throwables.js icon ids)
const EXTRA = { he: { zh: '破片手雷', model: 'he' }, fire: { zh: '燃燒彈', model: 'fire' } };
/** A weapon (or grenade) id for display: { zh, tier, model } or null. */
export function weaponInfo(id) {
  const d = WEAPONS[id];
  if (d) return { zh: d.zh, tier: tierOf(d), model: d.model || d.id };
  return EXTRA[id] ? { ...EXTRA[id], tier: 'standard' } : null;
}

// weapon silhouettes (the kill feed's size: one shared cache in ui/icons.js). iconUrl: the data URL, or null (none /
// not ready yet: onReady runs once it is, for every caller that asked meanwhile)
const icons = new Map(), waiting = new Map();
export function iconUrl(renderer, id, onReady) {
  const info = weaponInfo(id);
  if (!info || !renderer) return null;
  const key = info.model;
  if (icons.has(key)) return icons.get(key);
  if (waiting.has(key)) { if (onReady) waiting.get(key).add(onReady); return null; }
  waiting.set(key, new Set(onReady ? [onReady] : []));
  weaponIcon(renderer, key, { w: 160, h: 60 }).catch(() => null).then((u) => {
    icons.set(key, u || null);
    const cbs = waiting.get(key);
    waiting.delete(key);
    if (u) for (const f of cbs) f();
  });
  return null;
}

/** A weapon cell: tier mark + silhouette + name in the tier colour (premium), or a dash. */
export function weaponCell(renderer, id, onReady) {
  const info = weaponInfo(id);
  if (!info) return '<i class="sb-none">—</i>';
  const T = TIERS[info.tier] || TIERS.standard, prem = info.tier !== 'standard', url = iconUrl(renderer, id, onReady);
  return `<span class="sb-wc${prem ? ' prem t-' + info.tier : ''}" style="--wt:${prem ? T.hi : '#cfcac0'};--we:${T.edge}">${prem ? tierIcon(info.tier, 13) : ''}`
    + `${url ? `<img src="${url}" alt="">` : ''}<em>${esc(info.zh)}</em></span>`;
}

// slot colours (player/remote.js SLOT_COLORS hues: the teammate markers), toned for a UI tile
export const SLOT_HUE = [[210, 52, 44], [36, 62, 44], [100, 40, 38], [320, 40, 42]];
/** Avatar: the name's first character on a tile in the slot colour (AI teammates a little greyer). */
export function avatar(r) {
  const [h, s, l] = SLOT_HUE[(r.slot | 0) % SLOT_HUE.length];
  const ch = [...String(r.name || '?').trim()][0] || '?';
  return `<i class="sb-av${r.ai ? ' sb-av-ai' : ''}" style="--ah:${h};--as:${s}%;--al:${l}%">${esc(ch.toUpperCase())}</i>`;
}

// ------------------------------------------------------------------------------------------------ rows
/** Solo rows: us and the AI teammates (their kills / damage from BotSquad, assists / bleed-outs from Match.tally). */
export function soloRows(g, name = g?.app?.playerName || '你') {
  const m = g?.match;
  if (!m) return [];
  const s = m.stats;
  const rows = [{ id: g.localId, name, slot: 0, self: true, k: s.kills | 0, h: s.headshots | 0, a: s.assists | 0, d: s.damage || 0, b: s.bossDamage || 0,
    bw: bestWeapon(s.weaponKills), lv: m.level, c: m.money, m: s.money || 0, sp: s.spent || 0, up: s.upgrades | 0, dn: s.downs | 0, dd: s.died | 0 }];
  for (const bot of g.bots?.bots || []) {
    const t = m.tally?.get(bot.id) || {}, bs = bot.stats || {};
    rows.push({ id: bot.id, name: String(bot.name || '').replace(/^［AI］/, ''), slot: bot.slot | 0, ai: true,
      k: bs.kills | 0, h: bs.headshots | 0, a: t.a | 0, d: bs.damage || 0, b: bs.bossDamage || 0, bw: bestWeapon(t.wk),
      lv: null, c: null, m: null, sp: null, up: null, dn: bs.downs | 0, dd: t.dd | 0 });
  }
  return rows;
}

/** Every row with its live state, weapon in hand and ping, sorted by score (multiplayer: the replicated board). */
export function liveRows(g) {
  const net = g.net, room = net?.room, coop = room && g.app?.coop;
  const rows = coop ? coop.boardRows() : soloRows(g);
  const peers = room ? new Map(room.players().map((p) => [p.id, p])) : null;
  for (const r of rows) {
    if (r.self) {
      const st = g.status;
      r.st = !st ? 'up' : !st.alive ? 'dead' : st.downed ? 'down' : 'up';
      r.w = g.arsenal?.def?.id || null;
    } else if (r.ai) {
      const b = g.bots?.bots.find((o) => o.id === r.id);
      r.st = !b ? 'up' : !b.alive ? 'dead' : b.downed ? 'down' : 'up';
      r.w = b?.weapon?.id || null;
    } else {
      const p = net?.remotes.get(r.id);
      r.st = !p || !net._live?.(p) ? 'wait' : !p.alive ? 'dead' : p.downed ? 'down' : 'up';
      r.w = p?.weaponId || null;
    }
    // the host is the server: its row has no ping; everyone else's is its link to the host (ours too on a guest)
    if (room) {
      const p = r.self && !room.isHost ? room.peers.get(room.hostId) : peers.get(r.id);
      r.net = r.host ? 'host' : p && p.transport !== 'self' ? { rtt: p.rtt, relay: p.transport === 'relay' } : null;
    } else r.net = null;
  }
  return byScore(rows);
}

// ------------------------------------------------------------------------------------------------ view
// columns: [class, header, cell(row, ctx)]; 'mp' ones only with a room
const dash = '<i class="sb-none">—</i>';
const z = (v, s = v) => (v ? s : `<i class="sb-z">${s}</i>`);
const COLS = [
  ['sb-rk', '', (r, c) => (r.id === c.mvp ? `<i class="sb-mvp" title="MVP">${ICON.star}</i>` : `<i class="sb-n">${c.rank}</i>`)],
  ['sb-p', '玩家', (r) => `${avatar(r)}<b>${esc(r.name)}</b>${r.self ? '<em class="you">你</em>' : ''}${r.host ? '<em class="host">房主</em>' : r.ai ? '<em>AI</em>' : ''}`
    + (r.st === 'down' ? '<em class="sb-down">倒地</em>' : r.st === 'dead' ? '<em class="sb-dead">陣亡</em>' : r.st === 'wait' ? '<em class="sb-wait">載入中</em>' : '')],
  ['sb-lv', '等級', (r) => (r.lv ? `<small>Lv</small>${r.lv}` : dash)],
  ['sb-sc', '分數', (r) => z(scoreOf(r), num(scoreOf(r)))],
  ['sb-k', '擊殺', (r) => z(r.k | 0, num(r.k))],
  ['sb-hs', '爆頭', (r) => (r.k ? `${hsPct(r)}<small>%</small>` : z(0, '0%'))],
  ['sb-a', '助攻', (r) => z(r.a | 0, num(r.a))],
  ['sb-dn', '倒地／陣亡', (r) => `${z(r.dn | 0, num(r.dn))}<small>/</small>${z(r.dd | 0, num(r.dd))}`],
  ['sb-d', '傷害', (r) => z(Math.round(r.d || 0), num(r.d))],
  ['sb-b', '首領傷害', (r) => z(Math.round(r.b || 0), num(r.b))],
  ['sb-m', '金錢', (r) => (r.c == null ? dash : cash(r.c))],
  ['sb-w', '武器', (r, c) => weaponCell(c.renderer, r.w, c.again)],
  ['sb-net', '延遲', (r) => (r.net === 'host' ? '<em class="host">主機</em>' : !r.net ? dash
    : `<b class="${r.net.rtt > 250 ? 'bad' : r.net.rtt > 120 ? 'mid' : ''}">${r.net.rtt ? Math.round(r.net.rtt) : '—'}</b><small>ms</small><em class="${r.net.relay ? 'relay' : 'p2p'}">${r.net.relay ? '中繼' : 'P2P'}</em>`), 'mp'],
];

export class Scoreboard {
  constructor(game, root) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'sb';
    document.body.classList.remove('sb-held');   // (a board held while the last match ended)
    this.el.innerHTML = '<div class="sb-top"></div><div class="sb-cols sb-g"></div><div class="sb-rows"></div><div class="sb-foot"></div>';
    root.appendChild(this.el);
    this.top = this.el.querySelector('.sb-top');
    this.colsEl = this.el.querySelector('.sb-cols');
    this.rowsEl = this.el.querySelector('.sb-rows');
    this.foot = this.el.querySelector('.sb-foot');
    this.rows = new Map();   // id -> { el, cells: [], html: [] }
    this.cache = {};
    this.open = false;
    this.t = 0;
    this.again = () => { this.t = 0; };   // a silhouette arrived: draw again next frame
  }

  /** Every HUD frame: `held` = the score action is down. Redraws 4x a second while open. */
  update(dt, held) {
    if (held !== this.open) {
      this.open = held;
      this.el.classList.toggle('on', held);
      // (the level-up trait chooser lives in #ui, above the whole HUD layer: it steps aside while the board is up)
      document.body.classList.toggle('sb-held', held);
      this.t = 0;
    }
    if (!held) { this._warm(dt); return; }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    this.render();
  }

  /** While closed, every 2 s: the silhouettes of the weapons in hand start rendering, so the board opens complete. */
  _warm(dt) {
    this.warmT = (this.warmT || 0) - dt;
    if (this.warmT > 0) return;
    this.warmT = 2;
    const g = this.game, r = g.renderer;
    iconUrl(r, g.arsenal?.def?.id);
    for (const b of g.bots?.bots || []) iconUrl(r, b.weapon?.id);
    for (const p of g.net?.remotes?.values?.() || []) iconUrl(r, p.weaponId);
  }

  _set(key, node, html) { if (this.cache[key] !== html) { this.cache[key] = html; node.innerHTML = html; } }

  render() {
    const g = this.game, m = g.match;
    if (!m) return;
    const mp = !!g.net?.room;
    const cols = COLS.filter((c) => c[3] !== 'mp' || mp);
    if (this.cache.mp !== mp) {
      this.cache.mp = mp;
      this.el.classList.toggle('mp', mp);
      this.colsEl.innerHTML = cols.map(([cls, h]) => `<span class="${cls}">${h}</span>`).join('');
      for (const r of this.rows.values()) r.el.remove();
      this.rows.clear();
    }
    const rows = liveRows(g);
    this._header(g, m, rows, mp);
    // rows: one element per player, cells written only when they change; a new order slides into place (FLIP)
    const ctx = { mvp: pickMvp(rows), renderer: g.renderer, again: this.again, rank: 0 };
    const before = new Map();
    for (const [id, r] of this.rows) before.set(id, r.el.offsetTop);
    const seen = new Set();
    rows.forEach((r, i) => {
      ctx.rank = i + 1;
      let v = this.rows.get(r.id);
      if (!v) {
        v = { el: document.createElement('div'), cells: [], html: [] };
        v.el.className = 'sb-r sb-g';
        for (const [cls] of cols) { const c = document.createElement('span'); c.className = cls; v.el.appendChild(c); v.cells.push(c); }
        this.rows.set(r.id, v);
      }
      seen.add(r.id);
      const cls = `sb-r sb-g${r.self ? ' self' : ''}${r.id === ctx.mvp ? ' mvp' : ''}${r.st && r.st !== 'up' ? ' sb-' + r.st : ''}`;
      if (v.el.className !== cls) v.el.className = cls;
      cols.forEach(([, , cell], k) => { const h = cell(r, ctx); if (v.html[k] !== h) { v.html[k] = h; v.cells[k].innerHTML = h; } });
      if (this.rowsEl.children[i] !== v.el) this.rowsEl.insertBefore(v.el, this.rowsEl.children[i] || null);
    });
    for (const [id, v] of this.rows) if (!seen.has(id)) { v.el.remove(); this.rows.delete(id); }
    for (const [id, top] of before) {
      const v = this.rows.get(id);
      const dy = v ? top - v.el.offsetTop : 0;
      if (!dy) continue;
      v.el.style.transition = 'none';
      v.el.style.transform = `translateY(${dy}px)`;
      void v.el.offsetWidth;
      v.el.style.transition = '';
      v.el.style.transform = '';
    }
    this._footer(rows);
  }

  _header(g, m, rows, mp) {
    const info = mapInfo(g.mapId);
    const d = DIFF_INFO[m.diffId] || DIFF_INFO.normal;
    const n = ROUNDS.length, round = Math.max(1, Math.min(n, m.round || 1));
    const humans = rows.filter((r) => !r.ai).length, bots = rows.length - humans;
    const mode = mp ? `多人合作 ${humans} 人` : bots ? `單人＋AI 隊友 ${bots}` : '單人';
    // the round's phase: buy-time countdown, infected left, or the boss's health (host: its zombie; guests: the mirror)
    const bossF = m.state !== 'round' ? null : m.boss ? m.boss.hp / m.boss.maxHp : m.bossFrac >= 0 ? m.bossFrac : null;
    const [phase, phaseV] = m.state === 'warmup' || m.state === 'buy' ? ['購買時間', clock(Math.max(0, Math.ceil(m.timer)))]
      : bossF != null ? ['首領血量', `${Math.round(Math.max(0, bossF) * 100)}<small>%</small>`]
      : m.state === 'round' ? ['剩餘感染者', num(m.isMirror ? m.left ?? 0 : m.queue.length + (g.zombies?.alive || 0))]
      : [m.state === 'victory' ? '任務完成' : '任務失敗', '—'];
    const stat = (k, v, cls = '') => `<div class="${cls}"><span>${k}</span><b>${v}</b></div>`;
    this._set('top', this.top, `<div class="sb-map"><small>${esc(mapKicker(info))}<i></i>${esc(info.en || '')}</small><b>${esc(info.zh)}</b><em>${mode}</em></div>`
      + `<div class="sb-meta">${stat('難度', `<span style="color:${d.color}">${d.zh}</span>`)}${stat('回合', `${round}<small>／${n}</small>`)}`
      + `${stat(phase, phaseV, bossF != null ? 'boss' : '')}${stat('時間', clock(m.elapsed))}${stat('重試', m.retries ?? 0, (m.retries | 0) === 0 ? 'last' : '')}</div>`);
  }

  _footer(rows) {
    const t = rows.reduce((a, r) => { a.k += r.k | 0; a.h += r.h | 0; a.d += r.d || 0; a.b += r.b || 0; return a; }, { k: 0, h: 0, d: 0, b: 0 });
    this._set('foot', this.foot, `<div class="sb-tot"><span>小隊合計</span>擊殺 <b>${num(t.k)}</b><i></i>爆頭率 <b>${t.k ? Math.round((t.h / t.k) * 100) : 0}%</b><i></i>`
      + `傷害 <b>${num(t.d)}</b><i></i>首領傷害 <b>${num(t.b)}</b></div><div class="sb-rule">${SCORE_RULE}</div>`);
  }
}
