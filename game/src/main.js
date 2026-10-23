// Entry point + app state machine.
//   boot (asset preload, progress bar) -> menu -> solo | mp (room browser) -> lobby -> loading -> game
//   (pause overlay) -> results -> menu / lobby / again.   settings = overlay from the menu or the pause menu.
// Screens live in ui/*.js; this file owns the renderer / input / audio, the current Game (one at a time:
// either a world-only menu backdrop or a running match), the multiplayer room and the frame loop.
//
// Desktop (keyboard + mouse) is the main platform; touch controls stay as a fallback:
//   - pointer lock: the first click of a match locks the mouse ("click to start" card until then); leaving a menu
//     (pause, shop) re-locks right away when the browser allows it, else on the next click / key press (small hint)
//   - quality 'auto' is calibrated once per GPU / window size on the menu backdrop (settings.js calibrateQuality)
//   - menus: hover / focus states, arrow keys move the focus, Enter picks (the primary button when nothing has focus),
//     Esc goes back; a key legend sits at the bottom of the menu screens (and under the open buy menu, whose number
//     keys / Q E live in ui/shop.js)
//   - fullscreen (settings) also locks the keyboard so Ctrl+W & co. reach the game instead of closing the tab;
//     a running match asks before the page is left (published build)
//
// Dev URL params (skip the menus and start a match directly, like before the front-end existed):
//   ?w=<weapon> ?zombies=N&ztype=a,b ?match=0 (free roam) ?diff=<id> ?map=<id> ?vmdebug ?hip
//   (without ?map the match runs on DEFAULT_MAP = the newest ready chapter, Lost Town; ?map=test = proving ground)
//   ?host=1 / ?join=<code> [&name=X&relay=1] (direct multiplayer, used by tools/mp-test.mjs)
// Always available: ?q=<low|medium|high|ultra> (locks quality) ?touch=0|1 ?view=... (asset viewers)
//   ?menu=1 forces the menus even with the params above; ?map=<id> then picks the menu map.
import { Vector3 } from 'three';
import { Renderer } from './engine/renderer.js';
import { Input, KEYMAP } from './engine/input.js';
import { AudioEngine } from './engine/audio.js';
import { loadGLB } from './engine/assets.js';
import { Game } from './game.js';
import './weapons/premium/bifang.js';          // M03 畢方 / 鬼車: special, skills, clips, crosshair, kill marks (after the engine)
import { HUD } from './ui/hud.js';
import { TouchControls } from './ui/touch.js';
import { Shop, PerkPicker } from './ui/shop.js';
import { PERKS } from './match/rules.js';
import { ZOMBIES } from './zombies/defs.js';
import { MAPS, DEFAULT_MAP, mapInfo, hasMap, mapKicker } from './world/maps/index.js';
import { Dialogs, Loading, toast, el, esc } from './ui/kit.js';
import { injectCSS } from './ui/crosshairs.js';
import { Settings, SettingsScreen, applySettings, noteGpu, calibrateQuality } from './ui/settings.js';
import { initBinds, capturing, primaryKey, bindLabel } from './engine/keybinds.js';
import { MainMenu, SoloSetup, Armory, orbitBackdrop, DIFF_IDS, DIFF_INFO } from './ui/menu.js';
import { mapThumb } from './ui/mapthumb.js';
import { Gyro } from './engine/gyro.js';
import { haptic } from './weapons/arsenal.js';
import { MultiplayerScreen, LobbyScreen } from './ui/lobby.js';
import { PauseMenu } from './ui/pause.js';
import { ResultsScreen } from './ui/results.js';
import { NetSync } from './net/sync.js';
import * as fxAtlas from './fx/atlas.js';
import { Coop } from './net/coop.js';

window.__shotReady = false;
const params = new URLSearchParams(location.search);
const DEV_KEYS = ['w', 'zombies', 'ztype', 'host', 'join', 'match', 'map', 'diff', 'vmdebug', 'hip'];
const DEV_GAME = DEV_KEYS.some((k) => params.has(k)) && !params.has('menu');
const COARSE = matchMedia('(pointer: coarse)').matches;
const MENU_STATES = new Set(['menu', 'solo', 'mp', 'lobby', 'armory']);
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const PUBLISHED = typeof __DEV__ !== 'undefined' && !__DEV__;
const MOUSE_SVG = '<svg viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.5V9M6 9h12" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M12 3.35A5.15 5.15 0 0 0 6.85 8.5V9H12z" fill="currentColor"/></svg>';
const kc = (code) => `<kbd class="kc${bindLabel(code).length > 1 ? ' w' : ''}">${esc(bindLabel(code))}</kbd>`;

// Download meter for the loading screens: every fetched body (models, maps, audio) is counted while it streams in,
// so the loading line shows real megabytes instead of a bar that sits still during a big file.
const net = { bytes: 0 };
if (window.fetch && window.TransformStream) {
  const fetch0 = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const r = await fetch0(...args);
    if (!r.body || r.type === 'opaque') return r;
    const meter = new TransformStream({ transform(chunk, ctl) { net.bytes += chunk.byteLength; ctl.enqueue(chunk); } });
    const out = new Response(r.body.pipeThrough(meter), { status: r.status, statusText: r.statusText, headers: r.headers });
    Object.defineProperty(out, 'url', { value: r.url });
    return out;
  };
}
const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

