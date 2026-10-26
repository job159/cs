// Multiplayer match flow on top of a Room (lobby -> match -> results -> lobby), next to NetSync's
// in-game replication. App-level messages (all reliable unless noted):
//   host -> all    'start'  { map, difficulty, seed, n }  sent BEFORE the host loads, so everyone loads the same map
//   guest -> host  'ready'  { n }                         map loaded and NetSync attached
//   host -> all    'go'     { n }                         everyone ready (or a timeout): start playing
//   guest -> host  'st'     { k, h, m }                   own match stats (every 2 s and at the end)
//   host -> all    'board'  [[id, name, slot, k, h, m]]   everybody's stats (results table / MVP)
//   host -> all    'lobby'  {}                            the host went back to the lobby
// While a guest loads, this listener is detached: the room buffers the host's snapshots / events
// (Room inbox) until NetSync attaches, so no zombie spawn is missed.
// Loading: every player reports its load progress (room.setLoading -> peers.get(id).loading). The host waits for
// the guests' ready up to its limit and past it for a guest whose progress still moves (READY_CAP_MS at most); a
// guest waits for 'go' the same way while the host is still loading.
const READY_CAP_MS = 120000;   // host: never wait longer than this for the guests' ready
const GO_CAP_MS = READY_CAP_MS + 15000;   // guest: the host may wait that long for a slower teammate, then says go
const LOAD_STALL_MS = 20000;   // a teammate whose progress did not move for this long is not "still loading"

export class Coop {
  constructor(app, room) {
    this.app = app;
    this.room = room;
    this.n = 0;               // match counter (host)
    this.loadingN = 0;        // guest: match being loaded
    this.ready = new Set();
    this.goN = 0;
    this.stats = new Map();   // host: guest id -> { k, h, m }
    this.board = [];          // guest: last board from the host
    this.tick = 0;
    this.onMsg = (m) => this._msg(m);
    this.onClosed = (reason, detail) => app.onRoomClosed(reason, detail);
    this.onLeave = (p) => { this.ready.delete(p.id); this._wake?.(); };
    this.loadSeen = new Map();   // peer id -> [progress, performance.now() of its last change]
    this.onUpdate = (p) => {
      const was = this.loadSeen.get(p.id);
      if (p.loading != null && p.loading !== was?.[0]) this.loadSeen.set(p.id, [p.loading, performance.now()]);
      this._wake?.();
    };
    room.on('message', this.onMsg);
    room.on('closed', this.onClosed);
    room.on('peer-leave', this.onLeave);
    room.on('peer-update', this.onUpdate);
    this.attached = true;
  }

  dispose() {
    this.detach();
    this.room.off('closed', this.onClosed);
    this.room.off('peer-leave', this.onLeave);
    this.room.off('peer-update', this.onUpdate);
  }

  /** Is this peer still loading (it reports progress, and the progress moved within LOAD_STALL_MS)? */
  _stillLoading(id, t, t0) {
    if (this.room.peers.get(id)?.loading == null) return false;
    return t - Math.max(t0, this.loadSeen.get(id)?.[1] ?? t0) < LOAD_STALL_MS;
  }
  detach() { if (this.attached) { this.room.off('message', this.onMsg); this.attached = false; } }
  attach() { if (!this.attached) { this.room.on('message', this.onMsg); this.attached = true; } }

  // ---------------------------------------------------------------- host
  hostStart() {
    const app = this.app, room = this.room;
    if (!room.isHost || app.loadingMatch) return;
    const meta = room.meta || {};
    const start = { map: meta.map || app.mapId, difficulty: meta.difficulty || 'normal', seed: (Math.random() * 2 ** 31) | 0, n: ++this.n };
    room.setMeta({ state: 'playing', map: start.map, difficulty: start.difficulty });
    this.ready.clear();
    this.stats.clear();
    room.broadcast('start', start);
    app.startMatch({ ...start, room });
  }

