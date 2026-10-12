// Multiplayer screens: the room browser (live public list via watchRooms, create room, join by a
// 5-digit code on a touch keypad) and the room lobby (big copyable code, player slots with ping and
// transport, host controls, waiting state for guests).
import { Screen, header, esc, el, ICON, copyText } from './kit.js';
import { DIFF_INFO, DIFF_IDS, mapCard } from './menu.js';
import { mapInfo } from '../world/maps/index.js';
import { watchRooms, hostRoom, joinRoom } from '../net/session.js';

const STATE_ZH = { lobby: '大廳中', playing: '遊戲中' };

// ---------------------------------------------------------------- flows (used by screens and dev hooks)

/** Creates a room (progress dialog, Chinese errors) and opens its lobby. */
export async function createRoomFlow(app, { roomName, isPublic = true, difficulty = 'normal' }) {
  const prog = app.dialogs.progress('建立房間', '連線中…');
  let cancelled = false;
  prog.done.then((v) => { if (v === 'cancel') cancelled = true; });
  try {
    const room = await hostRoom({
      name: app.playerName, version: app.version, roomName, public: isPublic,
      meta: { map: app.mapId, difficulty, state: 'lobby' },
      onStatus: (t) => prog.setText(t),
    });
    if (cancelled) { room.close(); return null; }
    prog.close();
    app.setRoom(room);
    app.show('lobby');
    return room;
  } catch (e) {
    prog.close();
    if (!cancelled) app.dialogs.alert('無法建立房間', e?.message || '連線失敗，請稍後再試。');
    return null;
  }
}

/** Joins a room by code and opens its lobby. */
export async function joinRoomFlow(app, code) {
  const prog = app.dialogs.progress(`加入房間 ${code}`, '連線中…');
  let cancelled = false;
  prog.done.then((v) => { if (v === 'cancel') cancelled = true; });
  try {
    const room = await joinRoom(code, { name: app.playerName, version: app.version, onStatus: (t) => prog.setText(t) });
    if (cancelled) { room.close(); return null; }
    prog.close();
    app.setRoom(room);
    if (room.meta?.map) app.mapId = room.meta.map;
    app.show('lobby');
    return room;
  } catch (e) {
    prog.close();
    if (!cancelled) app.dialogs.alert('無法加入房間', e?.message || '連線失敗，請稍後再試。');
    return null;
  }
}

// ---------------------------------------------------------------- room browser

