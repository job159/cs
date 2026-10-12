// Multiplayer screens: the room browser (live public list via watchRooms, create room, join by a
// 5-digit code on a touch keypad) and the room lobby (big copyable / shareable code, player slots with
// ping and transport, host controls, waiting state for guests).
import { Screen, header, esc, el, ICON, copyText, setHTML } from './kit.js';
import { DIFF_INFO, DIFF_IDS, mapCard, diffLine, pickMap } from './menu.js';
import { mapInfo, hasMap } from '../world/maps/index.js';
import { watchRooms, hostRoom, joinRoom, BROKERS } from '../net/session.js';

const STATE_ZH = { lobby: '大廳中', playing: '遊戲中' };
const ICON_SHARE = '<svg viewBox="0 0 24 24"><circle cx="18" cy="5.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="6" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="18" cy="18.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4" stroke="currentColor" stroke-width="1.9"/></svg>';
const ICON_PASTE = '<svg viewBox="0 0 24 24"><rect x="5" y="4.5" width="14" height="16.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M9 3h6v3.5H9z" fill="currentColor"/></svg>';
const ICON_WARN = '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2z" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 10v5M12 17.2v1.6" stroke="currentColor" stroke-width="2"/></svg>';
const CODE_FIRST_MAX = BROKERS.length; // a room code's first digit names its broker: 1..BROKERS.length

/** Inline check of a (partial) room code; '' when fine so far. */
function codeProblem(code) {
  if (!code) return '';
  const d = +code[0];
  if (d < 1 || d > CODE_FIRST_MAX) return `房號開頭應為 1–${CODE_FIRST_MAX}，請再確認`;
  return '';
}

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

/**
 * Joins a room by code and opens its lobby. onRetry (keypad joins): the failure dialog offers
 * 重新輸入, which calls onRetry(code) so the keypad reopens with the code still typed in.
 */
