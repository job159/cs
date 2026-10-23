// SVG crosshair registry, crosshair-anchored skill meters, tier frames and the ★ skill-button face
// (docs/PREMIUM_WEAPONS.md §1.9, §1.2). Everything is stroke-only with a hollow centre; states are shape-coded as
// well as coloured (colour-blind safe): hit = arms grow 1.15x, ready = 4 nodes light in turn, meters each have
// their own geometry, tiers their own icon shape.
//
//   registerCrosshair(id, { draw(gap, c, s, c2) -> SVG markup (centre 0,0, px; c2 = second colour), dynamic: redraw on gap changes,
//                           state: () => string (redraw when it changes: a bow's draw stage, its arrows),
//                           nodes: radius of the 4 ready nodes, hit: hit-reactive (default true) })
//     parts with class "a" take the hit colour; the default 'xh_default' follows the settings (colour, size, dot)
//     settings.dot puts the centre dot on every crosshair (the user wants it always there), in its own group so it can stay
//     while the rest is hidden (melee, ADS); its size follows crosshairThick
//   new CrosshairView(parent) .update({ id, gap, settings, color, color2, hitColor, react, ready, active, nodes, visible, dot })  .hit()
//     dot (default = visible): show the centre dot even when visible is false
//     classes on the <svg>: hit, ready, act (a skill / buff running)
//   new MeterView(type, index) .set(m)        m from specials.hudInfo(): arc ring segments timing dial stack lock dual
//   TIERS, tierIcon(tier, size, color)        tier frame colours and icon shapes (§1.2)
//   new StarView(el, { size, key })  .update(star, hex, tier)  .burst()   the ★ face (touch button / desktop dock)
//   injectCSS(id, css)                        one <style> per id
const NS = 'http://www.w3.org/2000/svg';

export function injectCSS(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id; s.textContent = css;
  document.head.appendChild(s);
}

// ---------------------------------------------------------------------------------------------------- tiers
// §1.2: base / main edge / top highlight / bottom shade + the shape that carries the tier without colour
export const TIERS = {
  standard: { zh: '制式', base: '#2a2c30', edge: '#8b9099', hi: '#c7cbd2', lo: '#5a5e66', shape: 'square' },
  anti: { zh: '反災', base: '#14262e', edge: '#1fb5d6', hi: '#9ef2ff', lo: '#0e6f86', shape: 'hex' },
  exotic: { zh: '異能', base: '#1d1430', edge: '#9b5cff', hi: '#e2cbff', lo: '#5a2fb0', shape: 'diamond' },
  legacy: { zh: '傳承', base: '#1e1610', edge: '#e8b54a', hi: '#f0c9a0', lo: '#6a3d1c', shape: 'shield' },
  mythic: { zh: '神兵', base: '#2a1410', edge: '#e8b54a', edge2: '#c8102e', hi: '#fff1b8', lo: '#8a4a14', shape: 'sun' },
};
const poly = (n, r, rot = 0) => Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * Math.PI * 2; return `${(Math.sin(a) * r).toFixed(2)},${(-Math.cos(a) * r).toFixed(2)}`; }).join(' ');
function star(n, r0, r1, rot = 0) { return Array.from({ length: n * 2 }, (_, i) => { const a = rot + (i / (n * 2)) * Math.PI * 2, r = i & 1 ? r1 : r0; return `${(Math.sin(a) * r).toFixed(2)},${(-Math.cos(a) * r).toFixed(2)}`; }).join(' '); }
/** Outline of a tier's shape around (0,0) with outer radius r (SVG markup, stroke only). */
export function tierShape(tier, r, attrs = '') {
  const s = TIERS[tier]?.shape || 'square';
  if (s === 'square') return `<rect x="${-r * 0.8}" y="${-r * 0.8}" width="${r * 1.6}" height="${r * 1.6}" rx="${r * 0.12}" ${attrs}/>`;
  if (s === 'hex') return `<polygon points="${poly(6, r, Math.PI / 6)}" ${attrs}/>`;
  if (s === 'diamond') return `<polygon points="${poly(4, r)}" ${attrs}/>`;
  if (s === 'shield') return `<path d="M0 ${-r} L${r * 0.85} ${-r * 0.62} V${r * 0.05} C${r * 0.85} ${r * 0.55} ${r * 0.4} ${r * 0.85} 0 ${r} C${-r * 0.4} ${r * 0.85} ${-r * 0.85} ${r * 0.55} ${-r * 0.85} ${r * 0.05} V${-r * 0.62} Z" ${attrs}/>`;
  return `<polygon points="${star(8, r, r * 0.78, Math.PI / 8)}" ${attrs}/>`;   // 八芒日輪
}
/** Button frame: a ring in the element colour with 4 small tier-shape studs on the diagonals (shape-coded skin). */
export function tierRing(tier, r, color, attrs = '') {
  const studs = [1, 3, 5, 7].map((i) => { const a = i * Math.PI / 4; return `<g transform="translate(${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)})">${tierShape(tier, 3.4, 'fill="rgba(10,12,14,.8)"')}</g>`; }).join('');
  return `<g fill="none" stroke="${color}" ${attrs}><circle r="${r}" stroke-width="1.4"/>${studs}</g>`;
}
export function tierIcon(tier, size = 16, color) {
  const t = TIERS[tier] || TIERS.standard;
  return `<svg viewBox="-12 -12 24 24" width="${size}" height="${size}">${tierShape(tier, 10, `fill="${t.base}" stroke="${color || t.edge}" stroke-width="2"`)}</svg>`;
}

