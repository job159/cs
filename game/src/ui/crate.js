// Supply crate opening (docs/PREMIUM_WEAPONS.md §3.9: free crates, published odds, pity; no paid crates, no money).
// The CS2-style reel: a horizontal strip of ~50 item cards (real-material thumbnails, the grade colour under each)
// slides under a gold centre line and slows to a stop on the item that was rolled -- the roll happens first and is
// saved before anything moves, so closing early never loses it. A tick per card crossing the line (synthesised:
// a filtered click whose pitch drops with the speed), a sting by grade on the stop, then the reveal: grade banner,
// name, wear, seed, 稱號 / 斬數計, and 收下 / 裝備 / 再開一箱. Esc / Enter / 略過 jump to the stop.
//   openCrate(app, { thumbs, crate, onReveal(res), onEquip(item), onClose(again) })
//   oddsTable(crateId) / pityRows(crateId)   published odds markup for the crate panel
import { el, esc } from './kit.js';
import { inventory, CRATES, DEFAULT_CRATE, crateContents, gradeChance, itemNames, GRADE_ORDER, gradeRank, dropWeapons, GROUPS } from './inventory.js';
import { GRADES, finishSwatch, wearGrade } from '../gfx/finishes.js';
import { weaponIcon } from './icons.js';
import { WEAPONS } from '../weapons/defs.js';

/** A chance as a short percentage: 55%, 2.2%, 0.0085%. */
export const pct = (p) => (p >= 0.1 ? (p * 100).toFixed(1) : p >= 0.01 ? (p * 100).toFixed(2) : p >= 0.001 ? (p * 100).toFixed(3) : (p * 100).toFixed(4)).replace(/\.?0+$/, '') + '%';

// ---------------------------------------------------------------- published odds

/**
 * Grade odds table + group notes (星渦 gem phases) of a crate. A grade also reachable through a group (神品: the 星渦
 * gem phases) shows its pool chance plus that path, so the row is the real total.
 */
export function oddsTable(id = DEFAULT_CRATE) {
  const c = CRATES[id], all = crateContents(c);
  const rows = GRADE_ORDER.filter((g) => c.odds[g] > 0).reverse().map((g) => {
    const G = GRADES[g], n = all.filter((r) => r.grade === g).length, { gemP } = gradeChance(c, g);
    return `<div class="co-row" style="--gc:${G.color}"><i></i><b>${G.zh}</b><small>${esc(G.en)}</small><span class="co-n">${n} 款</span><em>${pct(c.odds[g])}${gemP > 0 ? `<small>＋星渦寶石 ${pct(gemP)}</small>` : ''}</em></div>`;
  }).join('');
  const neb = GROUPS.nebula;
  return `${rows}<p class="co-note">星渦開出時有 ${pct(neb.gemChance)} 機率為寶石相（硃砂、天青、翡翠、墨玉，各 ${pct(neb.gemChance / neb.gems.length)}，品相為神品）；
    每件物品 ${pct(c.counter)} 機率附斬數計。槍械在 ${dropWeapons().length} 把制式槍中平均抽出，磨損與圖樣種子取得時決定。</p>`;
}
/** Pity rows: crates opened since the last item of at least that grade, out of the guarantee. */
export function pityRows(id = DEFAULT_CRATE) {
  const c = CRATES[id];
  return c.pity.map(([g, n]) => {
    const G = GRADES[g], k = inventory.crates.pity[g] | 0;
    return `<div class="cp-row" style="--gc:${G.color}"><span>每 ${n} 箱至少一件<b>${G.zh}</b></span><i><u style="width:${Math.min(100, (k / n) * 100).toFixed(1)}%"></u></i><em>${k} / ${n}</em></div>`;
  }).join('');
}

// ---------------------------------------------------------------- sound (synthesised on the UI bus)