export async function joinRoomFlow(app, code, { onRetry } = {}) {
  const prog = app.dialogs.progress(`加入房間 ${code}`, '連線中…');
  let cancelled = false;
  prog.done.then((v) => { if (v === 'cancel') cancelled = true; });
  // a slow broker can take many seconds to answer: say so instead of looking frozen
  let status = '連線中…';
  const slow = setTimeout(() => { if (status === '連線中…') prog.setText('伺服器回應較慢，仍在連線中…'); }, 5000);
  try {
    const room = await joinRoom(code, { name: app.playerName, version: app.version, onStatus: (t) => { status = t; prog.setText(t); } }).finally(() => clearTimeout(slow));
    if (cancelled) { room.close(); return null; }
    prog.close();
    app.setRoom(room);
    if (room.meta?.map && hasMap(room.meta.map)) app.mapId = room.meta.map;
    app.show('lobby');
    return room;
  } catch (e) {
    prog.close();
    if (cancelled) return null;
    const text = e?.message || '連線失敗，請稍後再試。';
    if (!onRetry) { app.dialogs.alert('無法加入房間', text); return null; }
    const again = await app.dialogs.show({ title: '無法加入房間', body: `<p>${esc(text)}</p>`, dismiss: false, backCancels: true,
      buttons: [{ label: '關閉', value: false }, { label: '重新輸入', cls: 'pri', value: true }] }).done;
    if (again === true) onRetry(code);
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
          <p class="mp-help">與朋友連線：一人建立房間，其他人輸入 <span class="nw">5 位數</span>房號加入。最多 4 人合作。</p>
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
    this.scan();
    this.app.ensureBackdrop(this.app.mapId);
  }

  /** (Re)starts the live room list. */
  scan() {
    this.watch?.stop();
    this.rooms = [];
    this.ready = false;
    this.offline = false;
    this.render();
    const w = this.watch = watchRooms({ version: this.app.version, onChange: (r) => { if (this.watch !== w) return; this.rooms = r; this.offline = false; this.render(); } });
    w.ready.then((answered) => {
      if (this.watch !== w) return;
      this.ready = true;
      this.offline = !answered;
      this.render();
    });
  }

  leave() { this.watch?.stop(); this.watch = null; }

  render() {
    const rows = this.$('.rm-rows');
    const rooms = this.rooms || [];
    this.$('.mp-count').textContent = this.ready && !this.offline ? `${rooms.length} 間` : '';
    if (!rooms.length) {
      setHTML(rows, this.offline
        ? `<div class="rm-empty err"><span>${ICON_WARN}無法連線到配對伺服器</span><small>請檢查網路後重試；若已知道房號，仍可直接輸入房號加入。</small><button class="fe-btn sm" data-act="rescan">重試</button></div>`
        : `<div class="rm-empty">${this.ready ? '目前沒有公開房間　·　建立一個房間邀請朋友吧' : '<span><i class="fe-spin"></i>正在搜尋房間…</span>'}</div>`);
      return;
    }
    setHTML(rows, rooms.map((r) => {
      const d = DIFF_INFO[r.difficulty] || DIFF_INFO.normal;
      return `<button class="rm-row${r.joinable ? '' : ' no'}" data-act="joinrow" data-code="${esc(r.code)}" ${r.joinable ? '' : 'aria-disabled="true"'}>
        <span class="rm-n"><b>${esc(r.name || '房間')}</b><small>房主 ${esc(r.host || '')}　·　${esc(mapInfo(r.map).zh)}</small></span>
        <span class="rm-p">${r.players}<small>/${r.maxPlayers}</small></span>
        <span class="rm-d" style="color:${d.color}">${d.zh}</span>
        <span class="rm-s">${r.joinable ? `<em>加入</em>` : `<small>${esc(r.reason || STATE_ZH[r.state] || '')}</small>`}</span></button>`;
    }).join(''));
  }

  onAct(act, t) {
    const app = this.app;
    if (act === 'joinrow') {
      const r = this.rooms.find((x) => x.code === t.dataset.code);
      if (!r) return;
      if (!r.joinable) {
        app.toast(r.compatible === false ? `版本不同：房主 ${r.version || '?'}，你 ${app.version}` : r.reason || '無法加入', 2600);
        return;
      }
      joinRoomFlow(app, r.code);
    } else if (act === 'code') this.keypad();
    else if (act === 'create') this.createDialog();
    else if (act === 'rescan') this.scan();
  }

  createDialog() {
    const app = this.app;
    let isPublic = true, diff = app.lastDiff;
    const body = el(`<div class="cr-form">
      <label class="fe-field"><span>房間名稱</span><input type="text" maxlength="24" placeholder="${esc(app.playerName)}的房間" autocomplete="off" spellcheck="false"></label>
      <div class="fe-field"><span>房間類型</span><div class="fe-seg cr-pub"><button data-v="1" class="on">${ICON.globe}公開</button><button data-v="0">${ICON.lock}私人</button></div><small class="cr-hint cr-pub-h"></small></div>
      <div class="fe-field"><span>難度</span><div class="fe-seg cr-diff">${DIFF_IDS.map((id) => `<button data-v="${id}" class="${id === diff ? 'on' : ''}" style="--c:${DIFF_INFO[id].color}">${DIFF_INFO[id].zh}</button>`).join('')}</div><small class="cr-hint cr-diff-h"></small></div>
    </div>`);
    const hints = () => {
      body.querySelector('.cr-pub-h').textContent = isPublic ? '會出現在公開房間列表，任何人都能加入。' : '不會出現在列表，只能用房號加入。';
      const d = DIFF_INFO[diff] || DIFF_INFO.normal;
      body.querySelector('.cr-diff-h').innerHTML = `<b style="color:${d.color}">${d.zh}</b>　${esc(d.desc)}<br><span class="num">${diffLine(diff)}</span>`;
    };
    body.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      for (const x of b.parentElement.children) x.classList.toggle('on', x === b);
      if (b.parentElement.classList.contains('cr-pub')) isPublic = b.dataset.v === '1'; else { diff = b.dataset.v; app.lastDiff = diff; }
      hints();
    });
    hints();
    const d = app.dialogs.show({ title: '建立房間', body, cls: 'wide', dismiss: false, backCancels: true,
      buttons: [{ label: '取消', value: false }, { label: '建立', cls: 'pri', value: true }] });
    body.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') d.close(true); });
    d.done.then((ok) => {
      if (ok !== true) return;
      createRoomFlow(app, { roomName: body.querySelector('input').value.trim(), isPublic, difficulty: diff });
    });
  }

  /** 5-digit code keypad (touch first; digits, Backspace, Enter and paste work on desktop too). */
  keypad(prefill = '') {
    const app = this.app;
    let code = String(prefill).replace(/\D/g, '').slice(0, 5);
    const body = el(`<div class="kp">
      <div class="kp-l"><div class="kp-digits">${'<i></i>'.repeat(5)}</div><p class="kp-msg"></p>
        <div class="kp-btns"><button class="fe-btn big kp-no">取消</button><button class="fe-btn pri big kp-go" disabled>加入房間</button></div></div>
      <div class="kp-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
        <button data-k="paste" class="fn" aria-label="貼上">${ICON_PASTE}<span>貼上</span></button><button data-k="0">0</button><button data-k="del" class="fn" aria-label="刪除">${ICON.del}</button></div>
    </div>`);
    const digits = [...body.querySelectorAll('.kp-digits i')];
    const go = body.querySelector('.kp-go');
    const msg = body.querySelector('.kp-msg');
    const upd = () => {
      digits.forEach((d, i) => { d.textContent = code[i] || ''; d.classList.toggle('cur', i === code.length); });
      const bad = codeProblem(code);
      msg.textContent = bad || (code.length === 5 ? '按「加入房間」連線' : '輸入房主提供的 5 位數房號');
      msg.classList.toggle('bad', !!bad);
      body.querySelector('.kp-digits').classList.toggle('bad', !!bad);
      go.disabled = code.length !== 5 || !!bad;
    };
    const setCode = (text) => {
      const m = String(text || '').match(/\d{5}/) || [String(text || '').replace(/\D/g, '')];
      const c = m[0].slice(0, 5);
      if (!c) { app.toast('剪貼簿裡沒有房號'); return; }
      code = c;
      upd();
    };
    const key = (k) => {
      if (k === 'del') code = code.slice(0, -1);
      else if (k === 'clr') code = '';
      else if (k === 'paste') {
        // clipboard read needs a permission on some WebViews: fall back silently to a hint
        Promise.resolve().then(() => navigator.clipboard?.readText?.()).then((t) => setCode(t), () => app.toast('無法讀取剪貼簿，請手動輸入'));
        return;
      } else if (/^\d$/.test(k) && code.length < 5) code += k;
      app.audio.play('ui_click');
      upd();
    };
    body.querySelector('.kp-pad').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) key(b.dataset.k); });
    // long-press ⌫ clears the whole code
    const del = body.querySelector('[data-k=del]');
    let hold = 0;
    del.addEventListener('pointerdown', () => { clearTimeout(hold); hold = setTimeout(() => { code = ''; upd(); }, 550); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) del.addEventListener(ev, () => clearTimeout(hold));
    const join = () => { if (!go.disabled) d.close(code); };
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^\d$/.test(e.key)) key(e.key);
      else if (e.key === 'Backspace') key('del');
      else if (e.key === 'Enter') join();
    };
    const onPaste = (e) => { const t = e.clipboardData?.getData('text'); if (t) { e.preventDefault(); setCode(t); } };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    go.addEventListener('click', join);
    body.querySelector('.kp-no').addEventListener('click', () => d.close(null));
    const d = app.dialogs.show({ title: '輸入房號', body, cls: 'kp-dlg', dismiss: false, backCancels: true,
      onClose: () => { window.removeEventListener('keydown', onKey); window.removeEventListener('paste', onPaste); } });
    upd();
    d.done.then((c) => { if (c && /^\d{5}$/.test(c)) joinRoomFlow(app, c, { onRetry: (again) => this.keypad(again) }); });
  }
}

