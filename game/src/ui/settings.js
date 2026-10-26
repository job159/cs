// Player settings: persisted in localStorage ('cf.settings'), applied live to the renderer, input,
// touch controls, HUD (crosshair / markers / numbers / key hints), the viewmodel (CS2-style FOV / offset presets),
// audio buses and haptics; the mouse sensitivity can be shown and typed in CS2 units; plus the settings
// screen (tabs 操作 / 按鍵 / 畫面 / 準星 / 音效), usable from the main menu and from the pause menu. Rows that do not
// apply to the device are hidden (mouse rows and key bindings on phones; touch sensitivity, gyro, haptics,
// left-handed layout and HUD button size / opacity on desktop).
// Quality 'auto': phones by GPU name; desktops by GPU name plus a short benchmark of the loaded map (calibrateQuality:
// GPU time per tier, cached per GPU, window size and map) -- the highest tier that holds 60 fps, never below medium on
// a desktop (dynamic resolution is the safety net) unless even medium at its lowest resolution cannot hold 30 fps.
import { Screen, header, esc, ICON } from './kit.js';
import { haptic } from '../weapons/arsenal.js';
import { injectCSS } from './crosshairs.js';
import { BIND_GROUPS, bindsOf, bindLabel, setBind, clearBind, resetBinds, captureKey, stopCapture, capturing } from '../engine/keybinds.js';

const KEY = 'cf.settings';
const COARSE = matchMedia('(pointer: coarse)').matches;

export const DEFAULTS = {
  // mouseSens 0.4 ≈ CS2 sensitivity 2.3 (the look step is 0.0022 rad per count, CS2's 0.022° per count);
  // sensUnit 'cs2': the sensitivity row shows / takes CS2 values (same degrees per count)
  touchSens: 1.0, mouseSens: 0.4, sensUnit: 'game', adsSens: 1.0, invertY: false, rawInput: true, gyro: 'off', gyroSens: 1.0, fov: 96, leftHanded: false, haptics: true,
  // first-person weapon (CS2 viewmodel presets; vmFov / vmX / vmY / vmZ are the 自訂 values)
  vmPreset: 'desktop', vmFov: 58, vmX: 2, vmY: 0, vmZ: -2,
  hudScale: 100, hudAlpha: 100,
  quality: 'auto', dynRes: true, showFps: true, keyHints: true,
  xhColor: '#4dff6a', xhSize: 9, xhGap: 4, xhThick: 2, xhDot: true, hitmarker: true, damageNumbers: true,
  master: 90, sfx: 100, music: 55,
  _v: 2,
};
/** CS2 sensitivity with the same degrees per mouse count. */
export const cs2Sens = (v) => (v * 0.0022 * 180 / Math.PI) / 0.022;
const CS2K = cs2Sens(1);   // CS2 units per mouseSens unit (≈ 5.73)

/**
 * Viewmodel presets (CS2's desktop / classic / couch idea): fov = the hip-fire viewmodel FOV (vertical degrees),
 * x right, y forward, z up in VM_UNIT steps. QA: at 96° the old centred pose let the support sleeve fill a quarter of
 * the lower screen, so 標準 sits a little lower and right and draws a little smaller.
 */
export const VM_PRESETS = {
  desktop: { zh: '標準', fov: 58, x: 2, y: 0, z: -2 },
  classic: { zh: '經典', fov: 62, x: 3, y: 0, z: -3 },
  couch: { zh: '沉浸', fov: 52, x: 0, y: 0, z: 0 },   // (the pose before the presets: big and centred)
};
const VM_UNIT = 0.008;   // m of camera space per offset step
/** The viewmodel pose the settings ask for: { fov, x, y, z } (offset steps). */
export function vmPose(s) { return VM_PRESETS[s.vmPreset] || { fov: s.vmFov, x: s.vmX, y: s.vmY, z: s.vmZ }; }

export const XH_COLORS = ['#4dff6a', '#f2e34a', '#4de7ff', '#ffffff', '#ff4fd8', '#ff5a3d'];

let GPU = '';
/** Remembers the GPU name (unmasked WebGL renderer string) for autoQuality(); called once the renderer exists. */
export function noteGpu(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    GPU = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch { GPU = ''; }
}

/**
 * Phone GPU class from its name: 'low' only for entry-level chips (Adreno 5xx / 605-612 / 702, Mali-G31 / G51 / G52 /
 * G57 / G71 / G72 and older Mali, PowerVR), where medium cannot hold a playable frame rate even at its lowest dynamic
 * resolution; 'medium' for everything from the Adreno 613 / Mali-G68 class up (dynamic resolution covers the rest);
 * null when the name says nothing (emulators, unknown vendors).
 */
export function phoneGpuTier(name) {
  let m;
  if ((m = /Adreno[^0-9]*(\d{3})/i.exec(name))) { const n = +m[1]; return n >= 613 && n !== 702 ? 'medium' : 'low'; }
  if (/Immortalis|Xclipse|Apple/i.test(name)) return 'medium';
  if ((m = /Mali-G(\d+)/i.exec(name))) { const s = +m[1]; return [31, 51, 52, 57, 71, 72].includes(s) ? 'low' : 'medium'; }
  if (/Mali|PowerVR|Vivante|VideoCore/i.test(name)) return 'low';
  return null;
}

/**
 * Desktop GPU class from its name: the highest tier worth benchmarking. 'medium' for software rasterisers (no
 * benchmark), 'high' for integrated graphics (Intel UHD / Iris / Arc iGPU, AMD Radeon Graphics / Vega APUs, Apple
 * base M chips), 'ultra' for discrete GPUs, Apple Pro / Max / Ultra and anything unknown (the benchmark decides).
 */
