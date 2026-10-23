// HUD key hints (desktop): small CS2-style keycaps beside the HUD elements they act on -- [B] 商店 by the money,
// [Esc] 選單, [1]-[5] on the weapon bar, [G] on the grenade row, [R] 換彈 by a low magazine, [2] 副武器 /
// [B] 補充彈藥 when the held weapon runs dry, [F] 檢視 by the
// weapon, [Q] / 長按 [Q] and the mouse buttons on the skill dock, [E] in use prompts. The keys come from the live
// bindings (engine/input.js KEYMAP / MOUSEMAP), so a rebinding shows up here. Hidden on touch layouts and when
// hud.settings.keyHints is false (#hud.kh-off: keycaps and pure key hints go, skill names stay).
//   keyFor(action)              KeyboardEvent.code / 'Mouse<n>' / 'Wheel' bound to the action, or null
//   keyLabel(code)              'Q', 'Esc', '空白鍵'...
//   keycap(action, cls)         '<kbd class="kc">Q</kbd>' (mouse buttons as a small mouse glyph); '' when unbound
//   hint(action, label, cls)    keycap + label as one '.kh' chip ('' when unbound)
//   keyify(text)                game text -> HTML: "按 E" / "按住 E" / "長按 ★" become the bound key's keycap
//                               (default-letter bindings resolve through the original map), the rest is escaped
//   bindSig()                   a string that changes whenever a binding does (cache key for built hint HTML)
//   new KeyHints({ money, mag, weapon })   the hint chips in those HUD rows; .update(state) once a frame (HUD.update)
import { KEYMAP, MOUSEMAP } from '../engine/input.js';
import { injectCSS } from './crosshairs.js';

// the shipped bindings: game text names keys by their default letter ("按 E 開啟補給箱")
const DEFAULT = Object.fromEntries(Object.entries(KEYMAP).map(([code, a]) => [code.replace(/^(Key|Digit)/, ''), a]));
const NAMES = {
  Space: '空白鍵', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', Backspace: '⌫', CapsLock: 'Caps',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
};
// symbols the touch-first text uses for the skill buttons
const GLYPH = { '★': 'special', '◎': 'alt' };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function keyFor(action) {
  for (const [code, a] of Object.entries(KEYMAP)) if (a === action) return code;
  for (const [b, a] of Object.entries(MOUSEMAP)) if (a === action) return 'Mouse' + b;
  if (action === 'next' || action === 'prev') return 'Wheel';
  return null;
}

export function keyLabel(code) {
  if (!code) return '';
  if (NAMES[code]) return NAMES[code];
  const m = /^(?:Key|Digit|Numpad)(.+)$/.exec(code);
  return m ? m[1] : code;
}

// 10 x 14 mouse: the bound button (or the wheel) lit
function mouseGlyph(code) {
  const b = code === 'Wheel' ? 'w' : +code.slice(5);
  const lit = b === 0 ? '<path class="on" d="M5 .8A4.2 4.2 0 0 0 .8 5v1.2H5z"/>' : b === 2 ? '<path class="on" d="M5 .8A4.2 4.2 0 0 1 9.2 5v1.2H5z"/>'
    : '<rect class="on" x="3.9" y="2.2" width="2.2" height="3.6" rx="1.1"/>';
  return `<svg viewBox="0 0 10 14">${lit}<rect x=".8" y=".8" width="8.4" height="12.4" rx="4.2"/><path d="M5 .8v5.4M.8 6.2h8.4"/></svg>`;
}

// built keycaps, per binding state (the HUD asks every frame)
const _caps = new Map();
let _capSig = '';
export function keycap(action, cls = '') {
  const sig = bindSig();
  if (sig !== _capSig) { _capSig = sig; _caps.clear(); }
  const memo = action + '|' + cls;
  let html = _caps.get(memo);
  if (html !== undefined) return html;
  const code = keyFor(action);
  if (!code) html = '';
  else if (code.startsWith('Mouse') || code === 'Wheel') html = `<kbd class="kc m${cls ? ' ' + cls : ''}">${mouseGlyph(code)}</kbd>`;
  else { const t = keyLabel(code); html = `<kbd class="kc${t.length > 1 ? ' w' : ''}${cls ? ' ' + cls : ''}">${esc(t)}</kbd>`; }
  _caps.set(memo, html);
  return html;
}

export function hint(action, label, cls = '') {
  const k = keycap(action);
  return k ? `<span class="kh${cls ? ' ' + cls : ''}">${k}${label ? `<span>${esc(label)}</span>` : ''}</span>` : '';
}

export function keyify(text) {
  const re = /(按住|長按|按)\s*([A-Z0-9]|[★◎])(?![A-Za-z0-9])\s*/g;
  let out = '', i = 0, m;
  while ((m = re.exec(text))) {
    const action = GLYPH[m[2]] || DEFAULT[m[2]];
    const k = action ? keycap(action) : '';
    // a leading plain "按" goes ("[E] 開啟補給箱", CS2 style); "按住" / "長按" and mid-sentence ones stay
    out += esc(text.slice(i, m.index)) + (k ? `${m[1] === '按' && !m.index ? '' : m[1] + ' '}${k}` : esc(m[0]));
    i = m.index + m[0].length;
    if (k && i < text.length) out += ' ';
  }
  return out + esc(text.slice(i));
}

let _sig = '', _sigAt = -1;
export function bindSig(now = performance.now()) {
  if (now - _sigAt > 1000) { _sigAt = now; _sig = Object.entries(KEYMAP).join() + '|' + Object.entries(MOUSEMAP).join(); }
  return _sig;
}