// ------------------------------------------------------------------------------------------------ crosshairs
export const CROSSHAIRS = {};
export function registerCrosshair(id, spec) { CROSSHAIRS[id] = { dynamic: true, hit: true, nodes: 22, ...spec }; return CROSSHAIRS[id]; }

const OL = 'stroke="rgba(0,0,0,.55)" stroke-width="1" paint-order="stroke"';
const centreDot = (c, s) => { const T = Math.max(2, s.crosshairThick ?? 2); return `<rect class="a" x="${-T / 2}" y="${-T / 2}" width="${T}" height="${T}" fill="${c}" ${OL}/>`; };
// CS four-line, follows the settings; the arms are the hit-reactive parts
registerCrosshair('xh_default', {
  draw(gap, c, s) {
    const L = s.crosshairLen ?? 9, T = s.crosshairThick ?? 2, g = gap;
    const r = (x, y, w, h) => `<rect class="a" x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" ${OL}/>`;
    return r(-T / 2, -g - L, T, L) + r(-T / 2, g, T, L) + r(-g - L, -T / 2, L, T) + r(g, -T / 2, L, T);
  },
  nodes: 0,
});
// thin notched ring with 4 short inner ticks (generic exotic)
registerCrosshair('xh_ring', {
  draw(gap, c) {
    const R = 12 + gap * 0.6, q = Math.PI / 2, seg = (a) => { const a0 = a + 0.28, a1 = a + q - 0.28; return `M${(Math.sin(a0) * R).toFixed(1)} ${(-Math.cos(a0) * R).toFixed(1)} A${R} ${R} 0 0 1 ${(Math.sin(a1) * R).toFixed(1)} ${(-Math.cos(a1) * R).toFixed(1)}`; };
    const ticks = [0, 1, 2, 3].map((i) => { const a = i * q; return `M${(Math.sin(a) * (R - 5)).toFixed(1)} ${(-Math.cos(a) * (R - 5)).toFixed(1)} L${(Math.sin(a) * (R + 1)).toFixed(1)} ${(-Math.cos(a) * (R + 1)).toFixed(1)}`; }).join(' ');
    return `<path class="a" d="${[0, 1, 2, 3].map((i) => seg(i * q)).join(' ')}" fill="none" stroke="${c}" stroke-width="1.5"/><path class="a" d="${ticks}" stroke="${c}" stroke-width="2"/>`;
  },
  nodes: 24,
});
// circle with side brackets (generic heavy / launcher)
registerCrosshair('xh_bracket', {
  draw(gap, c) {
    const R = 10 + gap * 0.5, B = R + 9;
    const br = (sx) => `<path class="a" d="M${sx * (B - 4)} -9 Q${sx * B} 0 ${sx * (B - 4)} 9" fill="none" stroke="${c}" stroke-width="2"/>`;
    return `<circle cx="0" cy="0" r="${R}" fill="none" stroke="${c}" stroke-width="1.3" opacity=".85"/>` + br(1) + br(-1);
  },
  nodes: 26,
});
// four gem diamonds at the cardinal points over a hairline circle (generic mythic)
registerCrosshair('xh_gem', {
  draw(gap, c) {
    const R = 13 + gap * 0.6;
    const gem = (x, y) => `<polygon class="a" points="${x},${y - 3.6} ${x + 2.6},${y} ${x},${y + 3.6} ${x - 2.6},${y}" fill="none" stroke="${c}" stroke-width="1.5"/>`;
    return `<circle cx="0" cy="0" r="${R}" fill="none" stroke="${c}" stroke-width="1" opacity=".7"/>` + gem(0, -R) + gem(0, R) + gem(-R, 0) + gem(R, 0);
  },
  nodes: 25,
});