injectCSS('app-desktop-css', `
#fe .fe-lockhint { inset: 0; left: 0; top: 0; transform: none; padding: 0; background: none; border: 0; z-index: 30; }
.lh-card { position: absolute; left: 50%; top: 57%; transform: translateX(-50%); display: none; flex-direction: column; align-items: center; gap: .5rem;
  min-width: 21rem; padding: .95rem 1.8rem 1rem; background: linear-gradient(180deg, rgba(16,17,19,.88), rgba(9,10,11,.92));
  border: 1px solid rgba(255,255,255,.12); border-top: 2px solid var(--accent); box-shadow: 0 12px 44px rgba(0,0,0,.55); animation: fe-in .35s ease-out both; }
.lh-card > svg { width: 1.7rem; height: 1.7rem; color: var(--accent); }
.lh-card b { font-size: 1.15rem; font-weight: 800; letter-spacing: .22em; padding-left: .22em; color: #f4efe4; }
.lh-card small { display: flex; align-items: center; gap: .4rem; font-size: var(--fs-xs); letter-spacing: .04em; color: #b8b2a6; white-space: nowrap; }
.lh-card small i { width: .6rem; }
.lh-pill { position: absolute; left: 50%; top: 61%; transform: translateX(-50%); display: none; align-items: center; gap: .5rem; padding: .42rem 1rem;
  background: rgba(10,11,12,.72); border: 1px solid rgba(255,255,255,.14); font-size: .85rem; letter-spacing: .1em; color: #e9e6df; }
.lh-pill svg { width: 1rem; height: 1rem; color: var(--accent); }
.fe-lockhint.first .lh-card, .fe-lockhint.again .lh-pill { display: flex; }
.fe-keys { position: absolute; left: 50%; bottom: calc(.45rem + var(--safe-bottom)); transform: translateX(-50%); z-index: 60; display: none; align-items: center; gap: 1.05rem;
  pointer-events: none; font-size: var(--fs-xs); letter-spacing: .05em; color: rgba(233,230,223,.6); white-space: nowrap; }
.fe-keys.on { display: flex; }
.fe-keys > span { display: inline-flex; align-items: center; gap: .4rem; }
.fe-keys .kc { height: 19px; min-width: 19px; font-size: 11px; }
body.fe-legend .scr.fe-shade2.on { padding-bottom: calc(2.15rem + var(--safe-bottom)); }
#gl { cursor: default; }
body.fe-locking #gl { cursor: pointer; }
`);

class App {
  constructor() {
    this.version = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';
    this.canvas = document.getElementById('gl');
    this.renderer = new Renderer(this.canvas);
    noteGpu(this.renderer.gl.getContext()); // 'auto' quality: GPU name (+ desktop benchmark, calibrateQuality)
    this.qualityLock = !!params.get('q');
    if (this.qualityLock) this.renderer.setQuality(params.get('q'));
    this.input = new Input(this.canvas);
    this.input.wantPointerLock = !COARSE;
    this.input.enabled = false;
    initBinds();                         // saved key bindings into Input's maps
    this.audio = new AudioEngine();
    this.settings = new Settings();
    // gyroscope aim (settings 陀螺儀): only while a match is being played, optionally only when aiming
    this.gyro = new Gyro(this.input, () => this.state === 'game' && !this.paused && !this.ending && this.input.enabled,
      () => !!this.game?.touch?.adsOn || (this.game?.vm?.aim ?? 0) > 0.5);
    this.touchMode = params.get('touch') === '1' || (params.get('touch') !== '0' && COARSE);
    if (this.touchMode) document.body.classList.add('touch');
    this.feRoot = document.createElement('div');
    this.feRoot.id = 'fe';
    document.body.appendChild(this.feRoot);
    this.fpsEl = el('<div class="fe-fps"></div>');
    this.feRoot.appendChild(this.fpsEl);
    // pointer lock prompt: a card before the first lock of a match, a small pill when a later re-lock needs a click
    this.lockHint = el(`<div class="fe-lockhint"><div class="lh-card">${MOUSE_SVG}<b>點擊畫面開始作戰</b><small></small></div><div class="lh-pill">${MOUSE_SVG}<span>點擊畫面繼續</span></div></div>`);
    this.feRoot.appendChild(this.lockHint);
    // key legend of the menu screens (desktop)
    this.keyLegend = el('<div class="fe-keys"></div>');
    this.feRoot.appendChild(this.keyLegend);
    this.lockedOnce = false;
    this.dialogs = new Dialogs(this);
    this.loading = new Loading();
    this.state = 'boot';
    this.screen = null;
    this.overlays = [];
    this.game = null;
    this.room = null;
    this.coop = null;
    this.paused = false;
    this.loadToken = 0;
    this.time = 0;
    this.dev = {
      map: params.get('map') && hasMap(params.get('map')) ? params.get('map') : null,
      noMatch: params.get('match') === '0',
    };
    if (this.dev.map) this.mapId = this.dev.map;
    this.screens = {
      menu: new MainMenu(this), solo: new SoloSetup(this), mp: new MultiplayerScreen(this), lobby: new LobbyScreen(this),
      armory: new Armory(this), results: new ResultsScreen(this), settings: new SettingsScreen(this), pause: new PauseMenu(this),
    };
    this.settings.onChange(() => applySettings(this));
    this._bind();
  }

  // ---------------------------------------------------------------- persisted choices
  get playerName() {
    let n = store.get('cf.name', '');
    if (!n) { n = '玩家' + Math.floor(Math.random() * 900 + 100); store.set('cf.name', n); }
    return n;
  }
  set playerName(v) {
    const n = String(v || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14);
    if (n) store.set('cf.name', n);
  }
  // the stored pick only lasts while the default map is the same: a newly released chapter becomes the
  // menu / solo / new-room map once, even for players who picked another map before
  get mapId() {
    const m = this._map || (store.get('cf.mapDef', '') === DEFAULT_MAP ? store.get('cf.map', DEFAULT_MAP) : DEFAULT_MAP);
    return hasMap(m) ? m : DEFAULT_MAP;
  }
  set mapId(v) { if (!hasMap(v)) return; this._map = v; store.set('cf.map', v); store.set('cf.mapDef', DEFAULT_MAP); }
  get lastDiff() { const d = store.get('cf.diff', 'normal'); return DIFF_IDS.includes(d) ? d : 'normal'; }
  set lastDiff(v) { if (DIFF_IDS.includes(v)) store.set('cf.diff', v); }

  editName() {
    const body = el(`<label class="fe-field"><span>玩家名稱（最多 14 字）</span><input type="text" maxlength="14" value="${esc(this.playerName)}" autocomplete="off" spellcheck="false" enterkeyhint="done"></label>`);
    const input = body.querySelector('input');
    const d = this.dialogs.show({ title: '玩家名稱', body, dismiss: false, backCancels: true, buttons: [{ label: '取消', value: false }, { label: '儲存', cls: 'pri', value: true }] });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') d.close(true); });
    return d.done.then((ok) => { if (ok === true) this.playerName = input.value; });
  }

  toast(text, ms) { toast(this, text, ms); }