export function desktopGpuCap(name) {
  if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(name)) return 'medium';
  if (/Apple M\d+ (Pro|Max|Ultra)/i.test(name)) return 'ultra';
  if (/Intel(?!.*Arc\(TM\) [AB]\d)|Radeon\(TM\) (Graphics|Vega)|Radeon Vega|Radeon Graphics|Apple M\d|Apple GPU/i.test(name)) return 'high';
  return 'ultra';
}

const CAL_KEY = 'cf.autoq';
const CAL_V = 4;
// GPU time (ms) of one frame of the map seen from the player spawn (no viewmodel, no zombies) that a tier may take.
// Measured on Lost Town (iGPU, 1600x900): a match frame adds the viewmodel (+12-15 %) and a fight's zombies / effects
// (+0-10 %), and the browser composites the canvas on top. ultra / high are measured at full resolution: the 60 fps
// tiers keep the view near 10.5 ms (a match frame then lands near 13 ms of GPU time); ultra keeps headroom for premium
// effects. medium is the desktop floor (shadows, MSAA, 4 lights: low looks clearly worse) and is measured at its
// lowest dynamic-resolution scale: it only has to hold ~30 fps there (a match frame ~1.3x the view: 25 ms), dynamic
// resolution then trades pixels for frame rate (this iGPU: 18 ms at full resolution, 46-48 fps in a match); low only
// when even that fails. Without timer queries the wall time of a back-to-back batch is measured instead (it includes
// the CPU): x1.25.
const CAL_LIMIT = { ultra: 6.5, high: 10.5, medium: 25 };
const CAL_WALL = 1.25;
// a new build re-measures (renderer / shader changes move the numbers)
const CAL_BUILD = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

// Results are kept per map ({ v, gpu, build, maps: { [map]: { size, q, ms } } }): the training ground costs a fraction
// of a chapter, so a tier measured on one must not carry over to the other. A map without its own result takes the
// most conservative one measured so far; it is measured itself the first time it is the menu backdrop.
const TIER_RANK = { low: 0, medium: 1, high: 2, ultra: 3 };
let calMap = null;   // the map 'auto' is for: the current game's (applySettings)
function calStore() {
  try {
    const c = JSON.parse(localStorage.getItem(CAL_KEY) || 'null');
    return c?.v === CAL_V && c.gpu === GPU && c.build === CAL_BUILD && c.maps ? c : null;
  } catch { return null; }
}
function calibration(map = calMap) {
  const maps = calStore()?.maps;
  if (!maps) return null;
  if (map && maps[map]) return maps[map];
  return Object.values(maps).reduce((a, b) => (!a || TIER_RANK[b.q] < TIER_RANK[a.q] ? b : a), null);
}

/** Picks a quality tier for 'auto'. Phones: by GPU class (medium when unknown), low on <= 3 GB devices. Desktops: the
 *  calibrated tier for the map, else high (medium for software rendering). */
export function autoQuality(map = calMap) {
  if (!COARSE) {
    const cal = calibration(map);
    if (cal?.q) return cal.q;
    return desktopGpuCap(GPU) === 'medium' ? 'medium' : 'high';
  }
  const mem = navigator.deviceMemory || 4;
  if (mem <= 3) return 'low';
  return phoneGpuTier(GPU) || 'medium';
}

/** What 'auto' is based on, for the settings note: { q, ms, gpu } or null. */
export function autoInfo() { const c = calibration(); return { q: autoQuality(), ms: c?.ms, gpu: GPU, measured: !!c }; }

const shadowSynced = new WeakMap();
/** Resizes the sun's shadow map of a loaded world to the tier's size (a map reads it once when it loads). */
export function syncShadowMaps(scene, size) {
  if (!scene || !size || shadowSynced.get(scene) === size) return;
  let sun = false;
  scene.traverse((o) => {
    if (!o.isDirectionalLight || !o.castShadow || o.name !== 'sun') return;
    sun = true;
    if (o.shadow.mapSize.x === size) return;
    o.shadow.mapSize.set(size, size);
    o.shadow.map?.dispose();
    o.shadow.map = null;
  });
  if (sun) shadowSynced.set(scene, size); // (before the world has loaded there is nothing to remember)
}

/**
 * GPU time per frame of render(i) for i = 0..n-1 (EXT_disjoint_timer_query_webgl2; the first quarter wakes the GPU
 * clocks up and is dropped), else the wall time per frame of the back-to-back batch. -> { ms, gpu }
 * The GPU is waited for without blocking the page (renderer.gpuDrain: a fence polled from timers).
 */
async function frameCost(renderer, render, n) {
  const ctx = renderer.gl.getContext();
  const ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2');
  if (ext) {
    const qs = [];
    for (let i = 0; i < n; i++) {
      const q = ctx.createQuery();
      ctx.beginQuery(ext.TIME_ELAPSED_EXT, q);
      render(i);
      ctx.endQuery(ext.TIME_ELAPSED_EXT);
      qs.push(q);
    }
    await renderer.gpuDrain();
    // query results only arrive once the browser has had control back
    for (let k = 0; k < 100 && !ctx.getQueryParameter(qs[n - 1], ctx.QUERY_RESULT_AVAILABLE); k++) await new Promise((r) => setTimeout(r, 10));
    const ok = !ctx.getParameter(ext.GPU_DISJOINT_EXT);
    const ms = qs.map((q) => (ok && ctx.getQueryParameter(q, ctx.QUERY_RESULT_AVAILABLE) ? ctx.getQueryParameter(q, ctx.QUERY_RESULT) / 1e6 : 0));
    for (const q of qs) ctx.deleteQuery(q);
    const good = ms.slice(n >> 2).filter((v) => v > 0).sort((x, y) => x - y);
    if (good.length >= n / 2) return { ms: good[good.length >> 1], gpu: true };
  }
  const t = performance.now();
  for (let i = 0; i < n; i++) render(i);
  await renderer.gpuDrain(5000, 1);
  return { ms: (performance.now() - t) / n, gpu: false };
}