const nodeMarkup = (r) => [0, 1, 2, 3].map((i) => { const a = Math.PI / 4 + i * Math.PI / 2, x = (Math.sin(a) * r).toFixed(1), y = (-Math.cos(a) * r).toFixed(1);
  return `<polygon class="nd" style="--i:${i}" points="${x},${(+y - 3).toFixed(1)} ${(+x + 3).toFixed(1)},${y} ${x},${(+y + 3).toFixed(1)} ${(+x - 3).toFixed(1)},${y}"/>`; }).join('');

export class CrosshairView {
  constructor(parent) {
    this.el = document.createElementNS(NS, 'svg');
    this.el.setAttribute('class', 'xh2');
    this.el.setAttribute('viewBox', '-80 -80 160 160');
    this.body = document.createElementNS(NS, 'g');
    this.nodesG = document.createElementNS(NS, 'g');
    this.nodesG.setAttribute('class', 'nds');
    this.dotG = document.createElementNS(NS, 'g');
    this.el.append(this.body, this.nodesG, this.dotG);
    parent.appendChild(this.el);
    this.key = ''; this.nodeKey = ''; this.dotKey = ''; this.hitT = 0; this.readyOn = false; this.bodyOn = true;
  }
  /** Hit frame: arms take the hit colour and grow to 1.15x for 90 ms (§1.9 #1). */
  hit() { this.hitT = 0.09; }
  update(dt, { id = 'xh_default', gap = 4, settings = {}, color = '#4dff6a', color2 = color, hitColor = '#ffffff', react = false, ready = false, active = false, nodes = false, visible = true, dot = visible }) {
    const showDot = !!settings.dot && dot;
    this.el.style.opacity = visible || showDot ? '' : '0';
    if (visible !== this.bodyOn) { this.bodyOn = visible; this.body.style.display = this.nodesG.style.display = visible ? '' : 'none'; }
    const dk = showDot ? `${color}|${settings.crosshairThick}` : '';
    if (dk !== this.dotKey) { this.dotKey = dk; this.dotG.innerHTML = dk ? centreDot(color, settings) : ''; }
    if (!visible && !showDot) return;
    const spec = CROSSHAIRS[id] || CROSSHAIRS.xh_default;
    const g = Math.round(gap);
    const key = `${id}|${spec.dynamic ? g : 0}|${color}|${color2}|${settings.crosshairLen}|${settings.crosshairThick}|${spec.state ? spec.state() : ''}`;
    if (visible && key !== this.key) { this.key = key; this.body.innerHTML = spec.draw(g, color, settings, color2); }
    const nk = nodes && spec.nodes ? `${spec.nodes}` : '';
    if (nk !== this.nodeKey) { this.nodeKey = nk; this.nodesG.innerHTML = nk ? nodeMarkup(spec.nodes) : ''; }
    if (ready !== this.readyOn) { this.readyOn = ready; this.el.classList.toggle('ready', ready); }
    if (active !== this.actOn) { this.actOn = active; this.el.classList.toggle('act', active); }
    this.hitT = Math.max(0, this.hitT - dt);
    const h = react && this.hitT > 0;
    if (h !== this._h) { this._h = h; this.el.classList.toggle('hit', h); this.el.style.setProperty('--hit', hitColor); }
  }
}