  // ---------------------------------------------------------------- screens
  /** Switches the base screen ('game' and 'loading' have none). */
  show(name, data) {
    const next = this.screens[name] || null;
    if (this.screen && this.screen !== next) { this.screen.leave(); this.screen.el.classList.remove('on', 'under'); }
    const prev = this.state;
    this.state = name;
    this.screen = next;
    if (next) {
      next.el.classList.remove('on');
      void next.el.offsetWidth; // restart the enter animation
      next.el.classList.add('on');
      next.enter(data);
    }
    if (prev !== name) this.audio.play(name === 'menu' && prev !== 'boot' ? 'ui_back' : 'ui_open');
    this._syncMode();
  }

  openOverlay(name, data) {
    const s = this.screens[name];
    if (!s || this.overlays.includes(s)) return;
    // an opaque overlay (settings) hides what is under it; the pause menu shows the game through
    if (!s.el.classList.contains('pause')) (this.overlays[this.overlays.length - 1] || this.screen)?.el.classList.add('under');
    this.overlays.push(s);
    s.el.classList.add('on', 'ovl');
    s.el.style.zIndex = String(10 + this.overlays.length);
    s.enter(data);
    this._syncMode();
  }

  closeOverlay(s) {
    const i = this.overlays.indexOf(s);
    if (i < 0) return;
    this.overlays.splice(i, 1);
    s.leave();
    s.el.classList.remove('on', 'ovl');
    const top = this.overlays[this.overlays.length - 1];
    (top || this.screen)?.el.classList.remove('under');
    top?.enter?.();
    this._syncMode();
  }

  closeOverlays() {
    for (const s of [...this.overlays].reverse()) { this.overlays.pop(); s.leave(); s.el.classList.remove('on', 'ovl', 'under'); }
    this.screen?.el.classList.remove('under');
    this._syncMode();
  }

  /** Android Back / Esc: dialogs, then overlays, then the screen. Returns true when consumed. */
  back() {
    if (this.dialogs.back()) return true;
    const top = this.overlays[this.overlays.length - 1];
    if (top) { this.audio.play('ui_back'); return top.back(); }
    if (this.state === 'game') {
      if (this.game?.shop?.open) { this.game.shop.close(); return true; }
      if (!this.ending) this.pause();
      return true;
    }
    if (this.state === 'loading') { this.loading.onCancel?.(); return true; } // only once the cancel button is offered
    if (this.state === 'boot') return true;
    if (!this.screen) return false;
    this.audio.play('ui_back');
    return this.screen.back();
  }

  _syncMode() {
    const inGame = this.state === 'game';
    document.body.classList.toggle('fe-menu', !inGame);
    document.body.classList.toggle('fe-paused', inGame && this.overlays.length > 0);
    this.game?.touch?.setVisible(inGame && this.overlays.length === 0);
    if (!inGame || this.overlays.length) this.input.enabled = false;
    this._legend();
  }

  /** Key legend at the bottom of the menu screens (desktop): what Enter / Esc / the arrows do right here. */
  _legend() {
    let html = '';
    const shop = this.state === 'game' && !this.overlays.length && !!this.game?.shop?.open;
    if (!this.touchMode && !COARSE && this.state !== 'boot' && this.state !== 'loading' && (this.state !== 'game' || this.overlays.length || shop)) {
      const top = this.overlays[this.overlays.length - 1];
      const item = (keys, label) => `<span>${keys.map(kc).join('')}${label}</span>`;
      const arrows = item(['ArrowUp', 'ArrowDown'], '選擇');
      if (this.dialogs.open) html = item(['Enter'], '確認') + item(['Escape'], '取消');
      else if (shop) html = item(['Digit1', 'Digit9'], '購買') + item(['KeyQ', 'KeyE'], '切換分頁') + arrows + item(['Enter'], '確認') + item([primaryKey('buy') || 'KeyB'], '關閉');
      else if (top === this.screens.pause) html = arrows + item(['Enter'], '確認') + item(['Escape'], '繼續');
      else if (capturing()) html = item(['Escape'], '取消指派') + item(['Delete'], '清除');
      else if (top) html = arrows + item(['Escape'], '返回');
      else if (this.state === 'menu') html = arrows + item(['Enter'], '確認');
      else if (this.state === 'results') html = item(['Enter'], this.room && !this.room.isHost ? '確認' : '再來一局') + item(['Escape'], this.room ? '返回大廳' : '主選單');
      else html = arrows + item(['Enter'], '確認') + item(['Escape'], '返回');
    }
    if (this._legendHtml !== html) {
      this._legendHtml = html;
      this.keyLegend.innerHTML = html;
      this.keyLegend.classList.toggle('on', !!html);
      document.body.classList.toggle('fe-legend', !!html); // the header screens make room for it at the bottom
    }
  }

  // ---------------------------------------------------------------- games
  createGame() {
    const g = new Game({ renderer: this.renderer, input: this.input, audio: this.audio });
    g.app = this;
    if (params.get('w')) g.startWeapon = params.get('w');
    if (params.get('vmdebug')) g.debugView = params.get('vmdebug');
    if (params.get('hip')) g.hipOverride = params.get('hip').split(',').map(Number);
    g.hfov = this.settings.get('fov');
    g.resize(window.innerWidth, window.innerHeight);
    return g;
  }

  disposeGame() {
    const g = this.game;
    if (!g) return;
    this.game = null;
    try { g.dispose(); } catch (e) { console.warn('dispose', e); }
  }

  /**
   * Loads (once) the world of the game's map; shared by the backdrop and the match loader. The map loader's
   * progress (0..1) goes to this.onWorldProgress while a loading screen listens.
   */
  _world(g, info) {
    if (!g.worldP) {
      const load = g.world.load.bind(g.world);
      g.world.load = (map, ctx) => load(map, { ...ctx, onProgress: (p) => this.onWorldProgress?.(p) });
      g.worldP = info.load().then((mod) => g.loadWorld(mod));
    }
    return g.worldP;
  }

  /** Menu backdrop: a world-only game of mapId, orbited slowly behind the menus. */
  ensureBackdrop(mapId) {
    const info = mapInfo(mapId);
    const g0 = this.game;
    if (g0 && !g0.player && g0.mapId === info.id) return g0.worldP;
    if (g0?.player && this.state !== 'menu' && !MENU_STATES.has(this.state)) return null;
    this.disposeGame();
    const g = this.game = this.createGame();
    g.mapId = info.id;
    document.body.classList.add('bd-loading');
    const p = this._world(g, info).then(() => {
      if (this.game !== g) return;
      g.bdReady = true;
      orbitBackdrop(g, info, this.time);
      this.renderer.render(g.scene, g.camera, this.time);
      document.body.classList.remove('bd-loading');
    }, (e) => { console.warn('backdrop failed', e); document.body.classList.remove('bd-loading'); });
    return p;
  }

