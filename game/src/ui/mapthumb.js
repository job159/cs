// Map thumbnails for the chapter cards, map cards and the loading screen. A map can ship a real image
// (registry `thumb`, 16:9); until it does, a stylised tactical plan is drawn as inline SVG from the
// registry's `plan` ('cross' | 'arena' | 'corner'): dark ground, streets, blocks, the defence point in
// the accent colour and red arrows where the infected come from. Original artwork, no game assets.
import { esc } from './kit.js';

const BG = '#101214', ROAD = '#262a2e', ROAD2 = '#1d2023', LINE = 'rgba(255,255,255,.16)', ACC = '#f2b544', RED = '#e5432f';
const BLOCKS = ['#3a2f27', '#33302b', '#2d3133', '#3b332a', '#2f2b27'];

const rect = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`;
const arrow = (x, y, rot) => `<path d="M-4 -3L4 0L-4 3z" fill="${RED}" transform="translate(${x} ${y}) rotate(${rot})"/>`;

function grid() {
  let s = '';
  for (let x = 10; x < 160; x += 10) s += `<path d="M${x} 0V90" stroke="rgba(255,255,255,.035)" stroke-width=".5"/>`;
  for (let y = 10; y < 90; y += 10) s += `<path d="M0 ${y}H160" stroke="rgba(255,255,255,.035)" stroke-width=".5"/>`;
  return s;
}

const PLANS = {
  /** Cross-shaped town blocks around a central intersection (失落之城). */
  cross() {
    let s = rect(0, 0, 160, 90, BG) + grid();
    // blocks in the four quadrants
    const q = [[8, 6, 26, 14], [38, 6, 22, 14], [8, 24, 52, 16], [100, 6, 22, 14], [126, 6, 26, 14], [100, 24, 52, 16],
      [8, 52, 30, 14], [42, 52, 18, 14], [8, 70, 52, 14], [100, 52, 18, 14], [122, 52, 30, 14], [100, 70, 52, 14]];
    q.forEach(([x, y, w, h], i) => { s += rect(x, y, w, h, BLOCKS[i % BLOCKS.length], ' stroke="rgba(0,0,0,.45)" stroke-width=".6"'); });
    // streets
    s += rect(64, 0, 32, 90, ROAD) + rect(0, 44, 160, 4, ROAD2) + rect(0, 40, 160, 12, ROAD);
    s += `<path d="M80 2V36M80 56V88M2 46H58M102 46H158" stroke="${LINE}" stroke-width=".8" stroke-dasharray="3 3"/>`;
    // crosswalks
    for (let i = 0; i < 5; i++) s += rect(67 + i * 6, 34, 3, 4, 'rgba(255,255,255,.18)') + rect(67 + i * 6, 54, 3, 4, 'rgba(255,255,255,.18)');
    // central container fort
    s += `<g transform="translate(80 46) rotate(45)"><rect x="-8" y="-8" width="16" height="16" fill="rgba(242,181,68,.16)" stroke="${ACC}" stroke-width="1.2"/>
      <rect x="-3" y="-3" width="6" height="6" fill="${ACC}"/></g>`;
    s += `<circle cx="80" cy="46" r="17" fill="none" stroke="rgba(242,181,68,.35)" stroke-width=".7" stroke-dasharray="2 2"/>`;
    s += arrow(80, 6, 90) + arrow(80, 84, -90) + arrow(6, 46, 0) + arrow(154, 46, 180);
    return s;
  },
  /** Walled square arena with crate rings and a raised platform (訓練場). */
  arena() {
    // the 80 m walled square at 2 units per metre, cropped to 16:9 around the centre
    let s = rect(0, 0, 160, 90, '#222528');
    for (let x = 8; x < 160; x += 8) s += `<path d="M${x} 0V90" stroke="rgba(255,255,255,.05)" stroke-width=".5"/>`;
    for (let y = 5; y < 90; y += 8) s += `<path d="M0 ${y}H160" stroke="rgba(255,255,255,.05)" stroke-width=".5"/>`;
    s += `<path d="M1.5 0V90M158.5 0V90" stroke="rgba(255,255,255,.28)" stroke-width="2"/>`;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, r = (9 + (i % 3) * 5) * 2;
      const x = 80 + Math.cos(a) * r, y = 45 + Math.sin(a) * r;
      s += `<rect x="${(x - 1.8).toFixed(1)}" y="${(y - 1.8).toFixed(1)}" width="3.6" height="3.6" fill="${i % 2 ? '#8a6a43' : '#6e5434'}" transform="rotate(${(a * 57.3).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }
    s += rect(36, 1, 16, 16, '#4a4842', ' stroke="rgba(255,255,255,.25)" stroke-width=".6"');
    s += `<circle cx="80" cy="45" r="3" fill="${ACC}"/><circle cx="80" cy="45" r="9" fill="none" stroke="rgba(242,181,68,.45)" stroke-width=".7" stroke-dasharray="2 2"/>`;
    s += arrow(12, 8, 30) + arrow(148, 8, 150) + arrow(12, 82, -30) + arrow(148, 82, -150);
    return s;
  },
  /** One street corner (kit test). */
  corner() {
    let s = rect(0, 0, 160, 90, BG) + grid();
    s += rect(14, 8, 56, 30, BLOCKS[0]) + rect(96, 8, 54, 30, BLOCKS[2]) + rect(14, 58, 56, 26, BLOCKS[1]);
    s += rect(0, 40, 160, 16, ROAD) + rect(72, 0, 22, 90, ROAD);
    s += `<path d="M2 48H70M96 48H158M83 2V38M83 58V88" stroke="${LINE}" stroke-width=".8" stroke-dasharray="3 3"/>`;
    s += `<circle cx="83" cy="48" r="3" fill="${ACC}"/>`;
    return s;
  },
};

/** Thumbnail HTML for a map: its image when it has one, otherwise the generated plan. */
export function mapThumb(info, cls = '') {
  if (info?.thumb) return `<span class="mthumb ${cls}"><img src="${esc(info.thumb)}" alt="" loading="lazy" decoding="async"></span>`;
  const plan = PLANS[info?.plan] || PLANS.arena;
  return `<span class="mthumb ${cls}"><svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${plan()}</svg></span>`;
}