  /**
   * Host: resolves when every guest reported ready for match n; after ms only while a guest that is not ready yet is
   * still loading (_stillLoading), never past READY_CAP_MS. A guest that leaves stops counting.
   * onCount(ready, total, lowest progress of the guests still loading or null).
   */
  waitReady(n, ms, onCount) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const check = () => {
        const t = performance.now();
        const ids = [...this.room.peers.keys()];
        const wait = ids.filter((id) => !this.ready.has(id));
        const prog = wait.map((id) => this.room.peers.get(id)?.loading).filter((p) => p != null);
        onCount?.(ids.length - wait.length, ids.length, prog.length ? Math.min(...prog) : null);
        const over = t - t0 > READY_CAP_MS || (t - t0 > ms && !wait.some((id) => this._stillLoading(id, t, t0)));
        if (!wait.length || over || this.room.closed) { clearInterval(iv); this._wake = null; resolve(); }
      };
      const iv = setInterval(check, 250);
      this._wake = check;
      check();
    });
  }

  go(n) { this.room.broadcast('go', { n }); }

  backToLobby() {
    if (!this.room.isHost) return;
    this.room.setMeta({ state: 'lobby' });
    this.room.broadcast('lobby', {});
  }

  // ---------------------------------------------------------------- guest
  sendReady(n) { this.room.send('ready', { n }); }

  /**
   * Guest: resolves once the host said go for match n. The host may be loading still, then waiting for a slower
   * teammate (GO_CAP_MS covers its limit); past that only while the host is still loading (_stillLoading), at most
   * twice as long. A host that died closes the room (its link times out), which ends the wait too.
   * onWait(host progress or null) while it waits.
   */
  waitGo(n, onWait) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const iv = setInterval(() => {
        const t = performance.now(), host = this.room.hostId;
        onWait?.(this.room.peers.get(host)?.loading ?? null);
        const over = t - t0 > 2 * GO_CAP_MS || (t - t0 > GO_CAP_MS && !this._stillLoading(host, t, t0));
        if (this.goN >= n || over || this.room.closed) { clearInterval(iv); resolve(); }
      }, 100);
    });
  }

  // ---------------------------------------------------------------- stats board
  _own() {
    const s = this.app.game?.match?.stats || this.lastOwn || { kills: 0, headshots: 0, money: 0 };
    return { k: s.kills | 0, h: s.headshots | 0, m: Math.round(s.money || 0), d: Math.round(s.damage || 0), b: Math.round(s.bossDamage || 0) };
  }

  /** Called every frame while a multiplayer match (or its results) is up. */
  update(dt) {
    this.tick += dt;
    if (this.tick < 2) return;
    this.tick = 0;
    this.flushStats();
  }

  flushStats() {
    if (this.room.closed) return;
    if (this.room.isHost) this.room.broadcast('board', this._boardData());
    else this.room.send('st', this._own());
  }

  /** Match ended: remember own stats, push them now (host: again shortly after, to catch late guests). */
  final() {
    const s = this.app.game?.match?.stats;
    if (s) this.lastOwn = { ...s };
    this.flushStats();
    if (this.room.isHost) setTimeout(() => { this.flushStats(); this.app.screens.results?.refresh(); }, 1500);
  }

  _boardData() {
    const own = this._own();
    return this.room.players().map((p) => {
      const s = p.self ? own : this.stats.get(p.id) || { k: 0, h: 0, m: 0, d: 0, b: 0 };
      return [p.id, p.name, p.slot, s.k, s.h, s.m, s.d, s.b];
    });
  }

  /** Rows for the results table: { id, name, slot, k, h, m, d (damage), b (boss damage), self, host }. */
  boardRows() {
    const room = this.room;
    const data = room.isHost ? this._boardData() : this.board;
    const rows = data.map(([id, name, slot, k, h, m, d = 0, b = 0]) => ({ id, name, slot, k, h, m, d, b, self: id === room.selfId, host: slot === 0 }));
    if (!room.isHost) {
      const own = this._own();
      const me = rows.find((r) => r.self);
      if (me) Object.assign(me, own); else rows.push({ id: room.selfId, name: room.name, slot: room.slot, ...own, self: true, host: false });
    }
    return rows.sort((a, b) => a.slot - b.slot);
  }

  // ---------------------------------------------------------------- receive
  _msg({ from, type, data }) {
    const app = this.app, room = this.room;
    if (room.isHost) {
      if (type === 'ready' && data?.n === this.n) { this.ready.add(from); this._wake?.(); }
      else if (type === 'st' && data) {
        this.stats.set(from, { k: data.k | 0, h: data.h | 0, m: data.m | 0, d: data.d | 0, b: data.b | 0 });
        if (app.state === 'results') app.screens.results?.refresh();
      }
      return;
    }
    if (from !== room.hostId) return;
    if (type === 'start' && data && data.n !== this.loadingN) {
      this.loadingN = data.n;
      this.board = [];
      this.lastOwn = null;
      app.startMatch({ ...data, room });
    } else if (type === 'go') this.goN = Math.max(this.goN, data?.n | 0);
    else if (type === 'board' && Array.isArray(data)) { this.board = data; if (app.state === 'results') app.screens.results?.refresh(); }
    else if (type === 'lobby') app.onHostLobby();
  }
}