  attachGameUI(g) {
    g.hud = new HUD(g);
    if (this.touchMode) g.touch = new TouchControls(this.input, g);
    g.shop = new Shop(g);
    g.perks = new PerkPicker(g, PERKS);
    g.onMatchEnd = (victory, stats) => this.onMatchEnd(victory, stats);
    applySettings(this);
  }

  startSolo({ map, difficulty, bots = this.botCount }) {
    this.mapId = map;
    this.lastDiff = difficulty;
    return this.startMatch({ map, difficulty, bots, seed: (Math.random() * 2 ** 31) | 0 });
  }

  /** AI teammates for solo (0 = off), persisted. */
  get botCount() { return Math.max(0, Math.min(3, +store.get('cf.bots', '0') || 0)); }
  set botCount(n) { store.set('cf.bots', String(Math.max(0, Math.min(3, n | 0)))); }

  /**
   * Loads a match and enters it. Multiplayer: the host already broadcast 'start'; after loading the
   * host attaches NetSync, waits for every guest's 'ready' and says 'go'; guests buffer the host's
   * traffic while loading (coop detached), attach NetSync, report ready and wait for 'go'.
   */
  async startMatch({ map, difficulty = 'normal', seed = 0, n = 0, room = null, bots = 0 }) {
    const token = ++this.loadToken;
    this.loadingMatch = true;
    const info = mapInfo(map);
    this.dialogs.closeAll();
    this.closeOverlays();
    this.ending = false;
    this.paused = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.show('loading');
    const dInfo = DIFF_INFO[difficulty] || DIFF_INFO.normal;
    this.loading.show({ title: info.zh, sub: info.en, msg: '載入地圖…', tip: true,
      kicker: `${esc(mapKicker(info))}<i></i><b style="color:${dInfo.color}">${dInfo.zh}</b>`, objective: info.objective || '', art: mapThumb(info) });
    const guest = room && !room.isHost;
    if (guest) this.coop?.detach();
    const alive = () => token === this.loadToken;
    // a stuck load (slow phone, a teammate that never reports ready) must not trap the player
    const cancelT = setTimeout(() => {
      if (alive() && this.state === 'loading') this.loading.setCancel(room ? '離開房間' : '返回主選單', () => this.cancelLoading());
    }, 8000);
    const tLoad = performance.now();
    const lt = [];
    const mark = (k) => lt.push(`${k} ${((performance.now() - tLoad) / 1000).toFixed(1)}`);
    this._netMeter(true);
    try {
      let g = this.game;
      if (!g || g.player || g.mapId !== info.id) { this.disposeGame(); g = this.game = this.createGame(); g.mapId = info.id; }
      this.loading.progress(0.1);
      this.onWorldProgress = (p) => { if (alive()) this.loading.progress(0.1 + p * 0.3); };
      await this._world(g, info);
      this.onWorldProgress = null;
      mark('world');
      if (!alive()) return;
      this.loading.progress(0.4, '準備武器與感染者…');
      this.attachGameUI(g);
      g.spawnIndex = room ? Math.max(0, room.slot) : 0;
      g.matchOptions = this.dev.noMatch ? null : { difficulty, players: room ? room.players().length : 1, seed, bots: room ? 0 : bots };
      await g.loadPlayer((p) => { this.loading.progress(0.4 + p * 0.5); mark('p' + p); });
      mark('player');
      if (!alive()) return;
      this.loading.progress(0.92, '編譯著色器…');
      await this.precompile(g);
      mark('shaders');
      if (!alive()) return;
      this.matchInfo = { map: info.id, difficulty, seed, n, bots, t0: performance.now() };
      let late = '';
      if (room) {
        new NetSync(g, room);
        this.coop?.attach();
        if (room.isHost) {
          await this.coop.waitReady(n, 30000, (ok, total) => this.loading.progress(1, total ? `等待隊友載入…（${ok} / ${total}）` : '準備開始'));
          if (!alive()) return;
          mark('ready');
          const slow = [...room.peers.keys()].filter((id) => !this.coop.ready.has(id)).length;
          if (slow) late = `隊友載入逾時（${slow} 人），已先開始`;
          this.coop.go(n);
        } else {
          this.coop.sendReady(n);
          this.loading.progress(1, '等待其他玩家…');
          await this.coop.waitGo(n, 45000);
          if (!alive()) return;
          mark('go');
          if (this.coop && this.coop.goN < n) late = '等待房主逾時，已先進入戰場';
        }
      }
      clearTimeout(cancelT);
      this.loadingMatch = false;
      this._netMeter(false);
      console.info(`[app] match ${n || ''} on ${info.id} ready in ${((performance.now() - tLoad) / 1000).toFixed(1)} s${room ? (room.isHost ? ' (host)' : ' (guest)') : ''} [${lt.join(', ')}]`);
      this.enterGame();
      if (late) g.hud?.toast(late, 4000);
    } catch (e) {
      console.error(e.stack || e);
      clearTimeout(cancelT);
      this.onWorldProgress = null;
      this._netMeter(false);
      if (!alive()) return;
      this.loadingMatch = false;
      if (guest) this.coop?.attach();
      this.loading.hide();
      this.disposeGame();
      if (room && !room.closed) this.show('lobby'); else this.show('menu');
      this.dialogs.alert('載入失敗', e.message || String(e));
    }
  }

  /** Loading screen's cancel button / Back: drop the load, leave the room (multiplayer) or go to the menu. */
  cancelLoading() {
    if (this.state !== 'loading') return;
    this.loadToken++;
    this.loadingMatch = false;
    this.loading.hide();
    this.disposeGame();
    if (this.room) { this.leaveRoom(); this.show('mp'); } else this.toMenu();
  }