// ---------------------------------------------------------------- lobby

export class LobbyScreen extends Screen {
  constructor(app) {
    super(app, 'lobby fe-shade2', `${header('房間大廳', 'LOBBY', { back: '離開房間', right: '<span class="lb-status"></span>' })}
      <div class="lb-top">
        <div class="lb-code"><span class="lb-ck"><span>房號</span><em class="lb-pub"></em></span><b></b>
          <span class="lb-cbtn"><button class="fe-btn sm" data-act="copy">${ICON.copy}<span>複製</span></button>${navigator.share ? `<button class="fe-btn sm" data-act="share">${ICON_SHARE}<span>分享</span></button>` : ''}</span></div>
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
    this.seen = null;
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
    else if (act === 'share') {
      navigator.share?.({ title: '災厄前線', text: `一起來打災厄前線！房號 ${room.code}` }).catch(() => {});
    } else if (act === 'diff' && room.isHost) { room.setMeta({ difficulty: t.dataset.v }); app.lastDiff = t.dataset.v; this.render(); }
    else if (act === 'start' && room.isHost) app.coop.hostStart();
    else if (act === 'map' && room.isHost) {
      pickMap(app, room.meta?.map || app.mapId).then((id) => {
        if (!id || this.room !== room || room.closed) return;
        room.setMeta({ map: id });
        app.mapId = id;
        this.render();
        app.ensureBackdrop(id);
      });
    } else if (act === 'kick' && room.isHost) {
      const p = room.peers.get(t.dataset.id);
      if (!p) return;
      app.dialogs.confirm('移出玩家', `要將「${p.name}」移出房間嗎？`, { ok: '移出', danger: true }).then((ok) => { if (ok) room.kick(p.id); });
    }
  }

  /** Guests: follow the host's map / difficulty changes (backdrop + a toast). */
  _follow(meta) {
    const now = { map: meta.map || '', difficulty: meta.difficulty || 'normal' };
    const prev = this.seen;
    this.seen = now;
    if (!prev || this.room.isHost) return;
    if (now.map !== prev.map) {
      this.app.ensureBackdrop(now.map);
      this.app.toast(`房主將地圖改為 ${mapInfo(now.map).zh}`, 2400);
    } else if (now.difficulty !== prev.difficulty) {
      this.app.toast(`房主將難度改為 ${(DIFF_INFO[now.difficulty] || DIFF_INFO.normal).zh}`, 2400);
    }
  }

  render() {
    const room = this.room;
    if (!room || room.closed) return;
    const meta = room.meta || {};
    this._follow(meta);
    const info = mapInfo(meta.map);
    const diffId = DIFF_INFO[meta.difficulty] ? meta.difficulty : 'normal';
    const diff = DIFF_INFO[diffId];
    this.$('.fe-title b').textContent = room.roomName || '房間大廳';
    this.$('.lb-code b').textContent = room.code;
    setHTML(this.$('.lb-pub'), room.isHost ? (room.isPublic === false ? ICON.lock + '私人' : ICON.globe + '公開') : '');
    this.$('.lb-status').textContent = room.statusText || '';
    setHTML(this.$('.lb-info'), mapCard(info, { small: true, act: room.isHost ? 'map' : '' }));
    const players = room.players();
    const max = room.maxPlayers || 4;
    let html = '';
    let connecting = 0;
    for (let i = 0; i < max; i++) {
      const p = players.find((x) => x.slot === i);
      if (!p) { html += `<div class="slot empty"><span class="sl-n">${i + 1}</span><span class="sl-wait">等待玩家加入…</span></div>`; continue; }
      const isHostP = p.slot === 0;
      const settled = p.self || p.transport === 'p2p' || p.transport === 'relay';
      if (!settled) connecting++;
      const tr = p.self ? '' : p.transport === 'p2p' ? '<em class="p2p">P2P 直連</em>' : p.transport === 'relay' ? '<em class="relay">伺服器中繼</em>' : '<em class="wait">連線中</em>';
      const ping = p.self ? '' : p.rtt ? `<span class="sl-ping ${p.rtt > 250 ? 'bad' : p.rtt > 120 ? 'mid' : ''}">${Math.round(p.rtt)} ms</span>` : '<span class="sl-ping none">— ms</span>';
      html += `<div class="slot${p.self ? ' self' : ''}"><span class="sl-n">${i + 1}</span>
        <span class="sl-av${isHostP ? ' host' : ''}">${isHostP ? ICON.crown : ICON.user}</span>
        <b class="sl-name">${esc(p.name)}</b>
        <span class="sl-tags">${isHostP ? '<em class="host">房主</em>' : ''}${p.self ? '<em class="you">你</em>' : ''}</span>
        <span class="sl-net">${ping}${tr}</span>
        ${room.isHost && !p.self ? `<button class="sl-kick" data-act="kick" data-id="${esc(p.id)}" aria-label="移出">${ICON.x}</button>` : ''}</div>`;
    }
    setHTML(this.$('.lb-slots'), html);
    const desc = `<span class="lb-dd"><small>${esc(diff.desc)}</small><small class="num">${diffLine(diffId)}</small></span>`;
    setHTML(this.$('.lb-diff'), room.isHost
      ? `<span class="lb-k">難度</span><div class="fe-seg">${DIFF_IDS.map((id) => `<button data-act="diff" data-v="${id}" class="${id === diffId ? 'on' : ''}" style="--c:${DIFF_INFO[id].color}">${DIFF_INFO[id].zh}</button>`).join('')}</div>${desc}`
      : `<span class="lb-k">難度</span><b style="color:${diff.color}">${diff.zh}</b>${desc}`);
    const act = this.$('.lb-act');
    if (room.isHost) {
      // start waits until every player's connection settled (P2P or relay)
      const key = `host${players.length}|${connecting}`;
      if (act.dataset.k !== key) {
        act.dataset.k = key;
        act.innerHTML = `<span class="lb-count">${connecting ? '<i class="fe-spin"></i>玩家連線中…' : `${players.length} / ${max} 人`}</span>
          <button class="fe-btn pri big" data-act="start"${connecting ? ' disabled' : ''}>${ICON.play}<span>開始遊戲</span></button>`;
      }
    } else if (act.dataset.k !== 'guest') {
      act.dataset.k = 'guest';
      act.innerHTML = '<span class="lb-wait"><i class="fe-spin"></i>等待房主開始遊戲…</span>';
    }
  }
}
