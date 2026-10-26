// Armory 武器庫 (docs/PREMIUM_WEAPONS.md §1.2 item cards, §3 finishes, §3.8 phases, §3.9 crates, §4.3 軍械庫 UI).
//   收藏 COLLECTION  item cards of every finish and premium weapon (tier frames, grade colours, 斬數 / 稀有圖樣 /
//                    裝備中 / 新 marks), filters by weapon, grade and style family, a sort. The selected item stands on
//                    the 3D stage (showcase.js) with its wear bar, seed, rare pattern, 斬數計 and 裝備 / 試用 / 檢視;
//                    a premium weapon shows its 相 chips (本相, mastery-unlocked 相, a rolled 窯變) to preview / apply.
//   補給箱 CRATES    free crates earned by playing: count, progress to the next, published odds, pity, contents and
//                    recent earnings; 開啟 runs the reel (crate.js) over the stage.
//   武器圖鑑 CATALOG  every weapon of this build with its stats, standing on the stage in its equipped look.
// The stage is drawn by the game renderer behind the panels: while the armory is up the menu backdrop is paused
// (game.bdReady off) and the renderer's post chain wears the studio look; leave() gives both back and frees the GPU
// side (stage, thumbnails). Keys: F 檢視, E 裝備 / 卸下, Esc back (skips / closes the reel first).
import { Screen, header, esc, ICON } from './kit.js';
import { CATS, WEAPONS, listed, tierOf, skillText } from '../weapons/defs.js';
import { TIERS, tierIcon } from './crosshairs.js';
import { weaponIcon } from './icons.js';
import { primaryKey, bindLabel } from '../engine/keybinds.js';
import { hasMap } from '../world/maps/index.js';
import { GRADES, WEAR_GRADES, finishDef, finishSwatch, familyOf, FAMILIES, COLLECTIONS, phasesOf, kilnOf, phaseConfig, PHASE_UNLOCK } from '../gfx/finishes.js';
import { inventory, CRATES, DEFAULT_CRATE, EARN, crateContents, itemNames, gradeRank, GRADE_ORDER, premiumWeapons, dropWeapons, DYE, tradeOutcomes, stackKey, bestFirst } from './inventory.js';
import { Stage, Thumbs, primeThumbs } from './showcase.js';
import { openCrate, oddsTable, pityRows, pct } from './crate.js';

const kc = (t) => `<kbd class="kc">${esc(t)}</kbd>`;
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const SERIES = { jiuzi: '九子', twin: '光暗雙生', xingxiu: '星宿', sheri: '射日', leize: '雷澤', shanhai: '山海', qiming: '啟明工坊', antical: '反災' };

// ---------------------------------------------------------------- catalog helpers (the weapon list of the build)

const ARMORY_ORDER = ['rifle', 'smg', 'pistol', 'shotgun', 'mg', 'sniper', 'heavy', 'bow', 'staff', 'melee'];
const CAT_ZH = { bow: '弓', staff: '法杖', polearm: '長柄', thrown: '投擲武器' };
const catZh = (c) => CATS[c]?.zh || CAT_ZH[c] || c;
function catalogTabs() {
  const cats = new Set(listed().map((w) => w.cat).filter((c) => c && c !== 'grenade'));
  return [...ARMORY_ORDER.filter((c) => cats.has(c)), ...[...cats].filter((c) => !ARMORY_ORDER.includes(c))];
}
const RES_ZH = { arrow: '箭矢', arrows: '箭矢', mana: '法力', charge: '充能', charges: '充能', energy: '能量', ammo: '彈藥' };
function ammoTag(w) {
  const kind = w.resource?.kind || w.ammoKind || (w.cat === 'bow' ? 'arrow' : w.cat === 'staff' ? 'mana' : '');
  const res = RES_ZH[kind];
  if (w.cat === 'melee' && !w.resource) return '';
  if (res) {
    const max = w.resource?.max ?? w.mag;
    const regen = w.resource?.regen ? `　回復 ${w.resource.regen}/秒` : '';
    return max ? `${res} ${max}${w.reserve && !w.resource?.regen ? ` / ${Number.isFinite(w.reserve) ? w.reserve : '∞'}` : ''}${regen}` : res;
  }
  return w.mag ? `彈匣 ${w.mag} / ${Number.isFinite(w.reserve) ? w.reserve : '∞'}` : '';
}
const MODE_ZH = { auto: '全自動', semi: '半自動', burst: '點放', bolt: '栓動', pump: '泵動', melee: '近戰', single: '單發',
  charge: '蓄力', draw: '拉弓', channel: '引導', beam: '光束', throw: '投擲' };
function weaponStats(w) {
  const dmg = w.dmg || 0;
  const dps = (dmg * (w.pellets || 1) * (w.rpm || 60)) / 60;
  const acc = 1 - Math.min(1, ((w.spread?.[0] ?? 2) + (w.spread?.[1] ?? 0.5) * 2) / 9);
  return [['傷害', Math.min(1, Math.sqrt((dmg * (w.pellets || 1)) / 320))], ['射速', Math.min(1, (w.rpm || 60) / 1200)], ['輸出', Math.min(1, dps / 900)],
    ['精準', acc], ['機動', Math.min(1, ((w.speed ?? 5) - 3.6) / 2)]];
}
function weaponNums(w) {
  const rows = w.dmg ? [['傷害', w.pellets ? `${w.dmg}×${w.pellets}` : String(w.dmg)], ['爆頭', `×${w.head ?? 4}`]] : [];
  if (w.rpm && w.cat !== 'melee') rows.push(['射速', `${w.rpm}`]);
  if (w.reload) rows.push(['換彈', `${w.reload.toFixed(1)}s`]);
  if (w.speed) rows.push(['移速', `${w.speed.toFixed(1)}`]);
  if (w.range) rows.push(['距離', `${w.range[0]}–${w.range[1]}m`]);
  return rows;
}
/** style vars of a tier frame: --tc edge, --tb wash, --th highlight. */
function tierVars(tier) {
  const T = TIERS[tier] || TIERS.standard;
  return `--tc:${rgba(T.edge, tier === 'standard' ? 0.25 : 0.6)};--tb:${rgba(T.edge, 0.13)};--th:${T.hi};--te:${T.edge}${T.edge2 ? `;--te2:${T.edge2}` : ''}`;
}

// ---------------------------------------------------------------- looks

/** Stage / thumbnail look of an inventory item. */
const itemLook = (it, counter = false) => ({ weapon: it.item, finish: { id: it.finish, seed: it.seed, float: it.float }, counter: counter && it.counter?.on ? it.counter : null });
/** Look of a premium weapon in a phase (its kiln seed when it has a record). */
function premLook(def, phase) {
  const seed = tierOf(def) === 'mythic' ? inventory.premiumRec(def.id)?.kiln?.seed ?? null : null;
  return { weapon: def.id, premium: phaseConfig(def, phase, seed) };
}
/** What a weapon wears right now (catalog): its equipped item, or its phase. */
function equippedLook(def) {
  if (def.premium) return premLook(def, inventory.phaseOf(def.id).phase);
  const it = inventory.equippedItem(def.id);
  return it ? itemLook(it, true) : { weapon: def.id };
}
const phaseName = (def, phase) => (phase === 'kiln' ? kilnOf(def)?.zh : phasesOf(def)[phase | 0]?.zh) || '本相';
/** Every card look of the collection (premium weapons in their phase, the items). */
const allLooks = () => [...premiumWeapons().map((d) => premLook(d, inventory.phaseOf(d.id).phase)), ...inventory.items.map((it) => itemLook(it))];

// ---------------------------------------------------------------- warm-up behind the main menu

let warm = null;
/**
 * The collection's card images get ready while the main menu idles: what an earlier session saved comes off the disk
 * (no rendering), then the premium weapons' cards still missing render one at a time (their models are the slow
 * ones) -- only while the main menu is up and idle; a match load or the armory itself stops it.
 */