/**
 * Desktop benchmark: the frame cost (frameCost: GPU time, else wall time) of the loaded map through the full post
 * chain, from the GPU's cap down (ultra / high at full resolution, medium at its lowest dynamic-resolution scale); the
 * first tier under CAL_LIMIT wins, else low. view(i), when given, places the camera for frame i (the menu's overview of
 * the town costs more than play: main.js shows the player spawn at eye height, four directions). The frames go to an
 * offscreen target: the canvas keeps the menu's last frame. Cached per GPU, build, map and drawing-buffer size; force
 * re-measures. Leaves the renderer on the tier it measured last: the caller re-applies the settings. Returns the
 * picked tier.
 */
export async function calibrateQuality(renderer, scene, camera, { force = false, view = null, map = 'map', stop = null } = {}) {
  if (COARSE) return null;
  const size = `${Math.round(renderer.width * (window.devicePixelRatio || 1) / 64)}x${Math.round(renderer.height * (window.devicePixelRatio || 1) / 64)}`;
  const store = calStore() || { v: CAL_V, gpu: GPU, build: CAL_BUILD, maps: {} };
  const old = store.maps[map];
  if (!force && old?.size === size) return old.q;
  const cap = desktopGpuCap(GPU);
  const res = { size, q: cap === 'medium' ? 'medium' : 'low', ms: {} };
  if (cap !== 'medium') {
    let scale = 1, out = null;
    // (the scale is pinned every batch in case anything touched it while the query results came back)
    const frame = (i) => { if (i === 0) renderer.pinScale(scale); view?.(i); renderer.render(scene, camera, 0.05 + i * 0.016, out); };
    for (const tier of ['ultra', 'high', 'medium']) {
      if (tier === 'ultra' && cap !== 'ultra') continue;
      renderer.setQuality(tier);
      scale = tier === 'medium' ? renderer.q.minScale : 1;
      renderer.pinScale(scale);
      syncShadowMaps(scene, renderer.q.shadows);
      out?.dispose();
      out = renderer.offscreenTarget?.() || null;
      for (let i = 0; i < 4; i++) { frame(i); await renderer.gpuDrain(); }   // targets, shadow map + its static cache, programs
      if (stop?.()) break;
      let m = await frameCost(renderer, frame, 16);
      const lim = CAL_LIMIT[tier] * (m.gpu ? 1 : CAL_WALL);
      // a noisy run (another app or tab busy on the GPU) near the limit gets one more chance; the better one counts
      if (m.ms > lim && m.ms < lim * 1.6) { await new Promise((r) => setTimeout(r, 150)); const m2 = await frameCost(renderer, frame, 16); if (m2.ms < m.ms) m = m2; }
      res.ms[tier] = +m.ms.toFixed(2);
      res.gpuTimer = m.gpu;
      await new Promise((r) => setTimeout(r, 0)); // let the loading screen breathe
      if (m.ms <= lim) { res.q = tier; break; }
      if (stop?.()) break;
    }
    out?.dispose();
    renderer.gl.setRenderTarget(null);
    // stopped (a match is starting): nothing is stored, the caller re-applies the settings
    if (stop?.()) { console.info(`[settings] auto quality on ${map}: measurement stopped`); return null; }
  }
  store.maps[map] = res;
  try { localStorage.setItem(CAL_KEY, JSON.stringify(store)); } catch { /* private mode */ }
  console.info(`[settings] auto quality on ${map}: ${res.q} (${GPU || 'unknown GPU'}; ${Object.entries(res.ms).map(([k, v]) => `${k}${k === 'medium' ? ' (lowest scale)' : ''} ${v} ms`).join(', ') || 'no benchmark'}${res.gpuTimer ? ' GPU' : ''})`);
  return res.q;
}

export class Settings {
  constructor() {
    this.v = { ...DEFAULTS };
    try {
      // older per-feature keys (HUD crosshair, touch sensitivity) seed the first load
      const hud = JSON.parse(localStorage.getItem('cf.hud') || 'null');
      if (hud) Object.assign(this.v, { xhColor: hud.crosshairColor ?? this.v.xhColor, xhGap: hud.crosshairGap ?? this.v.xhGap, xhSize: hud.crosshairLen ?? this.v.xhSize,
        xhThick: hud.crosshairThick ?? this.v.xhThick, xhDot: hud.dot ?? this.v.xhDot, hitmarker: hud.hitmarker ?? true, damageNumbers: hud.damageNumbers ?? true });
      const ts = localStorage.getItem('cf.touchSens');
      if (ts) this.v.touchSens = +ts || 1;
      Object.assign(this.v, JSON.parse(localStorage.getItem(KEY) || '{}'));
      // v2 (2026-10-23, user request): the crosshair centre dot and the FPS counter are on by default, also for
      // players whose saved settings predate that (they can still switch them off afterwards)
      if ((this.v._v | 0) < 2) { this.v.xhDot = true; this.v.showFps = true; this.v._v = 2; }
    } catch { /* defaults */ }
    this.listeners = new Set();
  }
  get(k) { return this.v[k]; }
  set(k, value) {
    if (this.v[k] === value) return;
    this.v[k] = value;
    this.save();
    for (const fn of this.listeners) fn(k, value);
  }
  reset() {
    this.v = { ...DEFAULTS };
    this.save();
    for (const fn of this.listeners) fn(null);
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch { /* private mode */ } }
  onChange(fn) { this.listeners.add(fn); }
}

