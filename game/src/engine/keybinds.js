// Rebindable controls (settings 按鍵). The live bindings are engine/input.js KEYMAP (KeyboardEvent.code -> action)
// and MOUSEMAP (button -> action); this module edits them in place, so Input and the HUD key hints (ui/keyhints.js,
// which read the same maps) follow every change without knowing about rebinding.
//   - Each listed action has two slots (primary / secondary), like CS. A key taken from another action swaps: that
//     action gets this action's previous key in the same slot (or loses the key when there was none).
//   - Fire / aim stay on the left / right mouse button, weapon cycling on the wheel and the menu on Esc (fixed rows);
//     the middle and side mouse buttons can carry any non-movement action.
//   - Actions this layer does not list (another module's, or not wired up yet) keep their default keys unless a listed
//     action claims the key.
// Persisted in localStorage 'cf.binds' as { v, binds: { action: [code, code] } } ('' = empty slot, 'Mouse<n>' = button).
//
//   initBinds()                    snapshot the shipped maps, then apply the saved bindings (App constructor)
//   bindsOf(action)                [primary, secondary]
//   setBind(action, slot, code)    -> { ok, swapped: { action, code } | null, reason? }
//   clearBind(action, slot), resetBinds(), onBindsChange(fn)
//   captureKey(onKey)              routes the next key / extra mouse button to onKey(code) (Esc -> onKey(null));
//                                  capturing() is true meanwhile (main.js then leaves Esc alone)
//   bindLabel(code)                '空白鍵', 'Q', '滑鼠 4'...
import { KEYMAP, MOUSEMAP } from './input.js';
import { keyLabel } from '../ui/keyhints.js';

const KEY = 'cf.binds';

/** Rows of the settings tab: [action, zh] or a fixed row { fixed: label }. */
export const BIND_GROUPS = [
  { zh: '移動', en: 'MOVEMENT', rows: [['f', '前進'], ['b', '後退'], ['l', '向左移動'], ['r', '向右移動'], ['jump', '跳躍'], ['crouch', '蹲下']] },
  { zh: '戰鬥', en: 'COMBAT', rows: [
    ['fire', '開火', { fixed: 'Mouse0' }], ['alt', '瞄準／武器副攻擊', { fixed: 'Mouse2' }],
    ['reload', '換彈'], ['special', '武器特殊技'], ['grenade', '投擲手雷'], ['inspect', '檢視武器'],
    ['next', '切換武器', { fixed: 'Wheel' }],
  ] },
  { zh: '武器欄', en: 'WEAPON SLOTS', rows: [['slot1', '主武器'], ['slot2', '副武器'], ['slot3', '近戰武器'], ['slot4', '武器欄 4'], ['slot5', '武器欄 5']] },
  { zh: '其他', en: 'OTHER', rows: [['use', '互動／救援'], ['buy', '購買選單'], ['pause', '選單', { fixed: 'Escape' }]] },
];
const ROWS = BIND_GROUPS.flatMap((g) => g.rows);
/** Actions the player can rebind (in display order). */
export const BINDABLE = ROWS.filter((r) => !r[2]?.fixed).map((r) => r[0]);
const MOVES = new Set(['f', 'b', 'l', 'r']);
const SET = new Set(BINDABLE);
// keys a page cannot (or must not) take: the menu key, OS / browser keys
const RESERVED = new Set(['Escape', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'ContextMenu', 'F5', 'F11', 'F12', 'PrintScreen', 'Mouse0', 'Mouse2']);
const MOUSE_NAMES = { Mouse0: '滑鼠左鍵', Mouse1: '滑鼠中鍵', Mouse2: '滑鼠右鍵', Mouse3: '滑鼠 4', Mouse4: '滑鼠 5', Wheel: '滑鼠滾輪' };

let shipped = null;   // { keys, mouse }: the maps as input.js ships them
let binds = {};       // action -> [code, code]
const listeners = new Set();

export function bindLabel(code) {
  if (!code) return '';
  return MOUSE_NAMES[code] || (code.startsWith('Numpad') ? 'Num ' + keyLabel(code) : keyLabel(code));
}

/** Fixed rows: the key they show. */
export function fixedKey(action) { return ROWS.find((r) => r[0] === action)?.[2]?.fixed || ''; }

function fromMaps() {
  const out = {};
  for (const a of BINDABLE) out[a] = [];
  for (const [code, a] of Object.entries(KEYMAP)) if (SET.has(a)) out[a].push(code);
  for (const [b, a] of Object.entries(MOUSEMAP)) if (SET.has(a)) out[a].push('Mouse' + b);
  for (const a of BINDABLE) out[a] = [out[a][0] || '', out[a][1] || ''];
  return out;
}