// ---------------------------------------------------------------------------------------------------- meters
const arcPath = (r, a0, a1) => { const p = (a) => `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`; return `M${p(a0)} A${r} ${r} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} ${a1 > a0 ? 1 : 0} ${p(a1)}`; };
const D2R = Math.PI / 180;

/** One crosshair-anchored meter (60 % opacity mirror of the weapon's own gauge, §1.1). */
export class MeterView {
  constructor(type, index = 0) {
    this.type = type; this.i = index;
    const el = this.el = document.createElementNS(NS, 'svg');
    el.setAttribute('class', 'mt mt-' + type);
    el.setAttribute('viewBox', '-80 -80 160 160');
    const side = index % 2 ? -1 : 1;
    let html = '';
    if (type === 'arc') {
      // left of the crosshair (a second arc mirrors to the right); full = 2 flashes
      const a0 = side > 0 ? 220 * D2R : 140 * D2R, a1 = side > 0 ? 320 * D2R : 40 * D2R;
      const d = arcPath(31, a0, a1);
      html = `<path class="tr" d="${d}"/><path class="fl" d="${d}" pathLength="100"/>`;
    } else if (type === 'ring') {
      const r = 22 + index * 6;
      html = `<circle class="tr" r="${r}"/><circle class="fl" r="${r}" pathLength="100" transform="rotate(-90)"/>`;
    } else if (type === 'dual') {
      html = '<circle class="in" r="9"/><circle class="out" r="20"/>';
    } else if (type === 'lock') {
      html = '<g class="br"></g>';
    } else if (type === 'dial') {
      const x = 46 * side;
      html = `<g transform="translate(${x} 14)"><path class="tr" d="${arcPath(13, -90 * D2R, 90 * D2R)}"/><path class="fl" d="${arcPath(13, -90 * D2R, 90 * D2R)}" pathLength="100"/><line class="nd2" x1="0" y1="0" x2="0" y2="-11"/></g>`;
    }
    el.innerHTML = html;
    this.fl = el.querySelector('.fl'); this.nd = el.querySelector('.nd2'); this.out = el.querySelector('.out'); this.br = el.querySelector('.br');
    this.cache = '';
  }
  set(m) {
    const v = Math.max(0, Math.min(1, m.value || 0)), t = this.type;
    const key = `${t}|${(v * 200) | 0}|${m.ready ? 1 : 0}|${m.color}|${m.raw | 0}|${m.max}|${m.segments}|${m.window}`;
    if (key === this.cache) return;
    this.cache = key;
    const el = this.el;
    el.style.setProperty('--mc', m.color || '#fff');
    el.classList.toggle('full', !!m.ready);
    if (t === 'arc' || t === 'ring') this.fl.style.strokeDasharray = `${(v * 100).toFixed(1)} 100`;
    else if (t === 'dial') { this.fl.style.strokeDasharray = `${(v * 100).toFixed(1)} 100`; this.nd.setAttribute('transform', `rotate(${(-90 + v * 180).toFixed(1)})`); }
    else if (t === 'dual') this.out.setAttribute('r', (12 + v * 34).toFixed(1));
    else if (t === 'lock') {
      // four corner brackets closing from 40 px to 13 px as the lock builds
      const r = 40 - v * 27, L = 6;
      this.br.innerHTML = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => `<path d="M${sx * r} ${sy * (r - L)} V${sy * r} H${sx * (r - L)}"/>`).join('');
    } else if (t === 'segments') {
      const n = Math.max(1, Math.min(16, m.segments || m.max || 5)), lit = Math.floor(((m.raw ?? v * n) / (m.max || n)) * n + 1e-6);
      const w = n > 8 ? 5 : 8, gapS = 2.5, x0 = -((n * (w + gapS)) - gapS) / 2, y = 40 + this.i * 9;
      el.innerHTML = Array.from({ length: n }, (_, i) => `<polygon class="${i < lit ? 'on' : 'off'}" points="${x0 + i * (w + gapS) + 1.5},${y} ${x0 + i * (w + gapS) + w + 1.5},${y} ${x0 + i * (w + gapS) + w - 1.5},${y + 5} ${x0 + i * (w + gapS) - 1.5},${y + 5}"/>`).join('');
    } else if (t === 'stack') {
      const n = Math.max(1, Math.min(10, m.max || 5)), lit = Math.round((m.max || 5) > 10 ? v * n : m.raw ?? v * n), x0 = -((n - 1) * 8) / 2, y = -40 - this.i * 9;
      el.innerHTML = Array.from({ length: n }, (_, i) => `<path class="${i < lit ? 'on' : 'off'}" d="M${x0 + i * 8 - 3} ${y + 2} L${x0 + i * 8} ${y - 2} L${x0 + i * 8 + 3} ${y + 2}"/>`).join('');
    } else if (t === 'timing') {
      // centre timing bar with the window zone(s) and the travelling needle (Impulse-Flail style)
      const W = 110, y = 46 + this.i * 10, x0 = -W / 2, wins = Array.isArray(m.window?.[0]) ? m.window : m.window ? [m.window] : [];
      el.innerHTML = `<rect class="tr2" x="${x0}" y="${y}" width="${W}" height="5"/>` + wins.map(([a, b], i) => `<rect class="win${i ? ' w2' : ''}" x="${x0 + a * W}" y="${y - 2}" width="${(b - a) * W}" height="9"/>`).join('') +
        `<rect class="ndl" x="${x0 + v * W - 1.5}" y="${y - 4}" width="3" height="13"/>`;
    }
  }
}