export function warmArmory(app) {
  if (warm) { warm.idle = performance.now(); return; }
  const w = warm = { idle: performance.now(), thumbs: null, t: 0 };
  const quiet = () => warm === w && app.state === 'menu' && !app.overlays.length && !app.dialogs.open && !app._calP && !app.loadingMatch && performance.now() - w.idle > 5000;
  const tick = async () => {
    if (warm !== w) return;
    if (!quiet() || !app.game?.bdReady) { w.t = setTimeout(tick, 1000); return; }
    await primeThumbs(allLooks());
    if (warm !== w) return;
    w.thumbs = new Thumbs(app.renderer, { gate: quiet });
    const todo = premiumWeapons().map((d) => premLook(d, inventory.phaseOf(d.id).phase)).filter((l) => !w.thumbs.now(l));
    await Promise.all(todo.map((l) => w.thumbs.get(l)));
    if (warm === w) stopWarm();
  };
  w.t = setTimeout(tick, 1500);
}
/** Ends the warm-up (the armory opens with its own renderer of cards); its materials are freed. */
export function stopWarm() {
  const w = warm;
  if (!w) return;
  warm = null;
  clearTimeout(w.t);
  w.thumbs?.dispose();
}

// ---------------------------------------------------------------- screen

export class Armory extends Screen {
  constructor(app) {
    super(app, 'armory av', `${header('武器庫', 'ARMORY', { right: '<button class="av-pill" data-act="tab" data-tab="crates" aria-label="補給箱"><i class="av-crate-ic"></i><span>補給箱</span><b class="av-pill-n">0</b></button>' })}
      <nav class="av-tabs fe-seg">
        <button data-act="tab" data-tab="collection"><b>收藏</b><small>COLLECTION</small><em class="av-dot n-new"></em></button>
        <button data-act="tab" data-tab="crates"><b>補給箱</b><small>CRATES</small><em class="av-dot n-crate"></em></button>
        <button data-act="tab" data-tab="catalog"><b>武器圖鑑</b><small>CATALOG</small></button>
      </nav>
      <div class="av-body">
        <section class="av-left fe-panel"></section>
        <section class="av-stage">
          <div class="av-tip">${ICON_ROTATE}<span>拖曳旋轉</span><i></i><span>滾輪縮放</span><i></i>${kc('F')}<span>檢視</span></div>
          <div class="av-busy"><i class="fe-spin"></i></div>
          <div class="av-info"></div>
        </section>
      </div>`);
    this.tab = 'collection';
    this.sel = null;                // 'i:<uid>' | 'p:<weapon>'
    this.preview = null;            // premium phase being previewed (not applied)
    this.filter = { weapon: 'all', grade: 'all', fam: 'all', sort: 'new' };
    this.cat = 'rifle'; this.wsel = 'akm';
    this.live = false;
    this.el.addEventListener('pointerdown', () => this.app.audio.unlock?.(), { capture: true });
    this._key = (e) => this._onKey(e);
    this._loop = (t) => this._frame(t);
  }

  // ------------------------------------------------------------ lifecycle
  enter(data) {
    const app = this.app;
    if (data?.tab) this.tab = data.tab;
    this.live = true;
    this._shownKey = ''; this._regionSet = false;   // a new stage: nothing on it yet
    stopWarm();
    this.stage = new Stage(app.renderer);
    this.stage.takePost();
    this.thumbs = new Thumbs(app.renderer);
    // the 最新 order holds while the screen is up: the 新 marks as they were on entering (a card looked at or equipped
    // keeps its place), plus what arrives meanwhile (crates opened, 合成)
    this.freshSnap = new Set(inventory.items.filter((it) => it.fresh).map((it) => it.uid));
    this.known = new Set(inventory.items.map((it) => it.uid));
    // card images an earlier visit saved: off the disk into the cards that are still placeholders
    primeThumbs(allLooks()).then((n) => { if (n && this.live) this._fillThumbs(); });
    this.unbindStage = this.stage.bind(this.$('.av-stage'));
    this.unsub = inventory.on((k) => { if (this.live && !this.reel) this._refresh(k); });
    window.addEventListener('keydown', this._key);
    // the canvas shows the stage now, also when the backdrop is still fading in
    this._bdLoading = document.body.classList.contains('bd-loading');
    document.body.classList.remove('bd-loading');
    this.ro = new ResizeObserver(() => this._region());
    this.ro.observe(this.$('.av-stage'));
    this.last = 0;
    this.raf = requestAnimationFrame(this._loop);
    this.render();
    // straight to 補給箱 (the results' 前往開啟): Enter opens one
    if (this.tab === 'crates') requestAnimationFrame(() => this.$('[data-act="open"]:not(:disabled)')?.focus({ preventScroll: true }));
    // the guns crate items can be for and the premium weapons: models download behind the screen (the cards'
    // silhouettes, thumbnails and the reel need them)
    for (const w of [...dropWeapons(), ...premiumWeapons()]) weaponIcon(app.renderer, w.model || w.id).catch(() => {});
  }

  leave() {
    this.live = false;
    cancelAnimationFrame(this.raf);
    this.reel?.close();
    this.reel = null;
    window.removeEventListener('keydown', this._key);
    this.unsub?.(); this.unbindStage?.();
    this.ro?.disconnect();
    this.io?.disconnect(); this.io = null;
    this.stage?.dispose(); this.stage = null;
    this.thumbs?.dispose(); this.thumbs = null;
    // the backdrop draws again (the loop re-pins its own resolution)
    const g = this._bdHeld;
    if (g && g === this.app.game && !g.player && g.worldP) g.bdReady = true;
    this._bdHeld = null;
    if (this._bdLoading && !this.app.game?.bdReady) document.body.classList.add('bd-loading');
    inventory.flush();
  }

  back() {
    if (this.reel) { this.reel.escape(); return true; }
    this.app.show('menu');
    return true;
  }

  /** The key legend under the panels (main.js): this tab's keys. */
  legend(item, arrows) {
    if (this.reel) return this.reel.landed ? item(['Enter'], '確認') + item(['Escape'], '關閉') : item(['Enter'], '略過') + item(['Escape'], '略過');
    if (this.tab === 'crates') return (inventory.crates.owned > 0 ? item(['Enter'], '開啟補給箱') : '') + item(['Escape'], '返回');
    if (this.tab === 'catalog') return arrows + item(['KeyF'], '檢視') + item(['Escape'], '返回');
    const e = this._entry();
    return arrows + item(['Enter'], '選擇') + item(['KeyF'], '檢視') + (e ? item(['KeyE'], e.kind === 'prem' ? '套用相' : inventory.isEquipped(e.it) ? '卸下' : '裝備') : '') + item(['Escape'], '返回');
  }