export class MultiplayerScreen extends Screen {
  constructor(app) {
    super(app, 'mp fe-shade2', `${header('多人連線', 'MULTIPLAYER', {
      right: `<label class="mp-name"><span>玩家名稱</span><input type="text" maxlength="14" autocomplete="off" spellcheck="false" enterkeyhint="done"></label>` })}
      <div class="fe-body mp-body">
        <section class="fe-panel mp-list">
          <div class="fe-ph"><span>公開房間</span><small class="mp-count"></small></div>
          <div class="rm-head"><span>房間</span><span>人數</span><span>難度</span><span>狀態</span></div>
          <div class="rm-rows fe-scroll"></div>
        </section>
        <section class="mp-side">
          <button class="fe-btn pri big" data-act="create">${ICON.plus}<span>建立房間</span></button>
          <button class="fe-btn big" data-act="code">${ICON.hash}<span>輸入房號加入</span></button>
          <p class="mp-help">與朋友連線：一人建立房間，其他人輸入 5 位數房號加入。最多 4 人合作。</p>
        </section>
      </div>`);
    this.nameIn = this.$('.mp-name input');
    const save = () => { app.playerName = this.nameIn.value; this.nameIn.value = app.playerName; };
    this.nameIn.addEventListener('change', save);
    this.nameIn.addEventListener('blur', save);
    this.nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.nameIn.blur(); });
  }

  enter() {
    this.nameIn.value = this.app.playerName;
    this.rooms = [];
    this.ready = false;
    this.render();
    this.watch = watchRooms({ version: this.app.version, onChange: (r) => { this.rooms = r; this.render(); } });
    this.watch.ready.then(() => { this.ready = true; this.render(); });
    this.app.ensureBackdrop(this.app.mapId);
  }

  leave() { this.watch?.stop(); this.watch = null; }

  render() {
    const rows = this.$('.rm-rows');
    const rooms = this.rooms || [];
    this.$('.mp-count').textContent = rooms.length ? `${rooms.length} 間` : this.ready ? '' : '搜尋中…';
    if (!rooms.length) {
      rows.innerHTML = `<div class="rm-empty">${this.ready ? '目前沒有公開房間　·　建立一個房間邀請朋友吧' : '<i class="fe-spin"></i>正在搜尋房間…'}</div>`;
      return;
    }
    rows.innerHTML = rooms.map((r) => {
      const d = DIFF_INFO[r.difficulty] || DIFF_INFO.normal;
      return `<button class="rm-row${r.joinable ? '' : ' no'}" data-act="joinrow" data-code="${esc(r.code)}" ${r.joinable ? '' : 'aria-disabled="true"'}>
        <span class="rm-n"><b>${esc(r.name || '房間')}</b><small>房主 ${esc(r.host || '')}　·　${esc(mapInfo(r.map).zh)}</small></span>
        <span class="rm-p">${r.players}<small>/${r.maxPlayers}</small></span>
        <span class="rm-d" style="color:${d.color}">${d.zh}</span>
        <span class="rm-s">${r.joinable ? `<em>加入</em>` : `<small>${esc(r.reason || STATE_ZH[r.state] || '')}</small>`}</span></button>`;
    }).join('');
  }

  onAct(act, t) {
    const app = this.app;
    if (act === 'joinrow') {
      const r = this.rooms.find((x) => x.code === t.dataset.code);
      if (!r) return;
      if (!r.joinable) { app.toast(r.reason || '無法加入'); return; }
      joinRoomFlow(app, r.code);
    } else if (act === 'code') this.keypad();
    else if (act === 'create') this.createDialog();
  }

  createDialog() {
    const app = this.app;
    let isPublic = true, diff = app.lastDiff;
    const body = el(`<div class="cr-form">
      <label class="fe-field"><span>房間名稱</span><input type="text" maxlength="24" placeholder="${esc(app.playerName)}的房間" autocomplete="off" spellcheck="false"></label>
      <div class="fe-field"><span>房間類型</span><div class="fe-seg cr-pub"><button data-v="1" class="on">${ICON.globe}公開</button><button data-v="0">${ICON.lock}私人（只能用房號加入）</button></div></div>
      <div class="fe-field"><span>難度</span><div class="fe-seg cr-diff">${DIFF_IDS.map((id) => `<button data-v="${id}" class="${id === diff ? 'on' : ''}" style="--c:${DIFF_INFO[id].color}">${DIFF_INFO[id].zh}</button>`).join('')}</div></div>
    </div>`);
    body.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      for (const x of b.parentElement.children) x.classList.toggle('on', x === b);
      if (b.parentElement.classList.contains('cr-pub')) isPublic = b.dataset.v === '1'; else { diff = b.dataset.v; app.lastDiff = diff; }
    });
    const d = app.dialogs.show({ title: '建立房間', body, cls: 'wide', buttons: [{ label: '取消', value: false }, { label: '建立', cls: 'pri', value: true }] });
    d.done.then((ok) => {
      if (!ok) return;
      createRoomFlow(app, { roomName: body.querySelector('input').value.trim(), isPublic, difficulty: diff });
    });
  }

  keypad() {
    const app = this.app;
    let code = '';
    const body = el(`<div class="kp">
      <div class="kp-l"><div class="kp-digits">${'<i></i>'.repeat(5)}</div><p class="kp-msg">輸入房主提供的 5 位數房號</p>
        <button class="fe-btn pri big kp-go" disabled>加入房間</button></div>
      <div class="kp-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
        <button data-k="clr" class="fn">清除</button><button data-k="0">0</button><button data-k="del" class="fn" aria-label="刪除">${ICON.del}</button></div>
    </div>`);
    const digits = [...body.querySelectorAll('.kp-digits i')];
    const go = body.querySelector('.kp-go');
    const upd = () => {
      digits.forEach((d, i) => { d.textContent = code[i] || ''; d.classList.toggle('cur', i === code.length); });
      go.disabled = code.length !== 5;
    };
    const key = (k) => {
      if (k === 'del') code = code.slice(0, -1);
      else if (k === 'clr') code = '';
      else if (/^\d$/.test(k) && code.length < 5) code += k;
      app.audio.play('ui_click');
      upd();
    };
    body.querySelector('.kp-pad').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) key(b.dataset.k); });
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) key(e.key);
      else if (e.key === 'Backspace') key('del');
      else if (e.key === 'Enter' && code.length === 5) d.close(code);
    };
    window.addEventListener('keydown', onKey);
    go.addEventListener('click', () => d.close(code));
    const d = app.dialogs.show({ title: '輸入房號', body, cls: 'kp-dlg', buttons: [{ label: '取消', value: null }], onClose: () => window.removeEventListener('keydown', onKey) });
    upd();
    d.done.then((c) => { if (c && /^\d{5}$/.test(c)) joinRoomFlow(app, c); });
  }
}

// ---------------------------------------------------------------- lobby

export class LobbyScreen extends Screen {
  constructor(app) {
    super(app, 'lobby fe-shade2', `${header('房間大廳', 'LOBBY', { back: '離開房間', right: '<span class="lb-status"></span>' })}
      <div class="lb-top">
        <div class="lb-code"><span>房號</span><b></b><button class="fe-btn sm" data-act="copy">${ICON.copy}<span>複製</span></button></div>
        <div class="lb-info"></div>
      </div>
      <div class="lb-slots"></div>
      <div class="lb-foot">
        <div class="lb-diff"></div>
        <div class="lb-act"></div>
      </div>`);
    this.onRoom = () => this.render();
  }