function sfx(app) {
  const a = app.audio;
  try { a.unlock(); } catch { /* no audio */ }
  const ctx = a.ctx;
  if (!ctx) return { tick() {}, start() {}, land() {} };
  const out = a.buses?.ui || a.master || ctx.destination;
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const env = (g, t, a0, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a0); g.gain.exponentialRampToValueAtTime(0.0001, t + a0 + dec); };
  const tone = (f, t, { type = 'sine', vol = 0.2, a0 = 0.004, dec = 0.4, detune = 0 } = {}) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    env(g, t, a0, vol, dec);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + a0 + dec + 0.05);
  };
  const hiss = (t, { f = 3000, q = 1, vol = 0.2, a0 = 0.002, dec = 0.05, sweep = 0 } = {}) => {
    const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    if (sweep) bp.frequency.exponentialRampToValueAtTime(Math.max(80, f * sweep), t + a0 + dec);
    env(g, t, a0, vol, dec);
    s.connect(bp); bp.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.3); s.stop(t + a0 + dec + 0.05);
  };
  return {
    // a card under the line: a dry click + a short ping, a little lower as the reel slows
    tick(speed = 1) {
      const t = ctx.currentTime;
      hiss(t, { f: 2600 + 1400 * speed, q: 2.2, vol: 0.16 + 0.1 * speed, dec: 0.03 });
      tone(1250 + 500 * speed + Math.random() * 60, t, { type: 'triangle', vol: 0.05 + 0.04 * speed, dec: 0.05 });
    },
    // the case opens: a low thunk and an air sweep
    start() {
      const t = ctx.currentTime;
      tone(90, t, { type: 'sine', vol: 0.35, a0: 0.005, dec: 0.25 });
      hiss(t, { f: 900, q: 0.8, vol: 0.18, a0: 0.02, dec: 0.45, sweep: 4 });
    },
    // the stop: a chime that grows with the grade (an extra octave, a sub boom, a long shimmer)
    land(grade) {
      const t = ctx.currentTime + 0.02, r = gradeRank(grade);
      const base = [523.25, 587.33, 659.25, 698.46, 783.99, 880][r] || 523.25;
      const chord = r >= 4 ? [1, 1.25, 1.5, 2, 2.5] : r >= 2 ? [1, 1.25, 1.5, 2] : [1, 1.5];
      chord.forEach((k, i) => tone(base * k, t + i * (r >= 3 ? 0.07 : 0.05), { type: i % 2 ? 'triangle' : 'sine', vol: 0.12 + r * 0.02, dec: 0.8 + r * 0.25, detune: (i - 2) * 3 }));
      if (r >= 3) { tone(55, t, { vol: 0.35, a0: 0.01, dec: 0.9 }); hiss(t + 0.05, { f: 7000, q: 0.7, vol: 0.06 + r * 0.02, a0: 0.15, dec: 1.4 + r * 0.3 }); }
      if (r >= 5) { app.audio.play('level_up', { volume: 0.7 }); chord.forEach((k, i) => tone(base * k * 2, t + 0.45 + i * 0.09, { type: 'sine', vol: 0.07, dec: 1.6 })); }
    },
  };
}

// ---------------------------------------------------------------- reel

const N_CARDS = 54;
const DUR = 6.4;                  // s, CS2-like: quick start, long crawl at the end
const reelEase = (t) => 1 - Math.pow(1 - t, 4.2);

/** A filler item sampled from the crate's real odds, rarer grades a little over-shown (the reel's colour). */
function filler(contents, ws) {
  const w = contents.map((c) => Math.pow(c.p, 0.62));
  const tot = w.reduce((a, b) => a + b, 0);
  let x = Math.random() * tot, pick = contents[0];
  for (let i = 0; i < w.length; i++) { if ((x -= w[i]) < 0) { pick = contents[i]; break; } }
  return { item: ws[(Math.random() * ws.length) | 0]?.id || 'akm', finish: pick.finish, seed: (Math.random() * 1000) | 0, grade: pick.grade };
}
const lookOf = (it) => ({ weapon: it.item, finish: { id: it.finish, seed: it.seed, float: it.float ?? 0.05 } });