/**
 * Applies every setting to the running systems. Cheap: safe to call on each change and whenever a
 * new game (HUD, touch controls) is created. qualityLock: a ?q= dev override wins over the setting.
 */
export function applySettings(app) {
  const s = app.settings.v;
  const { renderer, input, audio } = app;
  input.mouseSens = s.mouseSens;
  input.touchSens = s.touchSens;
  calMap = app.game?.mapId || calMap;
  if (!app.qualityLock) {
    const q = s.quality === 'auto' ? autoQuality() : s.quality;
    if (renderer.qualityName !== q) renderer.setQuality(q);
  }
  syncShadowMaps(app.game?.scene, renderer.q.shadows);
  app.applyDisplay?.();
  audio.setVolume('master', s.master / 100);
  audio.setVolume('sfx', s.sfx / 100);
  audio.setVolume('music', s.music / 100);
  haptic.enabled = !!s.haptics;
  app.gyro?.setMode(s.gyro, s.gyroSens);
  document.body.classList.toggle('lefty', !!s.leftHanded);
  document.body.style.setProperty('--tb-scale', String((s.hudScale || 100) / 100));
  document.body.style.setProperty('--tb-alpha', String((s.hudAlpha || 100) / 100));
  app.fpsEl?.classList.toggle('on', !!s.showFps);
  const g = app.game;
  if (!g) return;
  g.hfov = s.fov;
  g.adsSens = s.adsSens;
  g._updateFov?.();
  if (g.vm) { const v = vmPose(s); g.vm.fov = v.fov; g.vm.userOffset?.set(v.x * VM_UNIT, v.z * VM_UNIT, -v.y * VM_UNIT); }
  if (g.touch) g.touch.sens = s.touchSens;
  if (g.hud) {
    Object.assign(g.hud.settings, { crosshairColor: s.xhColor, crosshairLen: s.xhSize, crosshairGap: s.xhGap, crosshairThick: s.xhThick,
      dot: s.xhDot, hitmarker: s.hitmarker, damageNumbers: s.damageNumbers, keyHints: s.keyHints !== false });
    g.hud.cache.xh = null;
  }
}

// ---------------------------------------------------------------- settings screen

const TABS = [
  { id: 'ctl', zh: '操作', en: 'CONTROLS' },
  { id: 'keys', zh: '按鍵', en: 'KEYS', dev: 'mouse' },
  { id: 'gfx', zh: '畫面', en: 'GRAPHICS' },
  { id: 'xh', zh: '準星', en: 'CROSSHAIR' },
  { id: 'snd', zh: '音效', en: 'AUDIO' },
];

const QUALITY_OPTS = [['auto', '自動'], ['low', '低'], ['medium', '中'], ['high', '高'], ['ultra', '極致']];

function slider(key, zh, desc, min, max, step, fmt = (v) => v) {
  return { type: 'slider', key, zh, desc, min, max, step, fmt };
}
function toggle(key, zh, desc) { return { type: 'toggle', key, zh, desc }; }
const touch = (r) => ({ ...r, dev: 'touch' });
const mouse = (r) => ({ ...r, dev: 'mouse' });
const pct = (v) => `${v}%`;

const cm360 = (v) => Math.round((2 * Math.PI / (0.0022 * v)) / 800 * 2.54);
const custom = (s) => s.vmPreset === 'custom';
const f1 = (v) => (v > 0 ? '+' : '') + v.toFixed(1);