  enterGame() {
    // the loading screen stays opaque until this match's world is on the canvas (QA: a match started while the menu
    // backdrop was still loading faded in over a stale frame): one frame drawn now, the fade once the loop drew too
    const g = this.game;
    try { if (g?.player) { g._updateCamera?.(0); g.render(); } } catch (e) { console.warn('first frame', e); }
    requestAnimationFrame(() => requestAnimationFrame(() => { if (this.state === 'game' && this.loading.visible) this.loading.hide(); }));
    document.body.classList.remove('bd-loading');
    this.paused = false;
    this.ending = false;
    // the menu backdrop's fixed scale must not carry into the match; without dynamic resolution: always full
    if (!this.settings.v.dynRes && !COARSE) this.renderer.gameScale = 1;
    this.renderer.unpinScale();
    this.show('game');
    this.input.enabled = true;
    this.input.releaseAll();
    this.input.endFrame();
    this.lockedOnce = false;   // "click to start" card until this match has the mouse
    if (this.matchInfo) this.matchInfo.t0 = performance.now();
    applySettings(this);
  }

  pause() {
    if (this.state !== 'game' || this.paused) return;
    this.paused = true;
    this.input.releaseAll();
    this.game?.touch?.releaseAll();
    if (document.pointerLockElement) document.exitPointerLock();
    this.openOverlay('pause');
  }

  resume() {
    this.closeOverlays();
    if (this.state !== 'game') return;
    this.paused = false;
    this.input.enabled = true;
    this.input.releaseAll();
    this.input.endFrame();
    this.requestLock();   // works from the 繼續 click; after Esc the next click / key press re-locks
    this._syncMode();
  }

  // ---------------------------------------------------------------- desktop: pointer lock, fullscreen, display
  /** In a match with nothing in the way: the mouse should be captured. */
  get wantsLock() {
    const g = this.game;
    return this.input.wantPointerLock && !this.touchMode && this.state === 'game' && !this.paused && !this.ending && !!g?.player
      && !g.shop?.open && !this.dialogs.open && !this.overlays.length;
  }

  /** Captures the mouse (raw input when the setting is on and the platform supports it). Needs a user gesture. */
  requestLock() {
    if (!this.wantsLock || document.pointerLockElement === this.canvas) return;
    const req = (opts) => { try { return this.canvas.requestPointerLock?.(opts); } catch { return null; } };
    const raw = !!this.settings.v.rawInput;
    const p = req(raw ? { unadjustedMovement: true } : undefined);
    // no raw input on this OS / browser: the plain lock, still inside the same user activation
    p?.catch?.((e) => { if (raw && e?.name === 'NotSupportedError') req()?.catch?.(() => {}); });
  }