// ---------------------------------------------------------------------------------------------------- ★ face
/** The skill button face: tier frame, ult meter ring, long-press ring (0.35 s), ready shimmer, need %. */
export class StarView {
  constructor(el, { size = 50, key = '' } = {}) {
    this.el = el;
    el.classList.add('sv');
    el.insertAdjacentHTML('beforeend', `<svg class="sv-f" viewBox="-30 -30 60 60"><g class="sv-frame"></g>
      <circle class="sv-tr" r="26"/><circle class="sv-ult" r="26" pathLength="100" transform="rotate(-90)"/>
      <circle class="sv-hold" r="22" pathLength="100" transform="rotate(-90)"/><circle class="sv-cd" r="11" pathLength="100" transform="rotate(-90)"/>
      <g class="sv-shim"><path d="${arcPath(26, -0.5, 0.5)}"/><path d="${arcPath(26, Math.PI - 0.5, Math.PI + 0.5)}"/></g></svg>
      <b class="sv-need"></b>${key ? `<i class="sv-key">${key}</i>` : ''}`);
    this.frame = el.querySelector('.sv-frame'); this.ult = el.querySelector('.sv-ult'); this.hold = el.querySelector('.sv-hold');
    this.cdEl = el.querySelector('.sv-cd'); this.need = el.querySelector('.sv-need');
    this.k = {};
  }
  _s(k, v, fn) { if (this.k[k] !== v) { this.k[k] = v; fn(v); } }
  update(st, hex = {}, tier = 'anti') {
    const el = this.el;
    this._s('vis', !!st?.has, (v) => el.classList.toggle('sv-on', v));
    if (!st?.has) return;
    const color = hex.rim || '#ffd27a';
    this._s('frame', tier + color, () => { this.frame.innerHTML = tierRing(tier, 28.5, color, 'class="sv-fr"'); el.style.setProperty('--sc', color); el.style.setProperty('--sc2', hex.core || color); });
    this._s('ult', Math.round((st.ultFrac || 0) * 100), (v) => { this.ult.style.strokeDasharray = `${v} 100`; });
    this._s('hold', Math.round((st.holdFrac || 0) * 100), (v) => { this.hold.style.strokeDasharray = `${v} 100`; el.classList.toggle('sv-holding', v > 0); });
    this._s('cd', Math.round((st.cd || 0) * 100), (v) => { this.cdEl.style.strokeDasharray = `${v} 100`; });
    const ready = !!(st.ult || st.tap && !st.need), dim = !st.tap && !st.ult && !st.active;
    this._s('ready', ready, (v) => el.classList.toggle('sv-ready', v));
    this._s('ultr', !!st.ult, (v) => el.classList.toggle('sv-ult-ready', v));
    this._s('dim', dim, (v) => el.classList.toggle('sv-dim', v));
    this._s('act', !!st.active, (v) => el.classList.toggle('sv-active', v));
    // not castable: grey + the % still missing (§1.8)
    const need = dim && st.why === 'meter' || dim && st.why === 'cd' ? Math.ceil((st.need || 0) * 100) + '%' : '';
    this._s('need', need, (v) => { this.need.textContent = v; });
  }
  /** Denied: a short shake; cast: 6-10 UI sparks (§1.9 #7). */
  shake() { this.el.classList.remove('sv-shake'); void this.el.offsetWidth; this.el.classList.add('sv-shake'); }
  burst(n = 8) {
    const c = getComputedStyle(this.el).getPropertyValue('--sc') || '#ffd27a';
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'sv-p';
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, d = 34 + Math.random() * 22;
      p.style.cssText = `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;background:${c}`;
      this.el.appendChild(p);
      setTimeout(() => p.remove(), 520);
    }
  }
}