const ROWS = {
  ctl: [
    touch(slider('touchSens', '觸控視角靈敏度', '滑動畫面轉動視角的速度', 0.3, 3, 0.05, (v) => v.toFixed(2))),
    mouse({ type: 'seg', key: 'sensUnit', zh: '靈敏度單位', desc: 'CS2：直接輸入你在 CS2 的靈敏度（每單位轉動角度相同）', opts: [['game', '本遊戲'], ['cs2', 'CS2']] }),
    // shown and typed in the chosen unit (unit(s): the factor from mouseSens), stored as mouseSens
    mouse({ ...slider('mouseSens', '滑鼠靈敏度', '', 0.05, 4, 0.01, (v) => v.toFixed(2)), edit: true, unit: (s) => (s.sensUnit === 'cs2' ? CS2K : 1),
      sub: (v, s) => `${s?.sensUnit === 'cs2' ? `本遊戲 ${v.toFixed(2)}` : `約等於 CS2 靈敏度 ${cs2Sens(v).toFixed(2)}`}　·　800 DPI 轉一圈約 ${cm360(v)} 公分` }),
    slider('adsSens', '開鏡靈敏度', '開鏡瞄準時的視角速度倍率（已依放大倍率換算）', 0.3, 1.5, 0.05, (v) => `×${v.toFixed(2)}`),
    mouse(toggle('invertY', '反轉 Y 軸', '滑鼠往前推時視角向下')),
    mouse(toggle('rawInput', '原始滑鼠輸入', '略過作業系統的滑鼠加速（瀏覽器支援時）；下次鎖定滑鼠時生效')),
    touch({ type: 'seg', key: 'gyro', zh: '陀螺儀瞄準', desc: '轉動、傾斜手機來微調準星', opts: [['off', '關'], ['ads', '開鏡時'], ['always', '永遠']] }),
    touch({ ...slider('gyroSens', '陀螺儀靈敏度', '', 0.3, 3, 0.05, (v) => v.toFixed(2)), when: (s) => s.gyro !== 'off' }),
    slider('fov', '視野範圍 FOV', '水平視角（度）', 80, 110, 1, (v) => `${v}°`),
    { type: 'seg', key: 'vmPreset', zh: '武器位置', desc: '第一人稱武器的大小與位置（如 CS2 viewmodel）：標準、經典（偏右下、較小）、沉浸（置中、較大）',
      opts: [...Object.entries(VM_PRESETS).map(([id, p]) => [id, p.zh]), ['custom', '自訂']] },
    { ...slider('vmFov', '武器視角', '數值越大，武器顯得越小越遠', 46, 64, 1, (v) => `${v}°`), when: custom },
    { ...slider('vmX', '武器左右', '正值往右', -2, 4, 0.1, f1), when: custom },
    { ...slider('vmY', '武器前後', '正值往前', -2, 2, 0.1, f1), when: custom },
    { ...slider('vmZ', '武器上下', '正值往上', -4, 2, 0.1, f1), when: custom },
    touch(toggle('leftHanded', '左手操作', '射擊鍵與移動搖桿左右對調')),
    touch(toggle('haptics', '震動回饋', '射擊、受傷時手機震動')),
    touch(slider('hudScale', '按鈕大小', '戰鬥畫面觸控按鈕的大小', 80, 130, 5, pct)),
    touch(slider('hudAlpha', '按鈕不透明度', '降低可看清更多畫面', 30, 100, 5, pct)),
  ],
  keys: [],
  gfx: [
    { type: 'seg', key: 'quality', zh: '畫面品質', desc: '自動：依顯示卡效能測試選擇；粒子與彈孔數量於下一局生效', opts: QUALITY_OPTS },
    mouse(toggle('dynRes', '動態解析度', '畫面吃緊時暫時降低渲染解析度以維持流暢；關閉則固定原生解析度')),
    mouse({ type: 'toggle', key: 'fullscreen', zh: '全螢幕', desc: '全螢幕時鎖定鍵盤，Ctrl＋W 等瀏覽器快速鍵不會誤觸；長按 Esc 離開', live: () => !!document.fullscreenElement, when: () => !!document.fullscreenEnabled }),
    toggle('showFps', '顯示 FPS', '在畫面角落顯示每秒幀數'),
    mouse(toggle('keyHints', '按鍵提示', '戰鬥畫面顯示 [B] 商店、[R] 換彈等按鍵提示')),
  ],
  xh: [
    { type: 'colors', key: 'xhColor', zh: '準星顏色', desc: '' },
    slider('xhSize', '準星長度', '', 2, 20, 1, (v) => `${v}px`),
    slider('xhGap', '準星間距', '最小間距（射擊擴散時會自動張開）', 0, 14, 1, (v) => `${v}px`),
    slider('xhThick', '準星粗細', '', 1, 4, 1, (v) => `${v}px`),
    toggle('xhDot', '中心點', ''),
    toggle('hitmarker', '命中標記', '擊中時準星出現 ✕ 標記與音效'),
    toggle('damageNumbers', '傷害數字', '在目標上方顯示傷害數值'),
  ],
  snd: [
    slider('master', '主音量', '', 0, 100, 1, (v) => `${v}`),
    slider('sfx', '音效', '槍聲、殭屍與環境音', 0, 100, 1, (v) => `${v}`),
    slider('music', '音樂', '', 0, 100, 1, (v) => `${v}`),
  ],
};

/** 'ANGLE (Intel, Intel(R) Graphics (0x0000A7AB) Direct3D11 vs_5_0 ps_5_0, D3D11)' -> 'Intel(R) Graphics'. */
export function gpuShort(name) {
  const m = /^ANGLE \([^,]*, (.+?)(?: \(0x[0-9a-f]+\))?(?: Direct3D.*| OpenGL.*| Vulkan.*|, D3D.*)?\)?$/i.exec(name || '');
  return (m ? m[1] : name || '').replace(/\s+/g, ' ').trim().slice(0, 48);
}

const keyCap = (code, cls = '') => `<span class="kb-cap${cls}">${code ? esc(bindLabel(code)) : '—'}</span>`;
const bindName = (a) => BIND_GROUPS.flatMap((g) => g.rows).find((r) => r[0] === a)?.[1] || a;