  enter() {
    const room = this.app.room;
    if (!room) { this.app.show('mp'); return; }
    this.room = room;
    for (const ev of ['peer-join', 'peer-leave', 'peer-update', 'meta', 'status']) room.on(ev, this.onRoom);
    this.timer = setInterval(this.onRoom, 1000);
    this.render();
    this.app.ensureBackdrop(room.meta?.map || this.app.mapId);
  }

  leave() {
    clearInterval(this.timer);
    if (this.room) for (const ev of ['peer-join', 'peer-leave', 'peer-update', 'meta', 'status']) this.room.off(ev, this.onRoom);
    this.room = null;
  }

  back() {
    this.app.dialogs.confirm('離開房間', this.app.room?.isHost ? '你是房主，離開後房間會關閉，其他玩家也會被送回選單。' : '確定要離開這個房間嗎？', { ok: '離開', danger: true })
      .then((ok) => { if (ok) { this.app.leaveRoom(); this.app.show('mp'); } });
    return true;
  }

  onAct(act, t) {
    const app = this.app, room = this.room;
    if (!room) return;
    if (act === 'copy') copyText(room.code).then((ok) => app.toast(ok ? `已複製房號 ${room.code}` : `房號 ${room.code}`));
    else if (act === 'diff' && room.isHost) { room.setMeta({ difficulty: t.dataset.v }); app.lastDiff = t.dataset.v; this.render(); }
    else if (act === 'start' && room.isHost) app.coop.hostStart();
    else if (act === 'kick' && room.isHost) {
      const p = room.peers.get(t.dataset.id);
      if (!p) return;
      app.dialogs.confirm('移出玩家', `要將「${p.name}」移出房間嗎？`, { ok: '移出', danger: true }).then((ok) => { if (ok) room.kick(p.id); });
    }
  }

  render() {
    const room = this.room;
    if (!room || room.closed) return;
    const meta = room.meta || {};
    const info = mapInfo(meta.map);
    const diff = DIFF_INFO[meta.difficulty] || DIFF_INFO.normal;
    this.$('.lb-code b').textContent = room.code;
    this.$('.lb-status').textContent = room.statusText || '';
    this.$('.lb-info').innerHTML = mapCard(info, { small: true }) + `<div class="lb-tags"><span>${room.isPublic === false ? ICON.lock + '私人房間' : ICON.globe + '公開房間'}</span><span>${esc(room.roomName || '')}</span></div>`;
    const players = room.players();
    const max = room.maxPlayers || 4;
    let html = '';
    for (let i = 0; i < max; i++) {
      const p = players.find((x) => x.slot === i);
      if (!p) { html += `<div class="slot empty"><span class="sl-n">${i + 1}</span><span class="sl-wait">等待玩家加入…</span></div>`; continue; }
      const isHostP = p.slot === 0;
      const tr = p.self ? '' : p.transport === 'p2p' ? '<em class="p2p">P2P 直連</em>' : p.transport === 'relay' ? '<em class="relay">伺服器中繼</em>' : '<em>連線中</em>';
      const ping = p.self ? '' : `<span class="sl-ping ${p.rtt > 250 ? 'bad' : p.rtt > 120 ? 'mid' : ''}">${p.rtt ? Math.round(p.rtt) + ' ms' : '— ms'}</span>`;
      html += `<div class="slot${p.self ? ' self' : ''}"><span class="sl-n">${i + 1}</span>
        <span class="sl-av">${isHostP ? ICON.crown : ICON.user}</span>
        <b class="sl-name">${esc(p.name)}</b>
        <span class="sl-tags">${isHostP ? '<em class="host">房主</em>' : ''}${p.self ? '<em class="you">你</em>' : ''}</span>
        <span class="sl-net">${ping}${tr}</span>
        ${room.isHost && !p.self ? `<button class="sl-kick" data-act="kick" data-id="${esc(p.id)}" aria-label="移出">${ICON.x}</button>` : ''}</div>`;
    }
    this.$('.lb-slots').innerHTML = html;
    this.$('.lb-diff').innerHTML = room.isHost
      ? `<span class="lb-k">難度</span><div class="fe-seg">${DIFF_IDS.map((id) => `<button data-act="diff" data-v="${id}" class="${id === (meta.difficulty || 'normal') ? 'on' : ''}" style="--c:${DIFF_INFO[id].color}">${DIFF_INFO[id].zh}</button>`).join('')}</div>`
      : `<span class="lb-k">難度</span><b style="color:${diff.color}">${diff.zh}</b><small>${esc(diff.desc)}</small>`;
    const act = this.$('.lb-act');
    if (room.isHost) {
      const key = 'host' + players.length;
      if (act.dataset.k !== key) {
        act.dataset.k = key;
        act.innerHTML = `<span class="lb-count">${players.length} / ${max} 人</span><button class="fe-btn pri big" data-act="start">${ICON.play}<span>開始遊戲</span></button>`;
      }
    } else if (act.dataset.k !== 'guest') {
      act.dataset.k = 'guest';
      act.innerHTML = '<span class="lb-wait"><i class="fe-spin"></i>等待房主開始遊戲…</span>';
    }
  }
}