/**
 * The fallback card image: the weapon's silhouette filled with the finish swatch (until the real render lands),
 * turned like the renders (muzzle left), on a lit card with an outline so a dark finish still reads at the crawl.
 */
function silhouette(app, box, it) {
  box.style.setProperty('--sw', finishSwatch(it.finish));
  weaponIcon(app.renderer, WEAPONS[it.item]?.model || it.item, { w: 256, h: 96 }).then((u) => { if (u && box.isConnected) { box.style.setProperty('--sil', `url(${u})`); box.classList.add('sil'); } }, () => {});
}

/**
 * Opens one crate of `crate` with the reel inside `root` (the armory screen: the menu keys then stay inside it).
 * Returns false (and does nothing) without a crate. onReveal(res) once the reel stops; onEquip(item) for 裝備;
 * onClose(again) when the overlay goes (again: 再開一箱 was pressed).
 */
export function openCrate(app, { thumbs, root = app.feRoot, crate = DEFAULT_CRATE, onReveal, onEquip, onClose } = {}) {
  const res = inventory.openCrate(crate);
  if (!res) return false;
  const C = CRATES[crate], snd = sfx(app);
  const contents = crateContents(C), ws = dropWeapons();
  const win = N_CARDS - 8 - ((Math.random() * 3) | 0);
  // (res.item is the inventory item; the cards carry the weapon id)
  const won = { item: res.item.item, finish: res.finish, seed: res.seed, float: res.float, grade: res.grade, win: true };
  const cards = Array.from({ length: N_CARDS }, (_, i) => (i === win ? won : filler(contents, ws)));
  // real renders: the winner first, then every card within 10 of it (the slow crawl shows those), then a few of the
  // fast ones (reused across the strip); the rest keep their tinted silhouettes, a blur at that speed anyway
  const order = [win];
  for (let d = 1; d < N_CARDS; d++) { if (win - d >= 0) order.push(win - d); if (win + d < N_CARDS) order.push(win + d); }
  const looks = new Map();
  for (const i of order) { const c = cards[i], k = c.item + c.finish; if (!looks.has(k) && (Math.abs(i - win) <= 10 || looks.size < 24)) looks.set(k, c); }
  const ov = el(`<div class="cr-open" role="dialog" aria-label="開啟補給箱">
    <div class="cro-top"><span class="cro-k">${esc(C.zh)}</span><small>${esc(C.en)}</small></div>
    <div class="cro-reel"><div class="cro-strip"></div><i class="cro-mark"></i><i class="cro-fade l"></i><i class="cro-fade r"></i></div>
    <div class="cro-res"></div>
    <button class="cro-skip fe-btn ghost sm">略過<kbd class="kc">Esc</kbd></button>
  </div>`);
  const strip = ov.querySelector('.cro-strip');
  for (const c of cards) {
    const G = GRADES[c.grade] || GRADES.common;
    const n = el(`<div class="cro-card${c.win ? ' win-card' : ''}" style="--gc:${G.color}"><span class="cro-img"><img alt=""></span><i class="cro-bar"></i></div>`);
    const img = n.querySelector('.cro-img');
    silhouette(app, img, c);
    c.el = n; c.img = img;
    strip.appendChild(n);
  }
  for (const c of [...looks.values()].reverse()) {   // (each goes to the front of the queue: the winner ends up first)
    thumbs.get(lookOf(c), { front: true }).then((u) => {
      if (!u) return;
      for (const x of cards) if (x.item === c.item && x.finish === c.finish && x.img.isConnected) { x.img.querySelector('img').src = u; x.img.classList.add('ok'); }
    });
  }
  root.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('on'));

  // geometry: card pitch from the DOM, the stop lands at a random point inside the winner card
  let pitch = 0, x0 = 0, xEnd = 0, t = 0, lastIdx = -1, raf = 0, landed = false, closed = false;
  const measure = () => {
    const r = ov.querySelector('.cro-reel').getBoundingClientRect(), cr = cards[0].el.getBoundingClientRect(), cr1 = cards[1].el.getBoundingClientRect();
    pitch = cr1.left - cr.left;
    const cw = cr.width;
    x0 = r.width * 0.5 - cw * 0.5 - pitch * 2.5;   // starts with a few cards left of the line
    xEnd = r.width * 0.5 - (win * pitch + cw * 0.5) + (Math.random() - 0.5) * cw * 0.72;
  };
  const place = (x) => { strip.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`; };
  const step = (now) => {
    if (closed) return;
    const dt = Math.min(0.05, (now - (step.last || now)) / 1000);
    step.last = now;
    t = Math.min(1, t + dt / DUR);
    const e = reelEase(t), x = x0 + (xEnd - x0) * e;
    place(x);
    // a tick each time a card boundary passes the centre line
    const centre = ov.querySelector('.cro-reel').clientWidth * 0.5 - x;
    const idx = Math.floor(centre / pitch);
    if (idx !== lastIdx && lastIdx >= 0) snd.tick(Math.min(1, (1 - t) * 1.6));
    lastIdx = idx;
    if (t >= 1) { land(); return; }
    raf = requestAnimationFrame(step);
  };
  const land = () => {
    if (landed) return;
    landed = true;
    cancelAnimationFrame(raf);
    place(xEnd);
    ov.classList.add('landed');
    cards[win].el.classList.add('won');
    snd.land(res.grade);
    onReveal?.(res);
    setTimeout(() => !closed && reveal(), 650);
  };
  const reveal = () => {
    const it = res.item, nm = itemNames(it), G = GRADES[res.grade] || GRADES.common, wg = wearGrade(it.float);
    const more = inventory.crates.owned;
    const box = ov.querySelector('.cro-res');
    box.style.setProperty('--gc', G.color);
    box.innerHTML = `<div class="crr-card">
        <div class="crr-g"><i></i>${G.zh}<small>${esc(G.en)}</small>${res.pityGrade ? '<em class="crr-pity">保底</em>' : ''}</div>
        <div class="crr-n">${it.counter ? '<em class="st">斬數</em>' : ''}<b>${esc(nm.finish)}</b><small>${esc(nm.weapon)}　${esc(nm.weaponEn)}</small></div>
        ${nm.title ? `<div class="crr-chase">稀有圖樣　<b>${esc(nm.title)}</b></div>` : ''}
        <div class="crr-meta"><span>外觀 <b>${wg.zh}</b></span><span>磨損 <b>${it.float.toFixed(4)}</b></span><span>圖樣種子 <b>#${it.seed}</b></span></div>
        <div class="crr-btns">
          <button class="fe-btn" data-r="keep">收下</button>
          <button class="fe-btn pri" data-r="equip">裝備到${esc(nm.weapon)}</button>
          ${more > 0 ? `<button class="fe-btn" data-r="again">再開一箱<small>剩 ${more}</small></button>` : ''}
        </div></div>`;
    ov.classList.add('revealed');
    box.querySelector('[data-r="equip"]')?.focus?.();
  };
  const close = (again = false) => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', key, true);
    ov.classList.remove('on');
    setTimeout(() => ov.remove(), 220);
    onClose?.(again);
  };
  // (Esc reaches the armory screen's back(), which calls escape(): the app's capture listener takes it first)
  const key = (e) => { if ((e.key === 'Enter' || e.key === ' ') && !landed) { e.preventDefault(); land(); } };
  window.addEventListener('keydown', key, true);
  ov.querySelector('.cro-skip').addEventListener('click', () => (landed ? close() : land()));
  ov.querySelector('.cro-res').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    app.audio.play('ui_click');
    if (b.dataset.r === 'equip') { inventory.equip(res.item.uid); app.audio.play('ui_equip'); onEquip?.(res.item); close(); }
    else if (b.dataset.r === 'again') close(true);
    else close();
  });
  requestAnimationFrame(() => { measure(); place(x0); snd.start(); step.last = 0; raf = requestAnimationFrame(step); });
  return { result: res, skip: land, close, escape: () => (landed ? close() : land()), get landed() { return landed; } };
}