injectCSS('settings-pc-css', `
.st-l small.st-sub { color: #c9b98f; }
.st-slider input.st-num { flex: none; width: 4.2rem; height: 2rem; margin: 0; cursor: text; touch-action: manipulation; padding: 0 .4rem; text-align: right; font-family: var(--num); font-size: 1.05rem; font-weight: 600; color: #fff;
  background: rgba(0,0,0,.35); border: 1px solid var(--fe-line2); border-radius: 2px; outline: none; user-select: text; -webkit-user-select: text; -moz-appearance: textfield; }
.st-slider input.st-num::-webkit-inner-spin-button, .st-num::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.st-slider input.st-num:hover { border-color: rgba(255,255,255,.38); }
.st-slider input.st-num:focus { border-color: var(--accent); background: rgba(242,181,68,.08); }
.st-toggle:hover i { border-color: rgba(255,255,255,.45); }
.st-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 0; }
.st-slider input:focus-visible { outline: none; }
.st-slider input:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px rgba(242,181,68,.35), 0 1px 4px rgba(0,0,0,.6); }
.st-colors button { transition: transform .12s; }
.st-colors button:hover { transform: scale(1.08); }
.st-note .fe-btn { margin-left: .7rem; min-height: 1.9rem; vertical-align: middle; }
.st-note b { color: #e9e6df; font-weight: 600; }
.st-tabs button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.kb-help { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem .45rem; margin: .7rem 0 .1rem; line-height: 1.5; }
.kb-help .kb-cap { min-width: 0; height: 1.4rem; padding: 0 .4rem; font-size: .72rem; }
.kb-help i { width: .8rem; }
.kb-gh { display: flex; align-items: baseline; gap: .6rem; margin: 1rem 0 0; padding-bottom: .3rem; border-bottom: 1px solid rgba(242,181,68,.35); }
.kb-gh b { font-size: .8rem; font-weight: 700; letter-spacing: .16em; color: var(--accent); }
.kb-gh small { font-family: var(--num); font-size: .62rem; font-weight: 600; letter-spacing: .3em; color: var(--dim); }
.kb-row { min-height: calc(var(--tap) + .05rem); }
.kb-row.flash { animation: kb-flash 1.4s ease-out; }
@keyframes kb-flash { 0%, 35% { background: rgba(242,181,68,.18); } 100% { background: transparent; } }
.kb-row.unbound .st-l b { color: #ff9584; }
.kb-row .st-l em { font-style: normal; font-size: .72rem; font-weight: 600; letter-spacing: .04em; color: #ff9584; margin-left: .55rem; }
.kb-keys { display: flex; gap: .45rem; flex: none; }
.kb-cap { display: inline-flex; align-items: center; justify-content: center; min-width: 7.2rem; height: 2.2rem; padding: 0 .8rem;
  font: 700 .88rem/1 "Segoe UI", Arial, var(--font); letter-spacing: .02em; color: #f3efe6; white-space: nowrap;
  background: linear-gradient(180deg, rgba(64,66,70,.9), rgba(30,31,34,.9)); border: 1px solid rgba(255,255,255,.26); border-radius: 3px;
  box-shadow: inset 0 -3px 0 rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.6); }
#fe button.kb-cap { cursor: pointer; transition: border-color .12s, background .12s, color .12s; }
#fe button.kb-cap:hover { border-color: rgba(242,181,68,.75); color: #fff; background: linear-gradient(180deg, rgba(80,77,70,.95), rgba(38,36,33,.95)); }
#fe button.kb-cap:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.kb-cap.alt { min-width: 6rem; color: #cfc9be; }
.kb-cap.empty { color: rgba(233,230,223,.3); font-weight: 600; }
.kb-cap.fixed { color: #a29d92; background: rgba(255,255,255,.03); box-shadow: none; border-style: dashed; border-color: rgba(255,255,255,.16); }
#fe .kb-cap.cap, #fe .kb-cap.cap:hover { color: #18130a; background: var(--accent); border-color: #ffd27a; animation: kb-pulse 1s ease-in-out infinite; }
@keyframes kb-pulse { 0%, 100% { box-shadow: 0 0 0 3px rgba(242,181,68,.25), 0 0 12px rgba(242,181,68,.45); } 50% { box-shadow: 0 0 0 5px rgba(242,181,68,.1), 0 0 22px rgba(242,181,68,.7); } }
.kb-lock { display: inline-flex; align-items: center; justify-content: center; gap: .25rem; width: 6rem; font-size: .72rem; color: rgba(162,157,146,.75); }
.kb-lock svg { width: .75rem; height: .75rem; }
`);