  /** Fullscreen (settings 全螢幕); while it lasts the keyboard is locked, see _keyboardLock. */
  setFullscreen(on) {
    if (on && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => this.toast('瀏覽器不允許全螢幕'));
    } else if (!on && document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {});
  }

  /**
   * Keyboard lock in fullscreen (Chromium): the bound keys and Esc reach the game, so Ctrl+W / Ctrl+N and the like
   * cannot close the tab mid-fight and Esc opens the menu (holding Esc leaves fullscreen). Alt / Tab / the OS keys
   * stay with the system.
   */
  _keyboardLock() {
    const kb = navigator.keyboard;
    if (!kb?.lock) return;
    if (!document.fullscreenElement) { kb.unlock?.(); return; }
    const codes = new Set(['Escape', 'KeyW', 'KeyN', 'KeyT', 'KeyQ', 'KeyR', 'KeyF', 'KeyD', 'KeyS', 'KeyG', 'KeyE', ...Object.keys(KEYMAP)]);
    for (const c of ['Tab', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']) codes.delete(c);
    kb.lock([...codes]).catch(() => {});
  }

  /** Display settings applied here: dynamic resolution off -> back to full resolution at once. */
  applyDisplay() {
    const r = this.renderer;
    if (this.settings.v.dynRes || COARSE || this.state !== 'game' || r.fixedScale || r.scale >= 1) return;
    r.pinScale(1);
    r.gameScale = 1;
    r.unpinScale();
  }

  /** Menu backdrop resolution / rate: full and 60 fps on desktop high / ultra, cheaper elsewhere. */
  get _bd() {
    const q = this.renderer.qualityName;
    return COARSE ? { scale: 0.75, dt: 1 / 30 } : q === 'high' || q === 'ultra' ? { scale: 1, dt: 1 / 62 } : { scale: 0.85, dt: 1 / 45 };
  }

  /**
   * Desktop 'auto' quality: benchmark on the menu backdrop once per GPU / window size (settings.js calibrateQuality),
   * then apply. force: re-measure (settings 重新測試). Runs only while the backdrop is up.
   */
  async calibrateQuality(force = false) {
    const g = this.game;
    if (COARSE || this.qualityLock || !g?.bdReady || g.player) return;
    if (!force && this.settings.v.quality !== 'auto') return;
    await calibrateQuality(this.renderer, g.scene, g.camera, { force });
    applySettings(this);
    this.renderer.pinScale(this._bd.scale);
  }

  /** Live "已下載 x MB" line under the loading bar while files stream in (stops once the loading screen is gone). */
  _netMeter(on) {
    clearInterval(this._meterT);
    const line = document.querySelector('#boot .boot-net');
    if (line) line.textContent = '';
    if (!on || !line) return;
    const b0 = net.bytes;
    this._meterT = setInterval(() => {
      if (!this.loading.visible) { clearInterval(this._meterT); line.textContent = ''; return; }
      const d = net.bytes - b0;
      line.textContent = d > 256 * 1024 ? `已下載 ${mb(d)}` : '';
    }, 120);
  }

  onMatchEnd(victory, stats) {
    if (this.ending || this.state !== 'game') return;
    this.ending = true;
    const m = this.game?.match;
    const mi = this.matchInfo || {};
    const data = { victory, stats: { ...stats }, round: Math.max(1, m?.round || 1), map: mi.map, difficulty: mi.difficulty,
      time: (performance.now() - (mi.t0 || performance.now())) / 1000, mp: !!this.room, bots: mi.bots || 0, level: m?.level || 1,
      // AI teammates' tallies for the squad table (solo with bots)
      squad: (this.game?.bots?.bots || []).map((b) => ({ name: b.name, k: b.stats.kills, h: b.stats.headshots, d: b.stats.damage, b: b.stats.bossDamage, downs: b.stats.downs })) };
    this.coop?.final();
    setTimeout(() => { if (this.state === 'game' && this.ending) this.showResults(data); }, 3500);
  }

  showResults(data) {
    this.dialogs.closeAll();
    this.closeOverlays();
    this.paused = false;
    this.show('results', data);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Leaves the running match from the pause menu. */
  quitMatch() {
    if (this.room) { this.leaveRoom(); this.disposeGame(); this.show('mp'); }
    else this.toMenu();
  }

  toMenu() {
    this.loadToken++;
    this.paused = false;
    this.ending = false;
    this.closeOverlays();
    if (this.game?.player) this.disposeGame();
    this.show('menu');
  }

  // ---------------------------------------------------------------- multiplayer
  setRoom(room) {
    this.room = room;
    this.coop = new Coop(this, room);
    window.__room = room;
  }

  leaveRoom() {
    const room = this.room;
    if (!room) return;
    this.coop?.dispose();
    this.coop = null;
    this.room = null;
    room.close();
  }

  backToLobby() {
    if (!this.room) { this.toMenu(); return; }
    this.coop?.backToLobby();
    this.disposeGame();
    this.show('lobby');
  }

  onHostLobby() {
    if (this.state === 'results') this.toast('房主已返回大廳', 2500);
  }

  onRoomClosed(reason) {
    if (!this.room) return;
    console.info('[app] room closed:', reason, 'state', this.state);
    const stay = this.state === 'results'; // the results stay up; everywhere else we go back to 多人連線
    const back = stay ? '' : '已返回多人連線。';
    const [title, msg] = {
      'host-left': ['房主已離開', `房間已解散，${back || '無法再開始下一局。'}`],
      kicked: ['已被移出房間', `你已被房主移出房間。${back}`],
      timeout: ['連線逾時', `與房主的連線逾時，已離開房間。${back}`],
      network: ['網路連線中斷', `網路連線中斷，已離開房間。${back}`],
    }[reason] || ['房間已關閉', `房間已關閉。${back}`];
    this.coop?.dispose();
    this.coop = null;
    this.room = null;
    this.loadToken++;
    this.loadingMatch = false;
    this.paused = false;
    this.dialogs.closeAll();
    if (stay) { this.screens.results.renderBtns(); this.dialogs.alert(title, msg); return; }
    this.closeOverlays();
    if (this.state === 'game' || this.state === 'loading') { this.loading.hide(); this.disposeGame(); }
    this.show('mp');
    this.dialogs.alert(title, msg);
  }

  // ---------------------------------------------------------------- input / platform hooks
  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || capturing()) return; // a key capture (settings 按鍵) takes Esc as "cancel"
      e.preventDefault();
      e.stopImmediatePropagation(); // Input must not also see it as the 'pause' action
      if (!e.repeat) this.back();   // held Esc (leaving a keyboard-locked fullscreen) must not flip the menu
    }, true);
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) { this.lockedOnce = true; return; }
      // desktop: Esc while the mouse is captured only releases the pointer -> open the pause menu
      if (this.state === 'game' && !this.paused && !this.ending && !this.game?.shop?.open && !this.dialogs.open) this.pause();
    });
    // first lock of a match (raw input when enabled; Input would take a plain lock) from a click anywhere on the
    // game view, and re-locking on the next click / key press after a menu when the browser refused the immediate
    // re-lock (e.g. right after Esc). The buy key is left alone: it opens the shop, which wants the cursor.
    window.addEventListener('mousedown', (e) => {
      if (!this.wantsLock || document.pointerLockElement || e.target.closest?.('button, input, a, #shop, #perks, .scr.on, .fe-dlg-wrap')) return;
      if (e.target === this.canvas) e.stopImmediatePropagation();
      this.requestLock();
    }, true);
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' && KEYMAP[e.code] !== 'buy' && this.wantsLock && !document.pointerLockElement) this.requestLock();
      // browser shortcuts on game keys (Ctrl+S / D / F / R... while crouching) stay out of the fight
      if (this.state === 'game' && !this.overlays.length && (e.ctrlKey || e.altKey) && KEYMAP[e.code] && !this.game?.shop?.open) e.preventDefault();
    }, true);
    // in a match the middle / back / forward mouse buttons are game buttons (bindable): no autoscroll, no navigation
    for (const type of ['mousedown', 'mouseup', 'auxclick']) {
      window.addEventListener(type, (e) => { if ((e.button === 1 || e.button === 3 || e.button === 4) && this.state === 'game') e.preventDefault(); });
    }
    // published build: leaving the page mid-match (Ctrl+W, a stray back gesture) asks first
    if (PUBLISHED) {
      window.addEventListener('beforeunload', (e) => {
        if (this.state !== 'game' || this.ending) return;
        e.preventDefault();
        e.returnValue = '';
      });
    }
    window.addEventListener('keydown', (e) => this._menuKey(e));
    document.addEventListener('fullscreenchange', () => this._keyboardLock());
    window.addEventListener('cf-binds', () => this._keyboardLock());
    window.__nativeBack = () => this.back();
    window.__nativePause = () => { this.audio.setBackground(true); if (this.state === 'game' && !this.room) this.pause(); };
    window.__nativeResume = () => this.audio.setBackground(document.hidden);
    document.addEventListener('visibilitychange', () => {
      this.audio.setBackground(document.hidden); // no sound behind the home screen (WebView keeps WebAudio running)
      if (document.hidden && this.state === 'game' && !this.room) this.pause();
    });
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.feRoot.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && !b.disabled && b.dataset.act !== 'back') this.audio.play('ui_click');
    });
    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.resize(w, h);
      this.game?.resize(w, h);
    };
    window.addEventListener('resize', resize);
    resize();
  }

  /**
   * Menu keyboard: the arrow keys move the focus to the nearest control in that direction (sliders keep left / right,
   * text and number fields keep their keys), Enter with nothing focused presses the screen's primary button.
   */
  _menuKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || capturing()) return;
    // in a match: only the open buy menu (its number keys / Q E live in ui/shop.js)
    const shop = this.state === 'game' && !this.overlays.length && this.game?.shop?.open ? this.game.shop.el : null;
    if (this.state === 'boot' || this.state === 'loading' || (this.state === 'game' && !this.overlays.length && !shop)) return;
    const dlg = this.dialogs.stack?.[this.dialogs.stack.length - 1];
    const root = dlg?.el || shop || (this.overlays[this.overlays.length - 1] || this.screen)?.el;
    if (!root) return;
    const t = document.activeElement;
    const inRoot = t && t !== document.body && root.contains(t);
    const field = inRoot && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'range'));
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (dir) {
      if (field || (inRoot && t.type === 'range' && dir[0])) return;
      const list = [...root.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')]
        .filter((n) => !n.disabled && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
      if (!list.length) return;
      e.preventDefault();
      if (!inRoot) { (root.querySelector(shop ? '.cbuy:not(:disabled)' : '.pri:not(:disabled), .on[data-act]') || list[0]).focus(); return; }
      const a = t.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
      let best = null, bs = Infinity;
      for (const n of list) {
        if (n === t) continue;
        const b = n.getBoundingClientRect(), dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
        const along = dx * dir[0] + dy * dir[1], across = Math.abs(dir[0] ? dy : dx);
        if (along < 4) continue;
        // overlapping rows / columns first, then the closest
        const overlap = dir[0] ? b.bottom > a.top + 2 && b.top < a.bottom - 2 : b.right > a.left + 2 && b.left < a.right - 2;
        const s = along + across * (overlap ? 0.5 : 3) + (overlap ? 0 : 400);
        if (s < bs) { bs = s; best = n; }
      }
      best?.focus();
      return;
    }
    if (e.key === 'Enter' && !inRoot) {
      const pri = root.querySelector('.fe-btn.pri:not(:disabled), button.pri:not(:disabled)');
      if (pri) { e.preventDefault(); pri.click(); }
    }
  }

  // ---------------------------------------------------------------- frame loop
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, Math.max(0.0005, (now - (this.last || now)) / 1000));
    this.last = now;
    this.time += dt;
    const g = this.game;
    if (this.state === 'game' && g?.player) {
      const frozen = this.paused && !this.room;
      if (!frozen) {
        if (this.input.state.pressed.pause && !this.paused) this.pause(); // touch HUD menu button
        if (this.settings.v.invertY) this.input.state.lookY = -this.input.state.lookY;
        g.frame(dt);
        g.render();
        if (this.settings.v.dynRes || COARSE) this.renderer.adapt(dt);
      } else if ((this.frozenT = (this.frozenT || 0) + dt) > 0.25) { this.frozenT = 0; g.render(); }
      this.coop?.update(dt);
      if (this.paused && this.room) {
        // the multiplayer menu does not stop the fight: flash the screen edge + vibrate when we get hurt
        const hp = g.status?.hp;
        if (this.pzHp != null && hp < this.pzHp - 0.5) { this.screens.pause.hurt(); haptic(40); }
        this.pzHp = hp;
      } else this.pzHp = null;
      // the shop just closed (B / its close button): take the mouse back while that click / key still counts
      const shopOpen = !!g.shop?.open;
      if (this.shopWasOpen && !shopOpen) this.requestLock();
      this.shopWasOpen = shopOpen;
      // (the pill waits a moment: a re-lock that the browser grants takes a frame or two)
      const unlocked = this.wantsLock && !document.pointerLockElement;
      this.unlockT = unlocked ? (this.unlockT || 0) + dt : 0;
      this._lockHint(!unlocked ? '' : !this.lockedOnce ? 'first' : this.unlockT > 0.35 ? 'again' : '');
    } else {
      this._lockHint('');
      if (this.state === 'results') this.coop?.update(dt);
      if (g && g.bdReady && !g.player && MENU_STATES.has(this.state)) {
        this.bdT = (this.bdT || 0) + dt;
        const bd = this._bd;
        if (this.bdT >= bd.dt) {
          const r = this.renderer;
          if (!r.fixedScale || Math.abs(r.scale - bd.scale) > 1e-3) r.pinScale(bd.scale);
          orbitBackdrop(g, mapInfo(g.mapId), this.time);
          g.world.update(this.bdT, this.time);
          r.render(g.scene, g.camera, this.time);
          this.bdT = 0;
        }
      }
    }
    if ((this.legendT = (this.legendT || 0) + dt) > 0.2) { this.legendT = 0; this._legend(); } // dialogs / key capture come and go
    this._fps(dt);
  }

  /** '' | 'first' (card: click to start + the main keys) | 'again' (small pill: click to resume). */
  _lockHint(kind) {
    document.body.classList.toggle('fe-locking', !!kind);
    if (this._lockKind === kind) return;
    this._lockKind = kind;
    const h = this.lockHint;
    h.classList.toggle('on', !!kind);
    h.classList.toggle('first', kind === 'first');
    h.classList.toggle('again', kind === 'again');
    if (kind === 'first') {
      const k = (a) => kc(primaryKey(a));
      h.querySelector('small').innerHTML = `${['f', 'l', 'b', 'r'].map(k).join('')} 移動<i></i>${k('jump')} 跳躍<i></i>${k('buy')} 商店<i></i>${kc('Escape')} 選單`;
    }
  }

  _fps(dt) {
    if (!this.settings.v.showFps) return;
    this.fpsN = (this.fpsN || 0) + 1;
    this.fpsT = (this.fpsT || 0) + dt;
    if (this.fpsT >= 0.5) { this.fpsEl.textContent = `${Math.round(this.fpsN / this.fpsT)} FPS`; this.fpsN = 0; this.fpsT = 0; }
  }

  // ---------------------------------------------------------------- boot
  /** Models a match needs from the start: viewmodel arms, the starting weapons, the zombie animations and bodies. */
  _matchModels() {
    const zombieModels = new Set();
    for (const z of Object.values(ZOMBIES)) for (const m of z.models || []) zombieModels.add(m);
    const weapons = new Set(['glock', params.get('w') || 'akm']);
    return {
      weapons: ['arms.glb', ...[...weapons].map((w) => `weapons/${w}.glb`)],
      zombies: ['zombies/anims.glb', ...[...zombieModels].map((m) => `zombies/${m}.glb`)],
    };
  }

  /**
   * Boot downloads. full (dev params straight into a match): audio + every match model up front. Menu path: only
   * the audio here; the menu map follows (boot), and the match models download behind the menu (prefetchMatch), so
   * the first screen comes up ~30 MB sooner.
   */
  async preload(full) {
    const L = this.loading;
    const m = this._matchModels();
    const groups = [['載入音效…', [() => this.audio.init()]]];
    if (full) groups.push(['載入武器…', m.weapons.map((f) => () => loadGLB(f))], ['載入感染者…', m.zombies.map((f) => () => loadGLB(f))]);
    // boot bar: 0-10 % the game code (index.html loader), 10-25 % (menu) / 10-50 % (full) these files, then the menu
    // map up to 93 %, then the quality test
    const span = full ? 0.4 : 0.15;
    const total = groups.reduce((n, [, t]) => n + t.length, 0);
    let done = 0;
    for (const [msg, tasks] of groups) {
      L.progress(0.1 + done / total * span, msg);
      await Promise.all(tasks.map((t) => Promise.resolve().then(t).catch(() => null).then(() => { done++; L.progress(0.1 + done / total * span); })));
    }
    const ui = Object.keys(this.audio.defs).filter((n) => n.startsWith('ui_'));
    if (ui.length) this.audio.preload(ui).catch(() => {});
    // The procedural FX atlas shaders are slow to compile (seconds on ANGLE/D3D). Compile them once here,
    // on a tiny atlas that stays alive so the programs stay cached: match loads (and multiplayer links,
    // which time out after 10 s without traffic) then never stall on them.
    L.progress(0.1 + span + 0.02, '準備特效…');
    await new Promise((r) => setTimeout(r, 30));
    const t = performance.now();
    try { this.fxWarm = fxAtlas.buildAtlases?.(this.renderer.gl, { size: 256 }); } catch (e) { console.warn('fx warm-up failed', e); }
    console.info(`[app] fx shaders compiled in ${((performance.now() - t) / 1000).toFixed(1)} s`);
  }

  /** Compiles the match scene's shaders before the first frame (parallel compile when available). */
  async precompile(g) {
    try {
      await Promise.race([this.renderer.gl.compileAsync(g.scene, g.camera), new Promise((r) => setTimeout(r, 20000))]);
    } catch (e) { console.warn('precompile', e); }
  }

  async boot() {
    if (params.get('view')) {
      // zombie/character/weapon previews live in their own modules (owned by the asset pipelines)
      document.getElementById('boot').classList.add('gone');
      if (params.get('view') === 'zombie') {
        const { runZombieViewer } = await import('./tools/zviewer.js');
        await runZombieViewer(this.renderer, params);
      } else {
        const { runViewer } = await import('./tools/viewer.js');
        await runViewer(this.renderer, params);
      }
      return;
    }
    applySettings(this);
    this.loading.show({ msg: '載入中…' });
    this.loading.progress(0.1);
    this._netMeter(true);
    const tBoot = performance.now();
    await this.preload(DEV_GAME);
    console.info(`[app] assets preloaded in ${((performance.now() - tBoot) / 1000).toFixed(1)} s`);
    requestAnimationFrame((t) => { this.last = t; this.loop(t); });
    if (DEV_GAME) {
      await this.devStart();
    } else {
      this.loading.progress(0.3, '載入地圖…');
      this.onWorldProgress = (p) => { if (this.state !== 'loading') this.loading.progress(0.3 + p * 0.63); };
      this.show('menu');
      const bd = this.ensureBackdrop(this.mapId);
      // a slow connection gets the menu after 25 s; the map keeps loading behind it
      const ready = await Promise.race([bd?.then(() => true), new Promise((r) => setTimeout(() => r(false), 25000))]);
      this.onWorldProgress = null;
      if (ready && this.settings.v.quality === 'auto' && !this.qualityLock && !COARSE) {
        this.loading.progress(0.95, '最佳化畫面設定…');
        await new Promise((r) => setTimeout(r, 20));
        await this.calibrateQuality();
      } else if (!ready) bd?.then(() => this.calibrateQuality());
      this.loading.progress(1);
      this.loading.hide();
      console.info(`[app] menu up in ${((performance.now() - tBoot) / 1000).toFixed(1)} s`);
      this.prefetchMatch();
    }
    window.__shotReady = true;
  }

  /**
   * Menu path: downloads + parses the match models one at a time behind the menu (one at a time keeps the menu
   * smooth). A match started meanwhile simply waits for the same requests (loadGLB caches the promise).
   */
  async prefetchMatch() {
    const t = performance.now();
    const m = this._matchModels();
    for (const f of [...m.weapons, ...m.zombies]) {
      await loadGLB(f).catch(() => null);
      await new Promise((r) => setTimeout(r, 30));
    }
    console.info(`[app] match models prefetched in ${((performance.now() - t) / 1000).toFixed(1)} s`);
  }

  /** Dev params: straight into a match (solo, or the old direct ?host / ?join multiplayer). */
  async devStart() {
    const map = this.dev.map || DEFAULT_MAP;   // Lost Town (newest ready chapter); ?map=test for the quick-loading proving ground
    const difficulty = params.get('diff') || 'normal';
    if (params.get('host') || params.get('join')) {
      const { hostRoom, joinRoom } = await import('./net/session.js');
      await this.startMatch({ map, difficulty });
      const name = params.get('name') || this.playerName;
      const room = params.get('host')
        ? await hostRoom({ name, version: this.version, meta: { map, difficulty, state: 'playing' }, allowLateJoin: true })
        : await joinRoom(params.get('join'), { name, version: this.version, forceRelay: params.get('relay') === '1' });
      this.room = room;
      window.__room = room;
      new NetSync(this.game, room);
      this.game.hud.toast(room.isHost ? `房號 ${room.code}` : `已加入房間 ${room.code}`, 6000);
      console.log('room', room.code, room.isHost ? 'host' : 'guest');
      return;
    }
    await this.startMatch({ map, difficulty });
    // ?zombies=N&ztype=walker,runner spawns a test horde around the player
    const nz = +(params.get('zombies') || 0);
    const types = (params.get('ztype') || 'walker').split(',');
    for (let i = 0; i < nz; i++) {
      const a = (i / Math.max(1, nz)) * Math.PI * 2;
      const r = 10 + (i % 3) * 4;
      this.game.zombies.spawn(types[i % types.length], new Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
    }
  }
}

const app = new App();
window.__app = app;
// Test / debug hooks (headless QA drives frames directly).
window.__cf = {
  get game() { return app.game; },
  renderer: app.renderer, input: app.input, audio: app.audio, app, net,
  step(n = 1, dt = 1 / 60) { const g = app.game; if (!g?.player) return; for (let i = 0; i < n; i++) g.frame(dt); g.render(); },
  stop() { app.loop = () => {}; },
};
void MAPS;

app.boot().catch((e) => {
  console.error(e.stack || e);
  window.__shotReady = true;
  const msg = document.querySelector('#boot .boot-msg');
  if (msg) msg.textContent = '載入失敗：' + e.message;
});