  _frame(now) {
    if (!this.live) return;
    this.raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, Math.max(0.001, (now - (this.last || now)) / 1000));
    this.last = now;
    const app = this.app, g = app.game;
    // the menu backdrop stays loaded but undrawn while the stage owns the canvas
    if (g && !g.player && g.bdReady) { g.bdReady = false; this._bdHeld = g; }
    if (app._calP || app.state !== 'armory' || !this.stage) return;   // a quality measurement renders the backdrop offscreen
    if (!this._regionSet) this._region();
    this.stage.frame(dt, app.time);
    this.$('.av-busy').classList.toggle('on', !!this.stage.loading);
  }

  /**
   * The stage frames the weapon in the part of the screen the panels leave free (above the info card); zoomed or
   * turned it may reach the whole stage below the tip line, never the gaps between the panels or the header.
   */
  _region() {
    const st = this.$('.av-stage'), info = this.$('.av-info'), tip = this.$('.av-tip');
    if (!st || !this.stage) return;
    const r = st.getBoundingClientRect(), ir = info.getBoundingClientRect(), tr = tip.getBoundingClientRect();
    const bottom = ir.height > 0 ? Math.min(r.bottom, ir.top) : r.bottom;
    const top = Math.max(r.top, tr.height > 0 ? tr.bottom + 4 : r.top);
    this.stage.setRegion({ left: r.left, top: r.top + r.height * 0.04, width: r.width, height: Math.max(40, bottom - r.top - r.height * 0.04) },
      { left: r.left, top, width: r.width, height: Math.max(40, r.bottom - top) });
    this._regionSet = true;
  }

  _onKey(e) {
    if (this.app.screen !== this || this.app.dialogs.open || this.app.overlays.length || e.ctrlKey || e.altKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (this.reel) return;
    if (e.code === 'KeyF') { e.preventDefault(); this.stage?.inspect(); }
    else if (e.code === 'KeyE' && this.tab === 'collection') { e.preventDefault(); this.onAct(this._entry()?.kind === 'prem' ? 'apply' : 'equip'); }
    // 補給箱: Enter opens one (the Enter keycap on 開啟) unless another action button has the focus -- the tab just
    // clicked keeps it, and the menu keys would only press that tab again
    else if (e.key === 'Enter' && this.tab === 'crates' && !e.repeat && !e.defaultPrevented) {
      const f = document.activeElement, act = f?.dataset?.act;
      if (f && f !== document.body && this.el.contains(f) && act && act !== 'tab' && act !== 'open') return;
      e.preventDefault(); e.stopPropagation();
      this._open();
    }
  }

  onAct(act, t) {
    if (act === 'tab') {
      if (this.tab !== t.dataset.tab) { this.tab = t.dataset.tab; this.render(); }
      if (this.tab === 'crates') requestAnimationFrame(() => this.$('[data-act="open"]:not(:disabled)')?.focus({ preventScroll: true }));
    }
    else if (act === 'pick') this._pick(t.dataset.key);
    else if (act === 'copy') this._pick('i:' + t.dataset.uid);
    else if (act === 'salvage') this._salvage(+t.dataset.uid);
    else if (act === 'dedupe') this._dedupe();
    else if (act === 'trade') this._trade();
    else if (act === 'fw') { this.filter.weapon = t.dataset.v; this._renderLeft(); }
    else if (act === 'fg') { this.filter.grade = t.dataset.v; this._renderLeft(); }
    else if (act === 'ff') { this.filter.fam = t.dataset.v; this._renderLeft(); }
    else if (act === 'fs') { this.filter.sort = t.dataset.v; this._renderLeft(); }
    else if (act === 'inspect') this.stage?.inspect();
    else if (act === 'equip') this._equip();
    else if (act === 'phase') { this.preview = t.dataset.v === 'kiln' ? 'kiln' : +t.dataset.v; this._show(); }
    else if (act === 'apply') this._applyPhase();
    else if (act === 'try') this._try();
    else if (act === 'open') this._open();
    else if (act === 'goto-crates') { this.tab = 'crates'; this.render(); }
    else if (act === 'ctab') { this.cat = t.dataset.tab; this.wsel = listed(this.cat)[0]?.id; this._renderLeft(); this._show(); }
    else if (act === 'wpick') { this.wsel = t.dataset.id; this._renderLeft(); this._show(); }
    else if (act === 'wdress') { const k = this._keyForWeapon(t.dataset.id); if (k) { this.tab = 'collection'; this.sel = k; this.filter.weapon = t.dataset.id; this.render(); } }
  }

  /** A card picked: the selection and its 新 mark change in place (no re-render: the grid keeps its scroll and images). */
  _pick(key) {
    if (key === this.sel && this.preview == null) return;
    this.sel = key; this.preview = null;
    // (a copy picked in the info card lights its stack's card)
    const uid = key.startsWith('i:') ? key.slice(2) : null;
    for (const c of this.$$('.iv-card')) c.classList.toggle('on', c.dataset.key === key || (!!uid && (c.dataset.uids || '').split(',').includes(uid)));
    const it = uid && inventory.get(+uid);
    // the 新 mark goes for the whole stack (its card shows one mark for all its copies)
    const fresh = it ? inventory.items.filter((x) => x.fresh && stackKey(x) === stackKey(it)) : [];
    if (fresh.length) {
      for (const x of fresh) inventory.markSeen(x.uid, true);
      const c = this.$('.iv-card.on');
      c?.classList.remove('fresh'); c?.querySelector('.nw')?.remove();
      this._badges();
    }
    this._show();
  }

  /** Items that arrived while the screen is up (crates, 合成) join the 最新 order as new. */
  _noteNew() { for (const it of inventory.items) if (!this.known.has(it.uid)) { this.known.add(it.uid); if (it.fresh) this.freshSnap.add(it.uid); } }

  _refresh(kind) {
    this._badges();
    this._noteNew();
    if (this.tab === 'crates' && kind === 'crates') this._renderLeft();
    else if (this.tab === 'collection' && (kind === 'items' || kind === 'equip' || kind === 'premium')) { this._renderLeft(); this._info(); }
  }

  // ------------------------------------------------------------ render
  render() {
    for (const b of this.$$('.av-tabs button')) b.classList.toggle('on', b.dataset.tab === this.tab);
    this.el.dataset.tab = this.tab;
    this._badges();
    this._renderLeft();
    this._show();
  }

  _badges() {
    const c = inventory.crates.owned, n = inventory.newCount;
    this.$('.av-pill-n').textContent = String(c);
    this.$('.av-pill').classList.toggle('has', c > 0);
    const dc = this.$('.n-crate'), dn = this.$('.n-new');
    dc.textContent = c > 0 ? String(c) : ''; dc.classList.toggle('on', c > 0);
    dn.textContent = n > 0 ? String(n) : ''; dn.classList.toggle('on', n > 0);
  }

  _renderLeft() {
    this.io?.disconnect(); this.io = null;
    const L = this.$('.av-left');
    // the same tab re-rendered (an equip, a new item, a filter): its lists keep their scroll
    const keep = this._leftTab === this.tab ? [...L.querySelectorAll('.fe-scroll')].map((n) => n.scrollTop) : null;
    this._leftTab = this.tab;
    if (this.tab === 'crates') L.innerHTML = this._cratesHTML();
    else if (this.tab === 'catalog') L.innerHTML = this._catalogHTML();
    else L.innerHTML = this._collectionHTML();
    if (this.tab === 'collection') this._renderGrid();
    if (this.tab === 'catalog') for (const box of L.querySelectorAll('.cg-card .ar-img')) this._icon(box, box.dataset.id);
    if (this.tab === 'crates') this._crateContents();
    if (keep) L.querySelectorAll('.fe-scroll').forEach((n, i) => { if (keep[i]) n.scrollTop = keep[i]; });
    // the selected card stays in sight (an equip / a filter re-sorted the grid)
    L.querySelector('.iv-card.on, .cg-card.on')?.scrollIntoView({ block: 'nearest' });
  }

  // ------------------------------------------------------------ collection
  /**
   * Grid entries: one per premium weapon, one per stack of items -- copies of a look (same gun and finish) stack under
   * the one worth showing (the equipped copy, else the best: rare pattern, 斬數計, lowest float) with a ×N mark.
   */
  _entries() {
    const out = [], stacks = new Map();
    for (const it of inventory.items) { const k = stackKey(it); if (!stacks.has(k)) stacks.set(k, []); stacks.get(k).push(it); }
    for (const copies of stacks.values()) {
      copies.sort(bestFirst);
      const it = copies.find((c) => inventory.isEquipped(c)) || copies[0], f = finishDef(it.finish);
      out.push({ kind: 'item', key: 'i:' + it.uid, it, copies, weapon: it.item, grade: f?.grade || 'common', fam: familyOf(it.finish),
        at: Math.max(...copies.map((c) => c.at)), float: it.float, fresh: copies.some((c) => this.freshSnap?.has(c.uid)) });
    }
    for (const def of premiumWeapons()) {
      const rec = inventory.premiumRec(def.id);
      out.push({ kind: 'prem', key: 'p:' + def.id, def, weapon: def.id, grade: null, fam: 'phase', at: rec?.at || 0, float: 0 });
    }
    return out;
  }

  _filtered() {
    const f = this.filter;
    let list = this._entries().filter((e) => (f.weapon === 'all' || e.weapon === f.weapon)
      && (f.grade === 'all' || e.grade === f.grade) && (f.fam === 'all' || e.fam === f.fam));
    const wOrder = (id) => { const i = Object.keys(WEAPONS).indexOf(id); return i < 0 ? 999 : i; };
    const sorts = {
      // (new: the 新 marks as they were when the screen opened -- a card looked at does not jump away)
      new: (a, b) => (b.kind === 'item') - (a.kind === 'item') || (b.fresh ? 1 : 0) - (a.fresh ? 1 : 0) || b.at - a.at || wOrder(a.weapon) - wOrder(b.weapon),
      grade: (a, b) => (b.kind === 'item') - (a.kind === 'item') || gradeRank(b.grade) - gradeRank(a.grade) || b.at - a.at,
      weapon: (a, b) => wOrder(a.weapon) - wOrder(b.weapon) || gradeRank(b.grade) - gradeRank(a.grade),
      wear: (a, b) => (b.kind === 'item') - (a.kind === 'item') || a.float - b.float,
    };
    return list.sort(sorts[f.sort] || sorts.new);
  }

  _collectionHTML() {
    const f = this.filter, all = this._entries();
    const weapons = [...new Set(all.map((e) => e.weapon))].sort((a, b) => Object.keys(WEAPONS).indexOf(a) - Object.keys(WEAPONS).indexOf(b));
    if (f.weapon !== 'all' && !weapons.includes(f.weapon)) f.weapon = 'all';
    const chip = (act, v, label, on, extra = '') => `<button class="av-chip${on ? ' on' : ''}" data-act="${act}" data-v="${v}"${extra}>${label}</button>`;
    const grades = GRADE_ORDER.map((g) => chip('fg', g, `<i style="background:${GRADES[g].color}"></i>${GRADES[g].zh}`, f.grade === g, ` title="${GRADES[g].zh} ${GRADES[g].en}"`)).join('');
    const fams = Object.entries(FAMILIES).filter(([k]) => all.some((e) => e.fam === k)).map(([k, v]) => chip('ff', k, v.zh, f.fam === k)).join('');
    const items = inventory.items.length;
    return `<div class="av-filters">
        <div class="av-frow"><span class="av-fl">武器</span><div class="av-chips fe-hscroll">${chip('fw', 'all', '全部', f.weapon === 'all')}${weapons.map((w) => chip('fw', w, esc(WEAPONS[w]?.zh || w), f.weapon === w)).join('')}</div></div>
        <div class="av-frow"><span class="av-fl">品相</span><div class="av-chips fe-hscroll">${chip('fg', 'all', '全部', f.grade === 'all')}${grades}</div></div>
        <div class="av-frow"><span class="av-fl">類型</span><div class="av-chips fe-hscroll">${chip('ff', 'all', '全部', f.fam === 'all')}${fams}${chip('ff', 'phase', '高階相', f.fam === 'phase')}</div></div>
        <div class="av-frow av-sort"><span class="av-fl">排序</span><div class="av-chips">${[['new', '最新'], ['grade', '品相'], ['weapon', '武器'], ['wear', '磨損']].map(([v, l]) => chip('fs', v, l, f.sort === v)).join('')}</div>
          <span class="av-count" title="塗裝 ${items} 件・高階武器 ${premiumWeapons().length} 把">塗裝 <b>${items}</b>　<span class="av-dye" title="分解塗裝取得，用於合成">${ICON_DYE}色料 <b>${inventory.dye}</b></span></span>
          <button class="av-chip av-trade" data-act="trade" title="${DYE.n} 件同品相塗裝 → 1 件高一階的塗裝">合成</button></div>
      </div>
      <div class="av-grid fe-scroll"></div>`;
  }

  _renderGrid() {
    const grid = this.$('.av-grid');
    if (!grid) return;
    const list = this._filtered();
    if (!this.sel || !this._entry()) this.sel = list[0]?.key || null;
    const empty = !inventory.items.length;
    grid.innerHTML = (empty ? `<div class="av-empty"><b>還沒有任何塗裝</b><p>完成對戰、清除回合與擊敗首領可累積補給點數，每 ${EARN.perCrate} 點獲得一個免費補給箱。</p>
        <button class="fe-btn pri" data-act="goto-crates">${inventory.crates.owned ? `開啟補給箱（${inventory.crates.owned}）` : '查看補給箱'}</button></div>` : '')
      + list.map((e) => this._cardHTML(e)).join('') + (list.length ? '' : (empty ? '' : '<div class="av-none">沒有符合篩選的物品</div>'));
    // real-material thumbnails for the cards that scroll into view
    this.io?.disconnect();
    this.io = new IntersectionObserver((ents) => {
      for (const en of ents) {
        if (!en.isIntersecting) continue;
        this.io.unobserve(en.target);
        this._thumb(en.target);
      }
    }, { root: grid, rootMargin: '120px' });
    for (const c of grid.querySelectorAll('.iv-card:not(.has-img)')) this.io.observe(c);
  }

  /** The card's image: the rendered thumbnail when it already exists (no reload flash), else filled in later. */
  _imgHTML(key) {
    const look = this._cardLook(key), u = look && this.thumbs?.now(look);
    return u ? `<span class="iv-img ok"><img alt="" src="${u}"></span>` : '<span class="iv-img"><img alt=""></span>';
  }
  _cardLook(key) {
    if (key.startsWith('i:')) { const it = inventory.get(+key.slice(2)); return it ? itemLook(it) : null; }
    const def = WEAPONS[key.slice(2)];
    return def ? premLook(def, inventory.phaseOf(def.id).phase) : null;
  }

  _cardHTML(e) {
    const on = e.key === this.sel || e.copies?.some((c) => 'i:' + c.uid === this.sel) ? ' on' : '';
    const img = this._imgHTML(e.key), has = img.includes(' ok') ? ' has-img' : '';
    if (e.kind === 'item') {
      const it = e.it, G = GRADES[e.grade] || GRADES.common, nm = itemNames(it), wg = WEAR_GRADES.find((g) => it.float < g.max) || WEAR_GRADES[4];
      const eq = inventory.isEquipped(it), n = e.copies.length, fresh = e.copies.some((c) => c.fresh);
      return `<button class="iv-card g-${e.grade}${on}${has}${eq ? ' eq' : ''}${fresh ? ' fresh' : ''}" data-act="pick" data-key="${e.key}" data-uids="${e.copies.map((c) => c.uid).join(',')}" style="--gc:${G.color};--sw:${finishSwatch(it.finish)}" aria-label="${esc(nm.full)}${n > 1 ? `，${n} 件` : ''}">
        <span class="iv-top">${it.counter?.on ? '<em class="st">斬數</em>' : ''}${nm.title ? `<em class="ch" title="稀有圖樣：${esc(nm.title)}">★ ${esc(nm.title)}</em>` : ''}${eq ? '<em class="eqm">裝備中</em>' : ''}${fresh ? '<em class="nw">新</em>' : ''}</span>
        ${n > 1 ? `<em class="iv-n2" title="同款 ${n} 件（顯示最佳的一件）">×${n}</em>` : ''}${img}
        <span class="iv-n"><small>${esc(nm.weapon)}</small><b>${esc(nm.finish.replace('．' + (nm.title || '#'), ''))}</b></span>
        <span class="iv-b"><span>${G.zh}</span><span>${wg.zh}</span></span></button>`;
    }
    const def = e.def, tier = tierOf(def), T = TIERS[tier], rec = inventory.premiumRec(def.id), ph = rec?.phase ?? 0;
    const n = phasesOf(def).length + (kilnOf(def) ? 1 : 0);
    const owned = [...phasesOf(def).map((_, i) => inventory.phaseUnlocked(def.id, i)), ...(kilnOf(def) ? [inventory.phaseUnlocked(def.id, 'kiln')] : [])].filter(Boolean).length;
    return `<button class="iv-card prem t-${tier}${on}${has}" data-act="pick" data-key="${e.key}" style="${tierVars(tier)};--gc:${T.edge}" aria-label="${esc(def.zh)}">
      <span class="iv-top"><span class="iv-tier">${tierIcon(tier, 13)}${T.zh}</span>${rec?.kiln?.special ? '<em class="kiln">窯變</em>' : ''}<em class="ph">相 ${owned}/${n}</em></span>
      ${img}
      <span class="iv-n"><small>${esc(SERIES[def.line] || T.zh)}</small><b>${esc(def.zh)}</b></span>
      <span class="iv-b"><span>${esc(phaseName(def, ph))}</span><span>${rec ? `熟練 ${rec.mastery.kills}` : '未取得'}</span></span></button>`;
  }

  /**
   * A card's image: the real-material render (queued), with the gun's silhouette in the meantime -- filled with the
   * finish swatch (items) or the tier colour (premium), the same way round as the render (muzzle left).
   */
  _thumb(card) {
    const box = card.querySelector('.iv-img'), look = this._cardLook(card.dataset.key);
    if (!look || !this.thumbs || box.classList.contains('ok')) return;
    box.classList.add('loading');
    const def = WEAPONS[look.weapon];
    if (def) {
      if (look.premium) box.style.setProperty('--sw', `linear-gradient(115deg, ${TIERS[tierOf(def)]?.hi || '#ddd'}, ${TIERS[tierOf(def)]?.edge || '#888'})`);
      weaponIcon(this.app.renderer, def.model || def.id).then((u) => { if (u && box.isConnected) { box.style.setProperty('--sil', `url(${u})`); box.classList.add('sil'); } }, () => {});
    }
    this.thumbs.get(look).then((u) => {
      if (!box.isConnected) return;
      box.classList.remove('loading');
      if (u) { box.querySelector('img').src = u; box.classList.add('ok', 'fade'); }
    });
  }
  /** Cards still on a placeholder whose image is ready now (it came off the disk). */
  _fillThumbs() {
    for (const c of this.$$('.iv-card:not(.has-img)')) {
      const box = c.querySelector('.iv-img'), look = this._cardLook(c.dataset.key), u = look && this.thumbs?.now(look);
      if (!u || box.classList.contains('ok')) continue;
      box.querySelector('img').src = u; box.classList.remove('loading'); box.classList.add('ok', 'fade'); c.classList.add('has-img');
    }
  }

  /** The selected entry (a copy picked inside a stack: the stack's entry with that copy). */
  _entry() {
    const s = this.sel;
    if (!s) return null;
    for (const e of this._entries()) {
      if (e.key === s) return e;
      if (e.copies?.some((c) => 'i:' + c.uid === s)) { const it = inventory.get(+s.slice(2)); return { ...e, key: s, it, float: it.float }; }
    }
    return null;
  }
  _keyForWeapon(id) {
    const def = WEAPONS[id];
    if (def?.premium && phasesOf(def).length) return 'p:' + id;
    const it = inventory.equippedItem(id) || inventory.itemsFor(id)[0];
    return it ? 'i:' + it.uid : null;
  }

  // ------------------------------------------------------------ stage + info card
  /** Puts the tab's subject on the stage and fills the info card. */
  _show() {
    const st = this.stage;
    if (!st) return;
    let look = null, grade = '#8b9099';
    if (this.tab === 'collection') {
      const e = this._entry();
      if (e?.kind === 'item') { look = itemLook(e.it, true); grade = GRADES[e.grade]?.color || grade; }
      else if (e?.kind === 'prem') { look = premLook(e.def, this.preview ?? inventory.phaseOf(e.def.id).phase); grade = TIERS[tierOf(e.def)]?.edge || grade; }
    } else if (this.tab === 'catalog') {
      const def = WEAPONS[this.wsel];
      if (def) { look = equippedLook(def); const it = !def.premium && inventory.equippedItem(def.id); grade = it ? GRADES[finishDef(it.finish)?.grade]?.color : TIERS[tierOf(def)]?.edge || grade; }
    } else {
      const last = this.lastOpened && inventory.get(this.lastOpened.uid);
      const it = last || inventory.items.slice().sort((a, b) => gradeRank(finishDef(b.finish)?.grade) - gradeRank(finishDef(a.finish)?.grade) || b.at - a.at)[0];
      look = it ? itemLook(it, true) : { weapon: 'akm', finish: { id: 'nebula_dusk', seed: 412, float: 0.012 } };
      grade = it ? GRADES[finishDef(it.finish)?.grade]?.color : GRADES.exquisite.color;
      this.showcased = it || null;
    }
    this._info();
    const key = look ? JSON.stringify([look.weapon, look.finish, look.premium?.phase, look.premium?.seed, !!look.counter]) : '';
    if (!look || key === this._shownKey) return;
    this._shownKey = key;
    st.show(look, { grade });
  }

  _info() {
    const box = this.$('.av-info');
    let html = '';
    if (this.tab === 'collection') {
      const e = this._entry();
      html = e?.kind === 'item' ? this._itemInfo(e.it, e.copies) : e?.kind === 'prem' ? this._premInfo(e.def) : '';
    } else if (this.tab === 'catalog') html = this._weaponInfo(WEAPONS[this.wsel]);
    else html = this._crateStageInfo();
    box.innerHTML = html;
    box.classList.toggle('on', !!html);
    const g = box.firstElementChild?.dataset.gc;
    if (g) box.style.setProperty('--gc', g);
    requestAnimationFrame(() => this._region());
  }

  _itemInfo(it, copies = [it]) {
    const f = finishDef(it.finish), G = GRADES[f?.grade] || GRADES.common, nm = itemNames(it), wg = WEAR_GRADES.find((g) => it.float < g.max) || WEAR_GRADES[4];
    const eq = inventory.isEquipped(it);
    const seg = WEAR_GRADES.map((g) => `<i class="w-${g.key}" style="flex:${(g.max - g.min).toFixed(2)}" title="${g.zh} ${g.min}–${g.max}"></i>`).join('');
    const [lo, hi] = f?.float || [0, 1];
    // copies of this look: one chip each (wear, marks; the best one first), 分解 for the rest
    const dupes = copies.length > 1 ? copies.slice(1).filter((c) => !inventory.isEquipped(c)) : [];
    const cps = copies.length > 1 ? `<div class="ai-cps"><span>同款 <b>×${copies.length}</b></span>${copies.map((c, i) => `<button class="ai-cp${c.uid === it.uid ? ' on' : ''}" data-act="copy" data-uid="${c.uid}">
        <b>${c.float.toFixed(4)}</b><small>${esc((WEAR_GRADES.find((g) => c.float < g.max) || WEAR_GRADES[4]).zh)}</small>${i === 0 ? '<em class="best">最佳</em>' : ''}${c.title ? '<em class="ch">★</em>' : ''}${c.counter?.on ? '<em class="st">斬</em>' : ''}${inventory.isEquipped(c) ? '<em class="eqm">裝備</em>' : ''}</button>`).join('')}
        ${dupes.length ? `<button class="fe-btn ghost sm ai-dd" data-act="dedupe" title="保留最佳的一件，其餘分解成色料">分解重複 ×${dupes.length}<small>${ICON_DYE}+${dupes.reduce((a, c) => a + (DYE.salvage[finishDef(c.finish)?.grade] || 1), 0)}</small></button>` : ''}</div>` : '';
    const src = it.src === 'trade' ? '<span>合成</span>' : it.src === DEFAULT_CRATE ? `<span>${esc(CRATES[DEFAULT_CRATE].zh)}</span>` : '';
    return `<div class="ai" data-gc="${G.color}">
      <div class="ai-k"><span class="ai-g">${G.zh}<small>${esc(G.en)}</small></span><span>${esc(COLLECTIONS[f?.collection]?.zh || '')}</span><span>${esc(FAMILIES[familyOf(it.finish)]?.zh || '')}</span>${src}</div>
      <div class="ai-n">${it.counter?.on ? '<em class="st">斬數</em>' : ''}<b>${esc(nm.finish.replace('．' + (nm.title || '#'), ''))}</b>${nm.title ? `<span class="ai-chase">．${esc(nm.title)}</span>` : ''}</div>
      <div class="ai-w">${esc(nm.weapon)}<small>${esc(nm.weaponEn)}</small></div>
      <div class="ai-wear"><div class="aw-h"><span>外觀</span><b>${wg.zh}</b><small>${esc(wg.en)}</small><code>${it.float.toFixed(6)}</code></div>
        <div class="aw-bar">${seg}<u style="left:${(it.float * 100).toFixed(2)}%"></u><s style="left:${(lo * 100).toFixed(1)}%;right:${((1 - hi) * 100).toFixed(1)}%"></s></div></div>
      <div class="ai-row"><span>圖樣種子<b>#${it.seed}</b></span>${nm.title ? `<span>稀有圖樣<b class="gold">${esc(nm.title)}</b></span>` : `<span>稀有圖樣<b class="dim">—</b></span>`}
        ${it.counter?.on ? `<span class="ai-kc">斬數計<b class="vfd">${String(Math.min(999999, it.counter.kills)).padStart(6, '0')}</b>${it.counter.boss ? `<small>首領 ${it.counter.boss}</small>` : ''}</span>` : ''}</div>
      ${cps}
      <div class="ai-btns">
        <button class="fe-btn ${eq ? '' : 'pri'}" data-act="equip">${eq ? '卸下' : '裝備'}${kc('E')}</button>
        <button class="fe-btn" data-act="try"${this.app.room ? ' disabled' : ''}>${ICON.play}試用</button>
        <button class="fe-btn" data-act="inspect">檢視${kc('F')}</button>
        ${eq ? '<span class="ai-eq">對戰中的第一人稱與隊友畫面都會顯示此塗裝</span>' : `<button class="fe-btn ghost sm ai-salv" data-act="salvage" data-uid="${it.uid}" title="分解成色料（用於合成）">分解<small>${ICON_DYE}+${DYE.salvage[f?.grade] || 1}</small></button>`}
      </div></div>`;
  }

  _premInfo(def) {
    const tier = tierOf(def), T = TIERS[tier], rec = inventory.premiumRec(def.id), cur = rec?.phase ?? 0;
    const pv = this.preview ?? cur, list = phasesOf(def), k = kilnOf(def);
    const kills = rec?.mastery.kills || 0;
    const chip = (i, p) => {
      const ok = inventory.phaseUnlocked(def.id, i), isCur = i === cur, isPv = i === pv;
      const need = i === 'kiln' ? `窯變 ${Math.round((def.premium.kiln?.chance ?? 0.01) * 100)}%` : i === 0 ? '本相' : `熟練 ${PHASE_UNLOCK[i]}`;
      return `<button class="ai-ph${isPv ? ' on' : ''}${ok ? '' : ' lock'}${isCur ? ' cur' : ''}" data-act="phase" data-v="${i}" style="--a:${p.sw[0]};--b:${p.sw[1]};--c:${p.sw[2]}">
        <i class="sw"></i><b>${esc(p.zh)}</b><small>${ok ? (isCur ? '使用中' : need) : `${ICON.lock}${need}`}</small></button>`;
    };
    const next = list.findIndex((_, i) => i > 0 && !inventory.phaseUnlocked(def.id, i));
    const target = next > 0 ? PHASE_UNLOCK[next] : 0, prev = next > 1 ? PHASE_UNLOCK[next - 1] : 0;
    const okPv = inventory.phaseUnlocked(def.id, pv);
    return `<div class="ai prem" data-gc="${T.edge}" style="${tierVars(tier)}">
      <div class="ai-k"><span class="ai-g t">${tierIcon(tier, 13)}${T.zh}</span><span>${esc(SERIES[def.line] || '')}</span><span>${esc(catZh(def.cat))}</span>${rec ? `<span>窯變種子 #${rec.kiln.seed}</span>` : '<span>首次於對戰中購買時揭曉窯變種子</span>'}</div>
      <div class="ai-n"><b>${esc(def.zh)}</b><span class="ai-chase">．${esc(phaseName(def, pv))}</span></div>
      <div class="ai-w">${esc(def.en)}<small>相只改變配色，不換模型、不影響數值</small></div>
      <div class="ai-phs">${list.map((p, i) => chip(i, p)).join('')}${k ? chip('kiln', k) : ''}</div>
      <div class="ai-mast"><span>熟練度</span>${next > 0 ? `<i><u style="width:${Math.min(100, ((kills - prev) / Math.max(1, target - prev)) * 100).toFixed(1)}%"></u></i><b>${kills} / ${target}</b><small>下一相：${esc(list[next].zh)}</small>` : `<i><u style="width:100%"></u></i><b>${kills}</b><small>全部的相已解鎖</small>`}</div>
      <div class="ai-btns">
        <button class="fe-btn pri" data-act="apply"${okPv && pv !== cur ? '' : ' disabled'}>${pv === cur ? '使用中' : okPv ? '套用此相' : '尚未解鎖'}</button>
        <button class="fe-btn" data-act="try"${this.app.room ? ' disabled' : ''}>${ICON.play}試用</button>
        <button class="fe-btn" data-act="inspect">檢視${kc('F')}</button>
      </div></div>`;
  }

  _weaponInfo(w) {
    if (!w) return '';
    const tier = tierOf(w), T = TIERS[tier], sk = skillText(w), it = !w.premium && inventory.equippedItem(w.id);
    const look = it ? `<span class="tag fin" style="--gc:${GRADES[finishDef(it.finish)?.grade]?.color}">${esc(itemNames(it).finish)}</span>` : w.premium && phasesOf(w).length ? `<span class="tag fin" style="--gc:${T.edge}">${esc(phaseName(w, inventory.phaseOf(w.id).phase))}</span>` : '';
    const dress = (tier === 'standard' && inventory.itemsFor(w.id).length) || (w.premium && phasesOf(w).length);
    return `<div class="ai cat" data-gc="${T.edge}" style="${tierVars(tier)}">
      <div class="ai-k">${tier !== 'standard' ? `<span class="ai-g t">${tierIcon(tier, 13)}${T.zh}</span>` : '<span>制式</span>'}<span>${esc(catZh(w.cat))}</span>${w.mode ? `<span>${MODE_ZH[w.mode] || w.mode}</span>` : ''}${ammoTag(w) ? `<span>${esc(ammoTag(w))}</span>` : ''}<span>${w.price ? '$' + w.price : '初始裝備'}</span></div>
      <div class="ai-n"><b>${esc(w.zh)}</b><span class="ai-en">${esc(w.en)}</span>${look}</div>
      ${sk ? `<div class="ai-sk"><b>${sk.key} ${esc(sk.zh)}</b>${esc(sk.desc)}${sk.src ? `<small>充能：${esc(sk.src)}　·　局內按 ${sk.key === '◎' ? '滑鼠右鍵' : esc(bindLabel(primaryKey('special')) || '★')} 發動</small>` : ''}</div>` : ''}
      <div class="ai-stats">${w.cat === 'melee' ? '' : `<div class="as-bars">${weaponStats(w).map(([k, v]) => `<div><span>${k}</span><i><u style="width:${(Math.max(0.06, v) * 100).toFixed(0)}%"></u></i></div>`).join('')}</div>`}
        <div class="as-nums">${weaponNums(w).map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div></div>
      <div class="ai-btns">${dress ? `<button class="fe-btn" data-act="wdress" data-id="${w.id}">${tier === 'standard' ? '更換塗裝' : '更換外觀'}</button>` : ''}<button class="fe-btn" data-act="inspect">檢視${kc('F')}</button><span class="ai-eq">局內於購買時間購買</span></div></div>`;
  }

  // ------------------------------------------------------------ actions
  _equip() {
    const e = this._entry();
    if (e?.kind !== 'item') return;
    const it = e.it;
    if (inventory.isEquipped(it)) { inventory.unequip(it.item); this.app.toast(`已卸下 ${itemNames(it).weapon} 的塗裝`); }
    else { inventory.equip(it.uid); this.app.toast(`${itemNames(it).weapon} 已裝備「${itemNames(it).finish}」`); this.app.audio.play('ui_equip'); }
  }

  _applyPhase() {
    const e = this._entry();
    if (e?.kind !== 'prem' || this.preview == null) return;
    if (inventory.setPhase(e.def.id, this.preview)) { this.app.audio.play('ui_equip'); this.app.toast(`${e.def.zh} 已套用「${phaseName(e.def, this.preview)}」`); this.preview = null; this._renderGrid(); this._info(); }
  }

  /** 分解 one item into 色料 (asked first: it cannot be undone). */
  _salvage(uid) {
    const it = inventory.get(uid);
    if (!it || inventory.isEquipped(it)) return;
    const n = DYE.salvage[finishDef(it.finish)?.grade] || 1;
    this.app.dialogs.confirm('分解塗裝', `分解「${itemNames(it).full}」（磨損 ${it.float.toFixed(4)}），獲得色料 +${n}。分解後無法復原。`, { ok: `分解　色料 +${n}`, danger: true })
      .then((ok) => {
        if (!ok || !this.live) return;
        const e = this._entry(), next = e?.copies?.find((c) => c.uid !== uid);
        if (next) this.sel = 'i:' + next.uid;
        const got = inventory.salvage([uid]);
        if (got) { this.app.audio.play('ui_click'); this.app.toast(`已分解，色料 +${got}（共 ${inventory.dye}）`); this._show(); }
      });
  }
  /** 分解重複: of the selected look's copies, the best one stays (and an equipped one), the rest become 色料. */
  _dedupe() {
    const e = this._entry();
    if (!e?.copies || e.copies.length < 2) return;
    const keep = e.copies[0], gone = e.copies.slice(1).filter((c) => !inventory.isEquipped(c));
    if (!gone.length) return;
    const n = gone.reduce((a, c) => a + (DYE.salvage[finishDef(c.finish)?.grade] || 1), 0);
    this.app.dialogs.confirm('分解重複塗裝', `保留磨損最低（或帶稀有圖樣、斬數計）的「${itemNames(keep).full}」${keep.float.toFixed(4)}，分解其餘 ${gone.length} 件，獲得色料 +${n}。分解後無法復原。`, { ok: `分解 ${gone.length} 件　色料 +${n}`, danger: true })
      .then((ok) => {
        if (!ok || !this.live) return;
        if (gone.some((c) => 'i:' + c.uid === this.sel)) this.sel = 'i:' + keep.uid;
        const got = inventory.salvage(gone.map((c) => c.uid));
        if (got) { this.app.audio.play('ui_click'); this.app.toast(`已分解 ${gone.length} 件重複塗裝，色料 +${got}（共 ${inventory.dye}）`); this._show(); }
      });
  }

  /**
   * 合成 (§3.9): DYE.n unequipped items of one grade + a 色料 fee -> one item of the next grade. The dialog picks a grade,
   * pre-selects the copies least worth keeping (duplicates, no pattern / 斬數計, worst wear; toggle to change), shows
   * the possible results with their odds, and the new item lands on the stage.
   */
  _trade() {
    const app = this.app, N = DYE.n;
    const pool = (g) => inventory.items.filter((it) => finishDef(it.finish)?.grade === g && !inventory.isEquipped(it));
    const grades = GRADE_ORDER.filter((g) => DYE.trade[g] != null);
    let grade = grades.find((g) => pool(g).length >= N) || grades[0], sel = [];
    // least worth keeping first: a copy whose look has a better copy, then no pattern / counter, then the worst wear
    const worth = (list) => {
      const best = new Map();
      for (const it of inventory.items) { const k = stackKey(it), b = best.get(k); if (!b || bestFirst(it, b) < 0) best.set(k, it); }
      return list.slice().sort((a, b) => (best.get(stackKey(b)) === b ? 1 : 0) - (best.get(stackKey(a)) === a ? 1 : 0) || -bestFirst(a, b));
    };
    const autoPick = () => { sel = worth(pool(grade)).slice(0, N).map((it) => it.uid); };
    autoPick();
    const body = document.createElement('div');
    body.className = 'tu';
    const render = () => {
      const list = worth(pool(grade)), G = GRADES[grade], next = GRADES[GRADE_ORDER[gradeRank(grade) + 1]];
      const chosen = sel.map((u) => inventory.get(u)).filter(Boolean), fee = DYE.trade[grade];
      const outs = chosen.length === N ? tradeOutcomes(chosen) : [];
      body.innerHTML = `<div class="tu-g">${grades.map((g) => { const n = pool(g).length; return `<button class="av-chip${g === grade ? ' on' : ''}" data-g="${g}"${n ? '' : ' disabled'}><i style="background:${GRADES[g].color}"></i>${GRADES[g].zh}<small>${n}</small></button>`; }).join('')}</div>
        <p class="tu-how">選 ${N} 件<b style="color:${G.color}">${G.zh}</b>塗裝（裝備中的不列入），合成 1 件<b style="color:${next.color}">${next.zh}</b>。結果的收藏系列依投入的塗裝決定，磨損取投入的平均，任一件帶斬數計則保留斬數計。</p>
        <div class="tu-list fe-scroll">${list.length ? list.map((it) => { const nm = itemNames(it), on = sel.includes(it.uid); return `<button class="tu-it${on ? ' on' : ''}" data-uid="${it.uid}" style="--gc:${G.color};--sw:${finishSwatch(it.finish)}">
            <i></i><b>${esc(nm.weapon)}｜${esc(nm.finish.replace('．' + (nm.title || '#'), ''))}</b><small>${it.float.toFixed(4)}${it.title ? '　★' : ''}${it.counter?.on ? '　斬數' : ''}</small></button>`; }).join('') : '<p class="tu-none">沒有這個品相的塗裝</p>'}</div>
        <div class="tu-out"><div class="tu-h">可能獲得<span>已選 ${chosen.length} / ${N}</span></div>${outs.length ? `<div class="tu-os">${outs.map((o) => `<span class="ci" style="--gc:${GRADES[o.grade].color};--sw:${finishSwatch(o.finish)}"><i></i><b>${esc(finishDef(o.finish).zh)}</b><small>${pct(o.p)}</small></span>`).join('')}</div>` : `<p class="tu-none">再選 ${N - chosen.length} 件</p>`}</div>
        <div class="tu-fee">${ICON_DYE}色料 <b>${fee}</b><span>持有 ${inventory.dye}</span>${inventory.dye < fee ? '<em>色料不足：分解重複或不需要的塗裝可以取得色料</em>' : ''}</div>`;
      ok.disabled = chosen.length !== N || inventory.dye < fee;
    };
    const d = app.dialogs.show({ title: '合成塗裝', body, cls: 'wide tu-dlg', dismiss: false, backCancels: true,
      buttons: [{ label: '取消', value: false }, { label: '合成', cls: 'pri tu-ok', value: true }] });
    const ok = d.el.querySelector('.tu-ok');
    body.addEventListener('click', (e) => {
      const g = e.target.closest('[data-g]'), t = e.target.closest('.tu-it');
      if (g && !g.disabled) { grade = g.dataset.g; autoPick(); render(); }
      else if (t) {
        const u = +t.dataset.uid;
        if (sel.includes(u)) sel = sel.filter((x) => x !== u); else if (sel.length < N) sel.push(u); else { sel.shift(); sel.push(u); }
        render();
      }
    });
    render();
    d.done.then((v) => {
      if (v !== true || !this.live) return;
      const it = inventory.tradeUp(sel);
      if (!it) { app.toast('合成失敗：投入的塗裝不符合條件'); return; }
      // the new item on the stage: filters cleared so its card shows (first under 最新)
      Object.assign(this.filter, { weapon: 'all', grade: 'all', fam: 'all', sort: 'new' });
      this.sel = 'i:' + it.uid;
      this.tab = 'collection';
      this.render();
      this.stage?.inspect();
      app.audio.play('level_up', { volume: 0.6 });
      const G = GRADES[finishDef(it.finish)?.grade] || GRADES.common;
      app.toast(`合成獲得 ${G.zh}「${itemNames(it).full}」`, 3200);
    });
  }

  /** 試用: the proving ground (free roam, no match) with this weapon in this look; the menu comes back here after. */
  _try() {
    const app = this.app;
    if (app.room) return;
    let t = null;
    if (this.tab === 'collection') {
      const e = this._entry();
      if (e?.kind === 'item') t = { weapon: e.it.item, uid: e.it.uid };
      else if (e?.kind === 'prem') t = { weapon: e.def.id, phase: this.preview ?? inventory.phaseOf(e.def.id).phase };
    }
    if (!t) return;
    const noMatch0 = app.dev.noMatch;
    inventory.setTryout({ ...t, restore: () => { app.dev.noMatch = noMatch0; } });
    inventory.returnTo = 'armory';
    app.dev.noMatch = true;
    app.startMatch({ map: hasMap('test') ? 'test' : app.mapId, difficulty: 'normal', bots: 0 });
  }

  // ------------------------------------------------------------ crates
  _cratesHTML() {
    const C = CRATES[DEFAULT_CRATE], c = inventory.crates;
    const log = inventory.log.slice().reverse().slice(0, 5);
    const ago = (at) => { const m = Math.max(0, Math.round((Date.now() - at) / 60000)); return m < 1 ? '剛剛' : m < 60 ? `${m} 分鐘前` : m < 1440 ? `${Math.round(m / 60)} 小時前` : `${Math.round(m / 1440)} 天前`; };
    return `<div class="cr fe-scroll">
      <div class="cr-hero">
        <div class="cr-box" aria-hidden="true"><i class="lid"></i><i class="body"></i><i class="band"></i><i class="seal">啟</i></div>
        <div class="cr-txt">
          <span class="cr-k">免費補給箱　·　只能靠遊玩取得</span>
          <b>${esc(C.zh)}</b><small>${esc(C.en)}</small>
          <p>${esc(C.desc)}</p>
          <div class="cr-own">持有 <b>${c.owned}</b> 個　·　已開啟 ${c.opened} 個</div>
          <button class="fe-btn pri big" data-act="open"${c.owned > 0 ? '' : ' disabled'}>${c.owned > 0 ? `開啟補給箱${kc('Enter')}` : '沒有補給箱'}</button>
        </div>
      </div>
      <div class="cr-sec"><div class="cr-h">下一個補給箱<span>${Math.floor(c.points)} / ${EARN.perCrate}</span></div>
        <div class="cr-prog"><u style="width:${Math.min(100, (c.points / EARN.perCrate) * 100).toFixed(1)}%"></u></div>
        <ul class="cr-earn"><li>清除一回合<b>+${EARN.round}</b></li><li>擊敗首領<b>+${EARN.boss}</b></li><li>任務完成<b>+${EARN.victory}</b></li><li>困難 ×1.25　地獄 ×1.5　災厄 ×2</li></ul>
        ${log.length ? `<div class="cr-log">${log.map((l) => `<div><span>${esc(l.why)}</span><small>${ago(l.at)}</small><b>+${l.pts}</b>${l.got ? `<em>補給箱 ×${l.got}</em>` : ''}</div>`).join('')}</div>` : ''}</div>
      <div class="cr-sec"><div class="cr-h">公開機率<span>PUBLISHED ODDS</span></div><div class="cr-odds">${oddsTable(DEFAULT_CRATE)}</div></div>
      <div class="cr-sec"><div class="cr-h">保底<span>PITY</span></div><div class="cr-pity">${pityRows(DEFAULT_CRATE)}</div></div>
      <div class="cr-sec"><div class="cr-h">內容物<span>${crateContents(C).length} 款　·　單件機率</span></div><div class="cr-items"></div></div>
      <p class="cr-legal">補給箱不販售、不能用現金購買，也不能交易；內容純屬外觀，不影響任何數值。</p>
    </div>`;
  }

  _crateContents() {
    const box = this.$('.cr-items');
    if (!box) return;
    // one row per finish (a 星渦 gem phase sums its two ways in), its own chance in the corner
    const list = crateContents(CRATES[DEFAULT_CRATE]).slice().sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade) || b.p - a.p);
    box.innerHTML = list.map((c) => {
      const f = finishDef(c.finish), G = GRADES[c.grade];
      const how = c.gemP ? `（含星渦寶石相 ${pct(c.gemP)}）` : '';
      return `<div class="ci" style="--gc:${G.color};--sw:${finishSwatch(c.finish)}" title="${esc(f.zh)}　${pct(c.p)}${how}"><i></i><b>${esc((G.prefix || '') + f.zh)}</b><small>${esc(FAMILIES[familyOf(c.finish)]?.zh || '')}</small><em>${pct(c.p)}</em></div>`;
    }).join('');
  }

  _crateStageInfo() {
    const it = this.showcased;
    if (!it) return `<div class="ai crate" data-gc="${GRADES.exquisite.color}"><div class="ai-k"><span>內容物預覽</span></div><div class="ai-n"><b>星渦．晚霞</b></div><div class="ai-w">草原<small>示意：開出的塗裝會以實際材質顯示在這裡</small></div></div>`;
    const nm = itemNames(it), G = GRADES[finishDef(it.finish)?.grade] || GRADES.common;
    const eq = inventory.isEquipped(it);
    return `<div class="ai crate" data-gc="${G.color}"><div class="ai-k"><span class="ai-g">${G.zh}<small>${esc(G.en)}</small></span><span>${this.lastOpened?.uid === it.uid ? '剛開出' : '收藏中最稀有'}</span></div>
      <div class="ai-n">${it.counter?.on ? '<em class="st">斬數</em>' : ''}<b>${esc(nm.finish)}</b></div><div class="ai-w">${esc(nm.weapon)}<small>${esc(nm.weaponEn)}</small></div>
      <div class="ai-btns"><button class="fe-btn" data-act="wdress" data-id="${it.item}">在收藏中查看</button>${eq ? '<span class="ai-eq">已裝備</span>' : ''}<button class="fe-btn" data-act="inspect">檢視${kc('F')}</button></div></div>`;
  }

  _open() {
    if (this.reel || inventory.crates.owned <= 0) return;
    const body = this.$('.av-body'), head = this.$('.fe-head'), tabs = this.$('.av-tabs');
    for (const n of [body, head, tabs]) n.inert = true;
    this.el.classList.add('reeling');
    // the reel runs over an empty stage: the last weapon would show around the strip; the won item slides in on the stop
    this.stage?.veil(true);
    const ctl = openCrate(this.app, {
      thumbs: this.thumbs, root: this.el,
      // (the veil lifts for the won item only: the last weapon stays hidden until the new one has loaded)
      onReveal: (res) => { this.lastOpened = res.item; this._shownKey = ''; if (this.stage) this.stage.veiled = false; if (this.tab === 'crates') this._show(); this.stage?.inspect(); },
      onEquip: (item) => this.app.toast(`${itemNames(item).weapon} 已裝備「${itemNames(item).finish}」`),
      onClose: (again) => {
        this.reel = null;
        this.stage?.veil(false);
        if (!this.live) return;   // the screen is going (leave() closed the reel)
        for (const n of [body, head, tabs]) n.inert = false;
        this.el.classList.remove('reeling');
        this._noteNew();
        this._badges();
        if (this.tab === 'crates') { this._renderLeft(); this._show(); }
        if (again && this.live) setTimeout(() => this._open(), 240);
        else this.$('[data-act="open"]')?.focus?.();
      },
    });
    if (!ctl) { for (const n of [body, head, tabs]) n.inert = false; this.el.classList.remove('reeling'); this.stage?.veil(false); return; }
    this.reel = ctl;
    this._badges();
  }

  // ------------------------------------------------------------ catalog
  _catalogHTML() {
    const tabs = catalogTabs();
    if (!tabs.includes(this.cat)) this.cat = tabs[0];
    const list = listed(this.cat);
    if (!list.some((w) => w.id === this.wsel)) this.wsel = list[0]?.id;
    return `<nav class="cg-tabs fe-seg">${tabs.map((c) => `<button data-act="ctab" data-tab="${c}" class="${c === this.cat ? 'on' : ''}">${esc(catZh(c))}</button>`).join('')}</nav>
      <div class="cg-grid fe-scroll">${list.map((w) => {
        const tier = tierOf(w), prem = tier !== 'standard', it = !w.premium && inventory.equippedItem(w.id);
        return `<button class="cg-card${w.id === this.wsel ? ' on' : ''}${prem ? ' prem t-' + tier : ''}" data-act="wpick" data-id="${w.id}" style="${tierVars(tier)}">
          ${prem ? `<span class="cg-tier">${tierIcon(tier, 13)}</span>` : ''}${it ? `<i class="cg-fin" style="--gc:${GRADES[finishDef(it.finish)?.grade]?.color};--sw:${finishSwatch(it.finish)}" title="${esc(itemNames(it).finish)}"></i>` : ''}
          <span class="ar-img" data-id="${w.model || w.id}"><img alt=""><i class="ar-ph"></i></span><b>${esc(w.zh)}</b><small>${esc(w.en)}</small><span class="ar-price">${w.price ? '$' + w.price : '初始裝備'}</span></button>`;
      }).join('')}</div>`;
  }

  _icon(box, id) {
    box.classList.add('loading');
    weaponIcon(this.app.renderer, id).then((u) => {
      if (!box.isConnected) return;
      box.classList.remove('loading');
      if (u) { box.querySelector('img').src = u; box.classList.add('ok'); } else box.classList.add('none');
    }, () => { box.classList.remove('loading'); box.classList.add('none'); });
  }
}

const ICON_ROTATE = '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const ICON_DYE = '<svg class="dye-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c3.6 4.6 6.5 8.2 6.5 11.6a6.5 6.5 0 0 1-13 0C5.5 10.7 8.4 7.1 12 2.5z" fill="currentColor"/><path d="M9 14.5a3 3 0 0 0 3 3" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="1.6" stroke-linecap="round"/></svg>';
