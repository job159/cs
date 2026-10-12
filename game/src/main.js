// Entry point: boot screen, renderer, input, game loop.
import { Renderer } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { Game } from './game.js';
import { AudioEngine } from './engine/audio.js';
import * as testArena from './world/maps/testArena.js';
import { Vector3 } from 'three';
import { HUD } from './ui/hud.js';
import { TouchControls } from './ui/touch.js';
import { Shop, PerkPicker } from './ui/shop.js';
import { PERKS } from './match/rules.js';

window.__shotReady = false;
const canvas = document.getElementById('gl');
const bootEl = document.getElementById('boot');
const params = new URLSearchParams(location.search);

const renderer = new Renderer(canvas);
if (params.get('q')) renderer.setQuality(params.get('q'));
const input = new Input(canvas);
input.wantPointerLock = !matchMedia('(pointer: coarse)').matches;
const audio = new AudioEngine();
audio.init();
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
const game = new Game({ renderer, input, audio });
if (params.get('w')) game.startWeapon = params.get('w');
if (params.get('vmdebug')) game.debugView = params.get('vmdebug');
if (params.get('hip')) game.hipOverride = params.get('hip').split(',').map(Number);
game.hud = new HUD(game);
if (params.get('match') !== '0') game.matchOptions = { difficulty: params.get('diff') || 'normal', players: 1 };
const touchMode = params.get('touch') === '1' || (params.get('touch') !== '0' && matchMedia('(pointer: coarse)').matches);
if (touchMode) { game.touch = new TouchControls(input, game); document.body.classList.add('touch'); }
game.shop = new Shop(game);
game.perks = new PerkPicker(game, PERKS);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.resize(w, h);
  game.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let running = true;
function loop(now) {
  if (!running) return;
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0.0005, (now - last) / 1000));
  last = now;
  game.frame(dt);
  game.render();
  renderer.adapt(dt);
}

async function boot() {
  if (params.get('view')) {
    running = false;
    // zombie/character previews live in their own module (owned by the zombie pipeline)
    if (params.get('view') === 'zombie') {
      const { runZombieViewer } = await import('./tools/zviewer.js');
      await runZombieViewer(renderer, params);
    } else {
      const { runViewer } = await import('./tools/viewer.js');
      await runViewer(renderer, params);
    }
    return;
  }
  await game.loadMap(testArena);
  // dev: ?zombies=N&ztype=walker,runner spawns a test horde around the player
  const nz = +(params.get('zombies') || 0);
  const types = (params.get('ztype') || 'walker').split(',');
  for (let i = 0; i < nz; i++) {
    const a = (i / Math.max(1, nz)) * Math.PI * 2;
    const r = 10 + (i % 3) * 4;
    game.zombies.spawn(types[i % types.length], new Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
  }
  // dev multiplayer: ?host=1 creates a room, ?join=<code> joins one (the lobby UI replaces this)
  if (params.get('host') || params.get('join')) {
    const { hostRoom, joinRoom } = await import('./net/session.js');
    const { NetSync } = await import('./net/sync.js');
    const name = params.get('name') || ('玩家' + Math.floor(Math.random() * 90 + 10));
    const room = params.get('host')
      ? await hostRoom({ name, version: __VERSION__, meta: { map: 'test', difficulty: 'normal', state: 'playing' }, allowLateJoin: true })
      : await joinRoom(params.get('join'), { name, version: __VERSION__, forceRelay: params.get('relay') === '1' });
    new NetSync(game, room);
    window.__room = room;
    game.hud.toast(room.isHost ? `房號 ${room.code}` : `已加入房間 ${room.code}`, 6000);
    console.log('room', room.code, room.isHost ? 'host' : 'guest');
  }
  bootEl.classList.add('gone');
  requestAnimationFrame((t) => { last = t; loop(t); });
  window.__shotReady = true;
}

// Test / debug hooks (headless QA drives frames directly).
window.__cf = {
  game, renderer, input, audio,
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) { game.frame(dt); } game.render(); },
  stop() { running = false; },
};

boot().catch((e) => {
  console.error(e.stack || e);
  window.__shotReady = true;
  bootEl.querySelector('.boot-msg').textContent = '載入失敗：' + e.message;
});