/** Writes `binds` into KEYMAP / MOUSEMAP: listed actions in display order, primary first (keyFor() = primary). */
function apply() {
  const claimed = new Set(Object.values(binds).flat().filter(Boolean));
  for (const code of Object.keys(KEYMAP)) if (code !== 'Escape' && (SET.has(KEYMAP[code]) || claimed.has(code))) delete KEYMAP[code];
  for (const b of Object.keys(MOUSEMAP)) if (b !== '0' && b !== '2' && (SET.has(MOUSEMAP[b]) || claimed.has('Mouse' + b))) delete MOUSEMAP[b];
  for (const a of BINDABLE) {
    for (const code of binds[a]) {
      if (!code) continue;
      if (code.startsWith('Mouse')) MOUSEMAP[code.slice(5)] = a; else KEYMAP[code] = a;
    }
  }
}

function changed() {
  apply();
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, binds })); } catch { /* private mode */ }
  for (const fn of listeners) fn();
  window.dispatchEvent(new Event('cf-binds'));
}

export function initBinds() {
  if (shipped) return;
  shipped = { keys: { ...KEYMAP }, mouse: { ...MOUSEMAP } };
  binds = fromMaps();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* defaults */ }
  if (saved?.binds) {
    const valid = (a, c) => typeof c === 'string' && (!c || (!RESERVED.has(c) && !(MOVES.has(a) && c.startsWith('Mouse'))));
    const used = new Set();
    for (const a of BINDABLE) {
      const s = saved.binds[a];
      if (!Array.isArray(s)) continue;
      // a key saved on two actions (hand-edited storage) stays on the first one
      binds[a] = [0, 1].map((i) => (valid(a, s[i]) && !used.has(s[i]) ? s[i] : ''));
      for (const c of binds[a]) if (c) used.add(c);
    }
    apply();
  }
}

export function bindsOf(action) { return binds[action] || ['', '']; }
export function onBindsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** True when the code is bound to some listed action other than `except`. */
function ownerOf(code, except) {
  for (const a of BINDABLE) if (a !== except && binds[a].includes(code)) return a;
  return null;
}

export function setBind(action, slot, code) {
  if (!SET.has(action) || !code) return { ok: false };
  if (RESERVED.has(code)) return { ok: false, reason: 'reserved' };
  if (MOVES.has(action) && code.startsWith('Mouse')) return { ok: false, reason: 'mouse-move' };
  const cur = binds[action];
  if (cur[slot] === code) return { ok: true, swapped: null };
  const prev = cur[slot];
  let swapped = null;
  const other = ownerOf(code);
  if (other === action) {
    // the key already sits in this action's other slot: swap the two slots
    cur[1 - slot] = prev;
  } else if (other) {
    const os = binds[other].indexOf(code);
    // the other action takes our previous key, unless it is a mouse button it cannot use
    const give = prev && !(MOVES.has(other) && prev.startsWith('Mouse')) ? prev : '';
    binds[other][os] = give;
    swapped = { action: other, code: give };
  }
  cur[slot] = code;
  binds[action] = cur;
  changed();
  return { ok: true, swapped };
}

export function clearBind(action, slot) {
  if (!SET.has(action) || !binds[action][slot]) return;
  binds[action][slot] = '';
  changed();
}

export function resetBinds() {
  if (!shipped) return;
  for (const k of Object.keys(KEYMAP)) delete KEYMAP[k];
  for (const k of Object.keys(MOUSEMAP)) delete MOUSEMAP[k];
  Object.assign(KEYMAP, shipped.keys);
  Object.assign(MOUSEMAP, shipped.mouse);
  binds = fromMaps();
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
  for (const fn of listeners) fn();
  window.dispatchEvent(new Event('cf-binds'));
}

/** Listed actions with no key at all (shown in red in settings). */
export function unboundActions() { return BINDABLE.filter((a) => !binds[a][0] && !binds[a][1]); }

/** Primary key of an action for UI text ('' when unbound): bound, fixed, or ''. */
export function primaryKey(action) { return binds[action]?.[0] || binds[action]?.[1] || fixedKey(action); }

// ---------------------------------------------------------------- key capture (settings)

let capture = null;
export const capturing = () => !!capture;

/**
 * Hands the next key press (or middle / side mouse button) to onKey(code); Esc cancels with onKey(null). The events
 * are swallowed (Input, menus and the browser never see them). Returns a cancel function.
 */
export function captureKey(onKey) {
  stopCapture();
  const done = (code) => { stopCapture(); onKey(code); };
  const key = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') done(null);
    else if (e.code) done(e.code);
  };
  const mouse = (e) => {
    if (e.button === 1 || e.button === 3 || e.button === 4) { e.preventDefault(); e.stopImmediatePropagation(); done('Mouse' + e.button); }
  };
  const swallow = (e) => { if (e.button === 1 || e.button === 3 || e.button === 4) { e.preventDefault(); e.stopImmediatePropagation(); } };
  window.addEventListener('keydown', key, true);
  window.addEventListener('mousedown', mouse, true);
  window.addEventListener('mouseup', swallow, true);
  window.addEventListener('auxclick', swallow, true);
  capture = () => {
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('mousedown', mouse, true);
    // the button's mouseup / auxclick (browser back / forward) arrives after the capture ended
    setTimeout(() => { window.removeEventListener('mouseup', swallow, true); window.removeEventListener('auxclick', swallow, true); }, 400);
  };
  return stopCapture;
}

export function stopCapture() {
  const c = capture;
  capture = null;
  c?.();
}