/**
 * The hint chips. Anchors come from the HUD: money row (shop, menu), magazine row (reload, fall-back weapon, ammo
 * refill), weapon row (inspect, fire mode), melee attack row. State per frame (HUD.update):
 *   { canBuy, shopDot, low, empty, reloadable, reloading, inspect, mode, melee: { light, heavy } | null,
 *     swap: { action, label } | null (held weapon dry mid-round), refill: { label, hot } | null (shop refill) }
 */
export class KeyHints {
  constructor(anchors) {
    const mk = (cls, parent, first = false) => { const d = document.createElement('span'); d.className = cls; first ? parent.prepend(d) : parent.appendChild(d); return d; };
    this.shop = mk('khs', anchors.money);
    this.menu = mk('khs faint', anchors.money);
    this.reload = mk('khs rl', anchors.mag, true);
    this.inspect = mk('khs', anchors.weapon, true);
    this.mode = mk('khs', anchors.weapon, true);
    this.melee = mk('khs ml', anchors.mag, true);
    this.swap = mk('khs rl', anchors.mag, true);
    this.refill = mk('khs rl', anchors.mag, true);
    this.k = {};
    this.sig = '';
  }

  _html(node, key, html) { if (this.k[key] !== html) { this.k[key] = html; node.innerHTML = html; } }
  _cls(node, key, cls, on) { const k = key + '.' + cls; if (this.k[k] !== on) { this.k[k] = on; node.classList.toggle(cls, on); } }

  update(s) {
    const sig = bindSig();
    if (sig !== this.sig) { this.sig = sig; this.k = {}; }
    this._html(this.shop, 'shop', hint('buy', '商店', s.shopDot ? 'dot' : ''));
    this._cls(this.shop, 'shop', 'dim', !s.canBuy);
    this._html(this.menu, 'menu', hint('pause', '選單'));
    // [R] 換彈: only once the magazine runs low; pulses, red when empty
    const rl = s.reloadable && s.low && !s.reloading;
    this._html(this.reload, 'rl', rl ? hint('reload', s.reloadLabel || '換彈', s.empty ? 'pulse hot' : 'pulse') : '');
    // dry mid-round: [2] 副武器 (firing again switches by itself: match.js _emptySwitch); [B] 補充彈藥 where we can buy
    this._html(this.swap, 'sw', s.swap ? hint(s.swap.action, s.swap.label, 'pulse hot') : '');
    this._html(this.refill, 'rf', s.refill ? hint('buy', s.refill.label, s.refill.hot ? 'pulse hot' : 'pulse') : '');
    this._html(this.inspect, 'insp', s.inspect ? hint('inspect', '檢視') : '');
    this._html(this.mode, 'mode', s.mode ? hint('special', s.mode) : '');
    const ml = s.melee;
    this._html(this.melee, 'ml', ml ? hint('fire', ml.light) + (ml.heavy ? hint('alt', ml.heavy) : '') : '');
  }
}

injectCSS('cf-kh', `
.kc { display: inline-flex; align-items: center; justify-content: center; flex: none; box-sizing: border-box; min-width: 17px; height: 17px; padding: 0 4px 1px; margin: 0;
  font: 700 11px/1 "Segoe UI", Arial, var(--font); letter-spacing: 0; font-style: normal; color: #f3efe6; text-shadow: none; vertical-align: middle;
  background: linear-gradient(180deg, rgba(64,66,70,.94), rgba(30,31,34,.94)); border: 1px solid rgba(255,255,255,.3); border-radius: 3px;
  box-shadow: inset 0 -2px 0 rgba(0,0,0,.38), 0 1px 2px rgba(0,0,0,.65); }
.kc.w { padding: 0 5px 1px; font-size: 10px; letter-spacing: .02em; }
.kc.m { width: 15px; min-width: 15px; padding: 0; }
.kc.m svg { width: 8px; height: 11.5px; overflow: visible; }
.kc.m svg rect:not(.on), .kc.m svg path:not(.on) { fill: none; stroke: currentColor; stroke-width: 1.2; opacity: .85; }
.kc.m svg .on { fill: var(--accent, #f2b544); stroke: none; }
.kc.ac { border-color: rgba(242,181,68,.85); color: #ffe6b0; box-shadow: inset 0 -2px 0 rgba(0,0,0,.38), 0 0 6px rgba(242,181,68,.45); }
.kh { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; font: 600 12px/17px var(--font); letter-spacing: .05em; color: #dcd7cd; text-shadow: 0 1px 2px #000; }
.khs { display: inline-flex; align-items: center; gap: 10px; transition: opacity .25s; }
.khs:empty { display: none; }
.khs.dim { opacity: .4; }
.khs.faint { opacity: .72; }
.kh.pulse .kc { animation: khPulse .9s ease-in-out infinite; }
.kh.pulse > span { color: #ffd98a; }
.kh.hot > span { color: #ff8a7a; }
.kh.hot .kc { --khc: #ff5a3d; }
.kh.dot > span::after { content: ''; display: inline-block; width: 6px; height: 6px; margin: 0 0 1px 5px; vertical-align: middle; border-radius: 50%;
  background: #f2b544; box-shadow: 0 0 6px rgba(242,181,68,.85); animation: khDot 1.6s ease-in-out infinite; }
@keyframes khDot { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
@keyframes khPulse { 0%, 100% { border-color: rgba(255,255,255,.3); box-shadow: inset 0 -2px 0 rgba(0,0,0,.38), 0 1px 2px rgba(0,0,0,.65); }
  50% { border-color: var(--khc, #f2b544); color: #fff; box-shadow: inset 0 -2px 0 rgba(0,0,0,.38), 0 0 8px var(--khc, #f2b544); } }
#hud.kh-off .kc, #hud.kh-off .kh, body.touch #hud .kc, body.touch #hud .kh { display: none !important; }
`);