export class SettingsScreen extends Screen {
  constructor(app) {
    const keys = !COARSE || !app.touchMode;
    super(app, 'fe-settings fe-shade2', `${header('設定', 'SETTINGS', { right: '<button class="fe-btn ghost sm" data-act="reset">恢復預設</button>' })}
      <div class="fe-body st-body">
        <nav class="st-tabs">${TABS.filter((t) => t.dev !== 'mouse' || keys).map((t) => `<button data-act="tab" data-tab="${t.id}"><b>${t.zh}</b><small>${t.en}</small></button>`).join('')}</nav>
        <div class="st-pane fe-scroll"></div>
      </div>`);
    this.tab = 'ctl';
    this.pane = this.$('.st-pane');
    this.pane.addEventListener('input', (e) => {
      const t = e.target;
      if (t.type !== 'range') return;
      const row = ROWS[this.tab].find((r) => r.key === t.dataset.key);
      if (!row) return;
      const k = this._unit(row), v = k === 1 ? +t.value : +(+t.value / k).toFixed(4);   // (shown in the row's unit)
      this._showVal(t.closest('.st-row'), row, v);
      this._fill(t);
      app.settings.set(row.key, v);
      if (this.tab === 'xh') this._preview();
    });
    // typed value (mouse sensitivity): applied on Enter / leaving the field, clamped to the slider's range and snapped
    // to its step (a CS2 value is kept as typed: its game value carries 4 decimals)
    this.pane.addEventListener('change', (e) => {
      const t = e.target;
      if (!t.classList.contains('st-num')) return;
      const row = ROWS[this.tab].find((r) => r.key === t.dataset.key);
      if (!row) return;
      const k = this._unit(row), raw = (+t.value || row.min * k) / k;
      const v = Math.min(row.max, Math.max(row.min, k === 1 ? Math.round(raw / row.step) * row.step : raw));
      app.settings.set(row.key, +v.toFixed(4));
      this.render();
    });
    this.pane.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('st-num')) e.target.blur(); });
    // a click anywhere but the waiting keycap ends a key capture
    this.el.addEventListener('pointerdown', (e) => { if (capturing() && !e.target.closest('.kb-cap.cap')) { stopCapture(); this.render(); } }, true);
    document.addEventListener('fullscreenchange', () => { if (this.el.classList.contains('on') && this.tab === 'gfx') this.render(); });
  }

  enter(data = {}) {
    this.returnTo = data.returnTo || null;
    if (data.tab && ROWS[data.tab] && this.$(`.st-tabs [data-tab="${data.tab}"]`)) { this.tab = data.tab; this.pane.scrollTop = 0; }
    this.render();
  }

  leave() { stopCapture(); }

  back() {
    this.app.closeOverlay(this);
    return true;
  }

  onAct(act, t) {
    const s = this.app.settings;
    if (act === 'tab') { stopCapture(); this.tab = t.dataset.tab; this.render(); this.pane.scrollTop = 0; }
    else if (act === 'toggle') {
      const row = ROWS[this.tab].find((r) => r.key === t.dataset.key);
      if (row?.live) { this.app.setFullscreen?.(!row.live()); return; }
      s.set(t.dataset.key, !s.get(t.dataset.key)); this.render();
    }
    else if (act === 'seg') {
      const { key, v } = t.dataset;
      if (key === 'gyro' && v !== 'off') {
        // iOS needs the motion permission from this tap; Android / desktop resolve at once
        this.app.gyro.requestPermission().then((ok) => {
          if (!ok || !this.app.gyro.supported) { this.app.toast('此裝置無法使用陀螺儀'); return; }
          s.set(key, v); this.render();
        });
        return;
      }
      // 自訂 starts from the preset the player was on
      if (key === 'vmPreset' && v === 'custom' && VM_PRESETS[s.get('vmPreset')]) {
        const p = VM_PRESETS[s.get('vmPreset')];
        s.set('vmFov', p.fov); s.set('vmX', p.x); s.set('vmY', p.y); s.set('vmZ', p.z);
      }
      s.set(key, v); this.render();
    }
    else if (act === 'color') { s.set('xhColor', t.dataset.v); this.render(); }
    else if (act === 'bind') this._capture(t);
    else if (act === 'recal') {
      t.disabled = true;
      t.textContent = '測試中…';
      Promise.resolve(this.app.calibrateQuality?.(true)).then(() => this.render());
    }
    else if (act === 'reset') {
      if (this.tab === 'keys') {
        this.app.dialogs.confirm('恢復預設按鍵', '所有按鍵都會回到預設配置。', { ok: '恢復預設' }).then((ok) => { if (ok) { resetBinds(); this.render(); } });
        return;
      }
      this.app.dialogs.confirm('恢復預設設定', '所有設定都會回到預設值（按鍵配置請在「按鍵」分頁恢復）。', { ok: '恢復預設' }).then((ok) => { if (ok) { s.reset(); this.render(); } });
    }
  }

  /** Rows of the current tab that apply to this device / these settings. */
  _rows() {
    const s = this.app.settings.v;
    const touchUI = this.app.touchMode, fine = !COARSE;
    return ROWS[this.tab].filter((r) => (r.dev !== 'touch' || touchUI) && (r.dev !== 'mouse' || fine || !touchUI) && (!r.when || r.when(s)));
  }

  /** A row's display unit: the factor from the stored value (CS2 sensitivity), 1 for most rows. */
  _unit(r) { return r.unit?.(this.app.settings.v) || 1; }

  _showVal(row, r, v) {
    const val = row.querySelector('.st-val'), shown = r.fmt(v * this._unit(r));
    if (val) { if (val.tagName === 'INPUT') val.value = shown; else val.textContent = shown; }
    const sub = row.querySelector('.st-sub');
    if (sub && r.sub) sub.textContent = r.sub(v, this.app.settings.v);
  }

  render() {
    const s = this.app.settings.v;
    for (const b of this.$$('.st-tabs button')) b.classList.toggle('on', b.dataset.tab === this.tab);
    this.$('[data-act=reset]').textContent = this.tab === 'keys' ? '恢復預設按鍵' : '恢復預設';
    if (this.tab === 'keys') { this._renderKeys(); return; }
    const rows = this._rows().map((r) => {
      const desc = r.sub ? `<small class="st-sub">${esc(r.sub(s[r.key], s))}</small>` : r.desc ? `<small>${esc(r.desc)}</small>` : '';
      const label = `<div class="st-l"><b>${esc(r.zh)}</b>${desc}</div>`;
      let ctl = '';
      if (r.type === 'slider') {
        // in the row's display unit (CS2 sensitivity: min / max / value scaled, a 0.01 step)
        const k = this._unit(r), min = +(r.min * k).toFixed(2), max = +(r.max * k).toFixed(2), step = k === 1 ? r.step : 0.01, v = +(s[r.key] * k).toFixed(4);
        const val = r.edit
          ? `<input class="st-val st-num" type="number" min="${min}" max="${max}" step="${step}" value="${r.fmt(v)}" data-key="${r.key}" aria-label="${esc(r.zh)}數值">`
          : `<span class="st-val">${r.fmt(v)}</span>`;
        ctl = `<div class="st-slider"><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-key="${r.key}" aria-label="${esc(r.zh)}">${val}</div>`;
      } else if (r.type === 'toggle') {
        const on = r.live ? r.live() : !!s[r.key];
        ctl = `<button class="st-toggle${on ? ' on' : ''}" data-act="toggle" data-key="${r.key}" role="switch" aria-checked="${on}" aria-label="${esc(r.zh)}"><i></i></button>`;
      } else if (r.type === 'seg') {
        ctl = `<div class="fe-seg">${r.opts.map(([v, zh]) => `<button data-act="seg" data-key="${r.key}" data-v="${v}" class="${s[r.key] === v ? 'on' : ''}">${zh}</button>`).join('')}</div>`;
      } else if (r.type === 'colors') {
        ctl = `<div class="st-colors">${XH_COLORS.map((c) => `<button data-act="color" data-v="${c}" class="${s.xhColor === c ? 'on' : ''}" style="--sw:${c}" aria-label="${c}"><i></i></button>`).join('')}</div>`;
      }
      return `<div class="st-row">${label}${ctl}</div>`;
    }).join('');
    // crosshair preview stays pinned at the top of the pane while its rows scroll underneath
    const extra = this.tab === 'xh' ? '<div class="st-row st-sticky"><div class="st-l"><b>預覽</b><small>實際大小</small></div><div class="st-xhprev"><div class="xp-bg"></div><div class="xp-xh"></div></div></div>' : '';
    const qNote = this.tab === 'gfx' && this.app.qualityLock ? '<p class="st-note">網址參數 ?q= 已鎖定畫質。</p>' : '';
    let autoNote = '';
    if (this.tab === 'gfx' && s.quality === 'auto' && !this.app.qualityLock) {
      const a = autoInfo(), zh = (q) => QUALITY_OPTS.find((o) => o[0] === q)[1];
      const ms = Object.entries(a.ms || {}).map(([q, v]) => `${zh(q)} ${v} ms`).join('、');
      const why = COARSE ? '' : `　·　${esc(gpuShort(a.gpu) || '未知顯示卡')}${ms ? `　·　每幀測試：${ms}` : ''}`;
      // the test renders the menu backdrop: offered from the menus, not mid-match
      const g = this.app.game, recal = !COARSE && this.app.calibrateQuality && g?.bdReady && !g.player;
      autoNote = `<p class="st-note">目前自動選擇：<b>${zh(a.q)}</b>${why}${recal ? '<button class="fe-btn sm" data-act="recal">重新測試</button>' : ''}</p>`;
    }
    this.pane.innerHTML = extra + rows + qNote + autoNote;
    for (const r of this.pane.querySelectorAll('input[type=range]')) this._fill(r);
    if (this.tab === 'xh') this._preview();
  }

  _renderKeys() {
    const ctrl = BIND_GROUPS.some((g) => g.rows.some(([a]) => bindsOf(a).some((c) => /^Control/.test(c))));
    const help = `<p class="st-note kb-help">點擊按鍵欄位後，按下新的按鍵或滑鼠中鍵／側鍵<i></i>${keyCap('Delete')} 清除<i></i>${keyCap('Escape')} 取消<i></i>已被使用的按鍵會與該動作互換</p>`;
    const groups = BIND_GROUPS.map((g) => `<div class="kb-gh"><b>${esc(g.zh)}</b><small>${g.en}</small></div>` + g.rows.map(([a, zh, o]) => {
      if (o?.fixed) {
        return `<div class="st-row kb-row"><div class="st-l"><b>${esc(zh)}</b></div><div class="kb-keys">${keyCap(o.fixed, ' fixed')}<span class="kb-lock">${ICON.lock}固定</span></div></div>`;
      }
      const [k0, k1] = bindsOf(a);
      const cap = (code, i) => `<button class="kb-cap${i ? ' alt' : ''}${code ? '' : ' empty'}" data-act="bind" data-a="${a}" data-s="${i}" aria-label="${esc(zh)}${i ? '（次要）' : ''}：${esc(bindLabel(code) || '未設定')}">${code ? esc(bindLabel(code)) : '—'}</button>`;
      return `<div class="st-row kb-row${!k0 && !k1 ? ' unbound' : ''}" data-a="${a}"><div class="st-l"><b>${esc(zh)}${!k0 && !k1 ? '<em>未設定</em>' : ''}</b></div><div class="kb-keys">${cap(k0, 0)}${cap(k1, 1)}</div></div>`;
    }).join('')).join('');
    const note = ctrl ? '<p class="st-note">提示：瀏覽器的 Ctrl＋W 會關閉分頁。開啟「畫面 › 全螢幕」可鎖定鍵盤避免誤觸，或改用 C 蹲下。</p>' : '';
    this.pane.innerHTML = help + groups + note;
  }

  _capture(btn) {
    const { a } = btn.dataset, slot = +btn.dataset.s;
    for (const b of this.pane.querySelectorAll('.kb-cap.cap')) b.classList.remove('cap');
    btn.classList.add('cap');
    btn.textContent = '按下按鍵…';
    captureKey((code) => {
      let flash = null;
      if (code === 'Delete' || code === 'Backspace') clearBind(a, slot);
      else if (code) {
        const r = setBind(a, slot, code);
        if (!r.ok) this.app.toast(r.reason === 'mouse-move' ? '移動不能使用滑鼠按鍵' : `「${bindLabel(code) || code}」是保留按鍵，無法指派`, 2200);
        else if (r.swapped) {
          this.app.toast(`「${bindLabel(code)}」原屬於「${bindName(r.swapped.action)}」，${r.swapped.code ? `已互換為「${bindLabel(r.swapped.code)}」` : '該動作已移除此按鍵'}`, 3200);
          flash = r.swapped.action;
        }
      }
      this.render();
      this.pane.querySelector(`.kb-cap[data-a="${a}"][data-s="${slot}"]`)?.focus({ preventScroll: true });
      if (flash) this.pane.querySelector(`.kb-row[data-a="${flash}"]`)?.classList.add('flash');
    });
  }

  _fill(r) {
    const p = ((+r.value - +r.min) / (+r.max - +r.min)) * 100;
    r.style.setProperty('--p', p.toFixed(1) + '%');
  }

  _preview() {
    const box = this.pane.querySelector('.xp-xh');
    if (!box) return;
    const s = this.app.settings.v;
    const L = s.xhSize, T = s.xhThick, G = s.xhGap, c = s.xhColor;
    const bar = (w, h, x, y) => `<i style="width:${w}px;height:${h}px;left:${x}px;top:${y}px;background:${c}"></i>`;
    box.innerHTML = bar(T, L, -T / 2, -G - L) + bar(T, L, -T / 2, G) + bar(L, T, -G - L, -T / 2) + bar(L, T, G, -T / 2)
      + (s.xhDot ? bar(2, 2, -1, -1) : '');
  }
}
