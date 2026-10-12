// Entry point: boot screen, renderer, input, game loop.
import { Renderer } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { Game } from './game.js';
import { AudioEngine } from './engine/audio.js';
import * as testArena from './world/maps/testArena.js';

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