injectCSS('cf-xh', `
.xh2 { position: fixed; left: 50%; top: 50%; width: 160px; height: 160px; margin: -80px 0 0 -80px; overflow: visible; pointer-events: none; transition: opacity .12s, transform .09s; filter: drop-shadow(0 0 1px rgba(0,0,0,.85)); }
.xh2 .a { transition: fill .05s, stroke .05s; }
.xh2.hit { transform: scale(1.15); }
.xh2.hit .a[fill]:not([fill="none"]) { fill: var(--hit); }
.xh2.hit .a[stroke]:not([stroke^="rgba"]) { stroke: var(--hit); }
.xh2 .nd { fill: none; stroke: rgba(255,255,255,.35); stroke-width: 1.2; }
.xh2.ready .nd { fill: var(--rc, #ffd27a); stroke: #fff; animation: xhNode .26s calc(var(--i) * 80ms) both; }
@keyframes xhNode { 0% { transform: scale(.2); opacity: 0; } 60% { transform: scale(1.6); opacity: 1; } 100% { transform: scale(1); } }
.mts { position: fixed; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; opacity: .62; }
.mt { position: absolute; left: -80px; top: -80px; width: 160px; height: 160px; overflow: visible; }
.mt .tr, .mt .tr2 { fill: none; stroke: rgba(255,255,255,.2); stroke-width: 3; }
.mt .tr2 { fill: rgba(0,0,0,.35); stroke: rgba(255,255,255,.35); stroke-width: 1; }
.mt .fl { fill: none; stroke: var(--mc); stroke-width: 3; stroke-linecap: round; filter: drop-shadow(0 0 2px var(--mc)); }
.mt-ring .tr, .mt-ring .fl { stroke-width: 2; }
.mt.full .fl { animation: mtFull .5s 2; }
@keyframes mtFull { 50% { stroke: #fff; stroke-width: 5; } }
.mt .on { fill: var(--mc); stroke: #fff; stroke-width: .6; }
.mt .off { fill: rgba(0,0,0,.35); stroke: rgba(255,255,255,.45); stroke-width: .8; }
.mt-stack path.on { fill: none; stroke: var(--mc); stroke-width: 2.2; } .mt-stack path.off { fill: none; stroke-width: 1.4; }
.mt .win { fill: var(--mc); opacity: .55; } .mt .win.w2 { fill: #fff; opacity: .7; }
.mt .ndl { fill: #fff; }
.mt .in { fill: none; stroke: var(--mc); stroke-width: 1.4; } .mt .out { fill: none; stroke: var(--mc); stroke-width: 1; stroke-dasharray: 3 3; transition: r .15s; }
.mt .br path { fill: none; stroke: var(--mc); stroke-width: 2; } .mt.full .br path { stroke: #fff; }
.mt .nd2 { stroke: #fff; stroke-width: 1.6; }
.sv { position: relative; }
.sv .sv-f { position: absolute; inset: -12%; width: 124%; height: 124%; overflow: visible; pointer-events: none; }
.sv .sv-fr { stroke-width: 1.6; opacity: .75; }
.sv .sv-tr { fill: none; stroke: rgba(255,255,255,.14); stroke-width: 3; }
.sv .sv-ult { fill: none; stroke: var(--sc); stroke-width: 3; stroke-dasharray: 0 100; }
.sv .sv-hold { fill: none; stroke: #fff; stroke-width: 4; stroke-dasharray: 0 100; opacity: 0; }
.sv.sv-holding .sv-hold { opacity: 1; }
.sv .sv-cd { fill: none; stroke: rgba(0,0,0,.55); stroke-width: 22; stroke-dasharray: 0 100; }
.sv .sv-shim { opacity: 0; fill: none; stroke: #fff; stroke-width: 3.5; stroke-linecap: round; transform-origin: 0 0; }
.sv.sv-ult-ready .sv-shim, .sv.sv-ready .sv-shim { opacity: 1; animation: svSpin 1.4s linear infinite; filter: drop-shadow(0 0 3px var(--sc)); }
.sv.sv-ult-ready .sv-ult { stroke: var(--sc2); filter: drop-shadow(0 0 4px var(--sc)); }
@keyframes svSpin { to { transform: rotate(360deg); } }
.sv.sv-dim > svg:first-child { opacity: .4; }
.sv .sv-need { position: absolute; left: 0; right: 0; bottom: -15px; font: 700 11px var(--num); color: #fff; text-align: center; text-shadow: 0 1px 2px #000; pointer-events: none; }
.sv .sv-key { position: absolute; right: -6px; top: -7px; min-width: 9px; font: 700 11px/14px Arial, var(--font); text-align: center; color: #000; background: var(--sc); border-radius: 3px; padding: 0 3px; font-style: normal; text-shadow: none; }   /* (a condensed Q reads as 0) */
.sv.sv-active { box-shadow: 0 0 10px var(--sc); }
.sv.sv-shake { animation: svShake .28s; }
@keyframes svShake { 20% { transform: translateX(-4px) scale(var(--tb-scale, 1)); } 60% { transform: translateX(4px) scale(var(--tb-scale, 1)); } }
.sv .sv-p { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px; border-radius: 1px; pointer-events: none; animation: svP .5s ease-out forwards; box-shadow: 0 0 6px currentColor; }
@keyframes svP { to { transform: translate(var(--dx), var(--dy)) rotate(140deg) scale(.4); opacity: 0; } }
`);
