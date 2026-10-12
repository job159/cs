// Architecture: walls with openings (window / door / shop / garage / vent fillers, reveals, fake rooms),
// complete building shells (plinth, floors, belt courses, cornice, parapet or pitched roof, rooftop clutter,
// awnings, signs, fire escapes, AC units, downpipes, enterable ground floors), stairs and ramps.
import { Kit, ensureCCW, V } from './core.mjs';
import { edgeNormal, fixUpFacing } from './ground.mjs';

const WINDOW_STATES = { glass: 0.45, dark: 0.2, broken: 0.22, boarded: 0.13 };

function pickWeighted(kit, weights) {
  const tot = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = kit.rnd(0, tot);
  for (const [k, w] of Object.entries(weights)) { r -= w; if (r <= 0) return k; }
  return Object.keys(weights)[0];
}

Object.assign(Kit.prototype, {
  /**
   * Straight wall from a [x, z] to b [x, z] (outer face on the right of a->b seen from above, i.e. outward for a
   * CCW footprint), base y0, height h, thickness t (inward). Options:
   *   mat (outer), inner (material of the inner face, default none: solid/hidden interior), cap (top material),
   *   ends: [startEnd, endEnd] (true = close the wall end, for free-standing walls),
   *   openings: [{ x, w, y, h, type, state, ... }] (wall-local metres, see opening()),
   *   bands: extra y levels (wall-local) where the face is split (floor lines), grime, tint, collide (default true),
   *   room: fake room depth behind windows (default 1.1, 0 = none), interior: true when there is a real room behind.
   */
  wall(o) {
    const a = o.a, b = o.b;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz);
    if (L < 1e-3) return;
    const rot = Math.atan2(-dz, dx);
    const y0 = o.y0 ?? 0, h = o.h, t = o.t ?? 0.3, y1 = y0 + h;
    const ops = (o.openings || []).map((op) => ({ ...op, x0: op.x ?? (op.cx - op.w / 2), y0: y0 + (op.y ?? 0) })).filter((op) => op.w > 0.05 && op.h > 0.05);
    for (const op of ops) { op.x1 = op.x0 + op.w; op.y1 = op.y0 + op.h; }
    this.at({ x: a[0], y: 0, z: a[1], rot }, () => {
      const grime = o.grime === undefined ? { y: y0, h: 1.4, k: 0.32 } : o.grime;
      const fo = { tint: o.tint, grime, shade: o.shade };
      const levels = [y0, y1, ...(o.bands || []).map((v) => y0 + v)];
      if (grime) levels.push(grime.y + grime.h * 0.45, grime.y + grime.h);
      this._gridFace(L, levels, ops, 0, o.mat, fo, false);
      if (o.inner) this._gridFace(L, levels, ops, -t, o.inner, { tint: o.innerTint, grime: o.innerGrime ?? null }, true);
      if (o.cap) this.face([[0, y1, 0], [0, y1, -t], [L, y1, -t], [L, y1, 0]], o.cap, { tint: o.tint });
      const ends = o.ends || [false, false];
      if (ends[0]) this.face([[0, y0, -t], [0, y0, 0], [0, y1, 0], [0, y1, -t]], o.mat, fo);
      if (ends[1]) this.face([[L, y0, 0], [L, y0, -t], [L, y1, -t], [L, y1, 0]], o.mat, fo);
      for (const op of ops) this.opening(op, { t, wallMat: o.mat, inner: !!o.inner, room: o.room ?? 1.1, tint: o.tint, interior: o.interior });
      if (o.collide !== false) {
        const surf = this.material(o.mat).surf;
        // collision: solid wall minus door-like openings that reach the floor (windows stay solid: no climbing in)
        const passes = ops.filter((op) => op.walk);
        const xs = [0, L, ...passes.flatMap((op) => [op.x0, op.x1])].sort((p, q) => p - q);
        for (let i = 0; i < xs.length - 1; i++) {
          const xa = xs[i], xb = xs[i + 1];
          if (xb - xa < 1e-3) continue;
          const mid = (xa + xb) / 2;
          const door = passes.find((op) => mid > op.x0 && mid < op.x1);
          if (door) { if (door.y1 < y1 - 0.01) this.colBox({ x: mid, y: door.y1, z: -t / 2, w: xb - xa, h: y1 - door.y1, d: t }, surf); continue; }
          this.colBox({ x: mid, y: y0, z: -t / 2, w: xb - xa, h, d: t }, surf);
        }
      }
    });
  },

  /** Internal: wall face on plane z (local), grid-decomposed around rectangular openings. */
  _gridFace(L, levels, ops, z, mat, fo, back) {
    const xs = new Set([0, L]), ys = new Set(levels);
    for (const op of ops) { xs.add(op.x0); xs.add(op.x1); ys.add(op.y0); ys.add(op.y1); }
    const X = [...xs].filter((v) => v >= -1e-6 && v <= L + 1e-6).sort((a, b) => a - b);
    const ymin = Math.min(...levels.slice(0, 2)), ymax = Math.max(...levels.slice(0, 2));
    const Y = [...ys].filter((v) => v >= ymin - 1e-6 && v <= ymax + 1e-6).sort((a, b) => a - b);
    for (let j = 0; j < Y.length - 1; j++) {
      const ya = Y[j], yb = Y[j + 1];
      if (yb - ya < 1e-4) continue;
      // merge runs of solid cells only when no opening edge splits them in the neighbouring rows -> keep full grid
      for (let i = 0; i < X.length - 1; i++) {
        const xa = X[i], xb = X[i + 1];
        if (xb - xa < 1e-4) continue;
        const cx = (xa + xb) / 2, cy = (ya + yb) / 2;
        if (ops.some((op) => cx > op.x0 && cx < op.x1 && cy > op.y0 && cy < op.y1)) continue;
        if (back) this.face([[xb, ya, z], [xa, ya, z], [xa, yb, z], [xb, yb, z]], mat, fo);
        else this.face([[xa, ya, z], [xb, ya, z], [xb, yb, z], [xa, yb, z]], mat, fo);
      }
    }
  },

  /**
   * Fills one wall opening (wall-local frame: x along the wall, z = 0 outer face, -t inner face).
   * op: { x0, x1, y0, y1, type: window|door|shop|garage|hole|vent, state, depth (reveal), frame (mat), glass (mat),
   *       sill, mullions: [nx, ny], door (mat), shutter (0..1 closed fraction), walk (collision passes) }
   */
  opening(op, w) {
    const { x0, x1, y0, y1 } = op;
    const W = x1 - x0, H = y1 - y0;
    const type = op.type || 'window';
    const t = w.t;
    const depth = Math.min(op.depth ?? (type === 'shop' ? 0.12 : 0.16), t - 0.02);
    const revealMat = op.reveal || w.wallMat;
    // reveals (outer face -> frame plane); for real interiors the reveal spans the full thickness
    const rd = w.inner ? t : depth;
    this.face([[x0, y0, 0], [x0, y0, -rd], [x0, y1, -rd], [x0, y1, 0]], revealMat, { tint: w.tint });
    this.face([[x1, y0, -rd], [x1, y0, 0], [x1, y1, 0], [x1, y1, -rd]], revealMat, { tint: w.tint });
    this.face([[x0, y1, 0], [x0, y1, -rd], [x1, y1, -rd], [x1, y1, 0]], revealMat, { tint: w.tint });
    if (type !== 'door' && type !== 'garage' && !(type === 'shop' && op.y === 0)) this.face([[x0, y0, -rd], [x0, y0, 0], [x1, y0, 0], [x1, y0, -rd]], op.sillMat || revealMat, { tint: w.tint });
    const zf = -depth; // frame plane
    const frame = op.frame || 'frame_dark';
    const fw = op.fw ?? (type === 'shop' ? 0.08 : 0.06);
    const fd = 0.07;
    const frameBox = (cx, cy, bw, bh) => this.box({ x: cx, y: cy, z: zf - fd / 2 + 0.01, w: bw, h: bh, d: fd, mat: frame, faces: { nz: false } });
    const state = op.state || 'glass';
    const room = w.interior ? 0 : (op.room ?? w.room);
    const roomBox = (z0, shade = 1) => {
      if (!room) return;
      const zb = z0 - room;
      const m = 'interior_hidden', ro = { shade, tint: op.roomTint };
      this.face([[x0, y0, zb], [x1, y0, zb], [x1, y1, zb], [x0, y1, zb]], m, ro);          // back
      this.face([[x0, y0, z0], [x0, y0, zb], [x0, y1, zb], [x0, y1, z0]].reverse(), m, ro); // left side (faces +x)
      this.face([[x1, y0, zb], [x1, y0, z0], [x1, y1, z0], [x1, y1, zb]].reverse(), m, ro);
      this.face([[x0, y1, z0], [x0, y1, zb], [x1, y1, zb], [x1, y1, z0]].reverse(), 'interior_ceiling', ro);
      this.face([[x0, y0, zb], [x0, y0, z0], [x1, y0, z0], [x1, y0, zb]].reverse(), 'interior_floor', ro);
    };
    if (type === 'window' || type === 'shop') {
      // frame
      frameBox((x0 + x1) / 2, y0, W, fw); frameBox((x0 + x1) / 2, y1 - fw, W, fw);
      frameBox(x0 + fw / 2, y0 + fw, fw, H - 2 * fw); frameBox(x1 - fw / 2, y0 + fw, fw, H - 2 * fw);
      const [mx, my] = op.mullions || (type === 'shop' ? [Math.max(1, Math.round(W / 1.6)), 1] : [W > 1.3 ? 2 : 1, H > 1.3 ? 2 : 1]);
      for (let i = 1; i < mx; i++) frameBox(x0 + (W * i) / mx, y0 + fw, fw * 0.7, H - 2 * fw);
      const transom = type === 'shop' ? y1 - Math.min(0.6, H * 0.22) : null;
      if (transom) frameBox((x0 + x1) / 2, transom, W - 2 * fw, fw);
      else for (let j = 1; j < my; j++) frameBox((x0 + x1) / 2, y0 + (H * j) / my, W - 2 * fw, fw * 0.7);
      if (type === 'shop') { // kick plate
        this.box({ x: (x0 + x1) / 2, y: y0, z: zf - 0.02, w: W - 0.02, h: 0.35, d: 0.04, mat: op.kick || 'steel_dark', faces: { nz: false } });
      }
      const zg = zf - 0.03;
      const gy0 = type === 'shop' ? y0 + 0.35 : y0 + fw, gy1 = y1 - fw;
      if (state === 'glass' || state === 'dark') {
        this.face([[x0 + fw, gy0, zg], [x1 - fw, gy0, zg], [x1 - fw, gy1, zg], [x0 + fw, gy1, zg]], op.glass || (type === 'shop' ? 'glass_shop' : 'glass'));
        if (state === 'dark' && room) { // blinds / curtain behind the glass
          const cov = this.rnd(0.3, 1);
          const col = this.pick(['#6c6253', '#8c8574', '#4d5258', '#7a5b45', '#9a9384']);
          this.face([[x0 + fw, gy1 - (gy1 - gy0) * cov, zg - 0.08], [x1 - fw, gy1 - (gy1 - gy0) * cov, zg - 0.08], [x1 - fw, gy1, zg - 0.08], [x0 + fw, gy1, zg - 0.08]], 'interior_ceiling', { tint: col });
        }
      } else if (state === 'broken') {
        // a few shards stuck in the frame corners
        const sh = (cx, cy, sx, sy) => this.face([[cx, cy, zg], [cx + sx, cy, zg], [cx, cy + sy, zg]].map((p, k, arr) => (sx * sy < 0 ? arr[(3 - k) % 3] : p)), 'glass_dirty');
        if (this.chance(0.7)) sh(x0 + fw, gy0, this.rnd(0.15, 0.4), this.rnd(0.2, 0.5));
        if (this.chance(0.5)) sh(x1 - fw, gy1, -this.rnd(0.15, 0.4), -this.rnd(0.2, 0.5));
      } else if (state === 'boarded') {
        const n = Math.max(2, Math.round(H / 0.42));
        for (let i = 0; i < n; i++) {
          const yy = y0 + (H * (i + 0.5)) / n + this.rnd(-0.05, 0.05);
          this.at({ x: (x0 + x1) / 2, y: yy, z: 0.012 + i * 0.002, rz: this.rnd(-0.12, 0.12) }, () =>
            this.box({ x: this.rnd(-0.05, 0.05), y: -0.09, z: 0.01, w: W + this.rnd(0.15, 0.35), h: 0.18 + this.rnd(-0.02, 0.03), d: 0.025, mat: 'wood_planks', tint: this.pick(['#ffffff', '#d9cdbd', '#bfb4a5']), uvOffset: [this.rnd(0, 3), this.rnd(0, 3)] }));
        }
      } else if (state === 'shutter') {
        this.face([[x0 + 0.02, y0, -0.05], [x1 - 0.02, y0, -0.05], [x1 - 0.02, y1, -0.05], [x0 + 0.02, y1, -0.05]], 'metal_shutter', { tint: op.shutterTint });
      }
      if (state !== 'shutter') roomBox(zf, state === 'dark' ? 0.6 : 0.85);
      if (type === 'window' && op.sill !== false) {
        this.box({ x: (x0 + x1) / 2, y: y0 - 0.06, z: 0.025, w: W + 0.12, h: 0.06, d: 0.1, mat: op.sillMat || 'trim_stone', tint: op.trimTint });
      }
      if (op.lintel) this.box({ x: (x0 + x1) / 2, y: y1, z: 0.01, w: W + 0.16, h: 0.14, d: 0.04, mat: op.lintel === true ? 'trim_stone' : op.lintel, tint: op.trimTint });
      if (op.ac) this.windowAC((x0 + x1) / 2 + this.rnd(-W / 4, W / 4), y0 + 0.02);
    } else if (type === 'door') {
      // frame around (3 sides)
      frameBox(x0 + fw / 2, y0, fw, H); frameBox(x1 - fw / 2, y0, fw, H); frameBox((x0 + x1) / 2, y1 - fw, W, fw);
      if (state === 'open' || op.walk) { if (!w.inner) roomBox(zf, 0.7); }
      else {
        const slab = op.door || 'metal_painted';
        this.box({ x: (x0 + x1) / 2, y: y0, z: zf - 0.025, w: W - 2 * fw, h: H - fw, d: 0.045, mat: slab, tint: op.doorTint, faces: { nz: false } });
        // handle + kick plate
        this.box({ x: x1 - fw - 0.12, y: y0 + 1.0, z: zf + 0.0, w: 0.04, h: 0.16, d: 0.05, mat: 'steel' });
        if (op.window) this.face([[x0 + 0.3, y0 + 1.3, zf + 0.001], [x1 - 0.3, y0 + 1.3, zf + 0.001], [x1 - 0.3, y1 - 0.3, zf + 0.001], [x0 + 0.3, y1 - 0.3, zf + 0.001]], 'glass_dirty');
      }
      if (op.step !== false && !op.walk) this.box({ x: (x0 + x1) / 2, y: y0 - 0.16, z: 0.2, w: W + 0.3, h: 0.16, d: 0.4, mat: 'trim_concrete', collide: true });
    } else if (type === 'garage') {
      const closed = op.shutter ?? 1;
      const sy = y1 - (H * closed);
      this.face([[x0, sy, zf], [x1, sy, zf], [x1, y1, zf], [x0, y1, zf]], 'metal_shutter', { tint: op.shutterTint, uvOffset: [0, this.rnd(0, 2)] });
      this.box({ x: (x0 + x1) / 2, y: y1 - 0.02, z: zf + 0.06, w: W + 0.1, h: 0.25, d: 0.12, mat: 'steel_dark' }); // roll housing
      if (closed < 0.98) roomBox(zf, 0.5);
    } else if (type === 'vent') {
      const n = Math.max(3, Math.round(H / 0.08));
      for (let i = 0; i < n; i++) this.at({ x: (x0 + x1) / 2, y: y0 + (H * (i + 0.5)) / n, z: zf + 0.02, rx: 0.6 }, () => this.box({ x: 0, y: -0.01, z: 0, w: W, h: 0.02, d: 0.07, mat: 'steel_dark' }));
      this.face([[x0, y0, zf - 0.04], [x1, y0, zf - 0.04], [x1, y1, zf - 0.04], [x0, y1, zf - 0.04]], 'interior_hidden', { shade: 0.3 });
    } else if (type === 'hole') {
      roomBox(zf, 0.7);
    }
  },

  /** Window AC unit hanging under a window (local wall frame, x centre, y = sill height). */
  windowAC(x, y) {
    const tint = this.pick(['#d8d6cf', '#c9c4b6', '#a7a59f']);
    this.bbox({ x, y: y - 0.36, z: 0.18, w: 0.62, h: 0.4, d: 0.5, bevel: 0.025, mat: 'steel', tint });
    this.box({ x, y: y - 0.33, z: 0.433, w: 0.5, h: 0.3, d: 0.01, mat: 'steel_dark' }); // grille
    this.box({ x: x - 0.22, y: y - 0.42, z: 0.24, w: 0.03, h: 0.06, d: 0.35, mat: 'steel_dark' });
    this.box({ x: x + 0.22, y: y - 0.42, z: 0.24, w: 0.03, h: 0.06, d: 0.35, mat: 'steel_dark' });
  },

  /**
   * Building shell. Footprint: poly [[x, z]...] (any winding) or rect { x, z, w, d, rot }.
   * Options (all optional):
   *   floors (3), floorH (3.1), groundH (3.6), mat ('brick_red'), tint, trim ('trim_stone'), trimTint,
   *   plinth { h: 0.45, mat: 'trim_concrete' } | false, belt (string courses between floors, default true),
   *   cornice { h: 0.35, depth: 0.25, mat } | false, roof { type: 'flat'|'gable', parapet: 0.9, mat, coping,
   *     pitch (deg), overhang, clutter: true }, windows { w: 1.1, h: 1.55, sill: 0.9, bay: 3.2, states: {glass,..},
   *     lintel: true, ac: 0.12 (chance) }, sides: [per edge: { type: 'facade'|'blank'|'hidden', ground: 'shop'|'doors'|
   *     'windows'|'garage'|'blank', openings: [...extra wall-local openings on the ground floor], awning, sign,
   *     fireEscape: bay index, pipes: true }], enter: { ground: true } (enterable ground floor with interior),
   *   wallT (0.35), grime, collide (true), name.
   * Returns { height, roofY, edges: [{ a, b, n, L }], doors: [world [x, z]], windows: [world points] }.
   */
  building(o) {
    let poly = o.poly;
    if (!poly && o.rect) {
      const { x, z, w, d, rot = 0 } = o.rect;
      const c = Math.cos(rot), s = Math.sin(rot);
      poly = [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]].map(([px, pz]) => [x + px * c + pz * s, z - px * s + pz * c]);
    }
    poly = ensureCCW(poly);
    const floors = o.floors ?? 3, floorH = o.floorH ?? 3.1, groundH = o.groundH ?? Math.max(floorH, 3.6);
    const height = groundH + (floors - 1) * floorH;
    const mat = o.mat || 'brick_red', trim = o.trim || 'trim_stone';
    const t = o.wallT ?? 0.35;
    const roof = { type: 'flat', parapet: 0.9, mat: 'roof_tar', coping: 'trim_concrete', clutter: true, ...(o.roof || {}) };
    const win = { w: 1.1, h: 1.55, sill: 0.9, bay: 3.2, states: WINDOW_STATES, lintel: mat.startsWith('brick'), ac: 0.1, ...(o.windows || {}) };
    const enter = o.enter?.ground;
    const plinth = o.plinth === false ? null : { h: 0.45, mat: 'trim_concrete', ...(o.plinth || {}) };
    const grime = o.grime === undefined ? { y: 0, h: 1.6, k: 0.35 } : o.grime;
    const info = { height, roofY: height, edges: [], doors: [], windows: [], poly };
    const n = poly.length;
    const bands = [];
    for (let f = 1; f < floors; f++) bands.push(groundH + (f - 1) * floorH);
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nn = edgeNormal(a, b);
      info.edges.push({ a, b, n: nn, L });
      const side = { type: 'facade', ground: 'windows', ...(o.sides?.[i] || {}) };
      if (side.type === 'hidden') continue;
      const openings = [];
      if (side.type === 'facade') {
        // bays
        const nb = Math.max(1, Math.floor((L - 0.8) / win.bay));
        const bw = L / nb;
        for (let f = 0; f < floors; f++) {
          const fy = f === 0 ? 0 : groundH + (f - 1) * floorH;
          const fh = f === 0 ? groundH : floorH;
          for (let k = 0; k < nb; k++) {
            const cx = bw * (k + 0.5);
            if (f === 0) {
              const g = side.groundBays?.[k] || side.ground;
              if (g === 'blank') continue;
              if (g === 'shop') {
                const sw = Math.min(bw - 0.5, 3.2);
                openings.push({ cx, w: sw, y: 0.0, h: Math.min(fh - 0.6, 3.0), type: 'shop', state: enter ? pickWeighted(this, { broken: 0.6, glass: 0.4 }) : pickWeighted(this, { glass: 0.35, broken: 0.35, shutter: 0.3 }), walk: enter && this.chance(0.5), frame: side.shopFrame || 'frame_dark' });
              } else if (g === 'doors' || (g === 'windows' && side.doorBay === k)) {
                openings.push({ cx, w: 1.0, y: 0, h: 2.2, type: 'door', state: enter ? 'open' : 'closed', walk: !!enter, door: side.door || this.pick(['metal_painted', 'wood_planks']), doorTint: side.doorTint, window: this.chance(0.4) });
              } else if (g === 'garage') {
                openings.push({ cx, w: Math.min(bw - 0.6, 3.4), y: 0, h: Math.min(fh - 0.5, 3.2), type: 'garage', shutter: this.pick([1, 1, 1, 0.7, 0.35]), shutterTint: side.shutterTint, walk: false });
              } else if (g === 'windows') {
                openings.push({ cx, w: win.w, y: win.sill + 0.1, h: win.h, type: 'window', state: pickWeighted(this, win.states), lintel: win.lintel && trim, trimTint: o.trimTint });
              }
            } else {
              if (side.blankFloors?.includes(f)) continue;
              openings.push({ cx, w: win.w, y: fy + win.sill, h: Math.min(win.h, fh - win.sill - 0.3), type: 'window', state: pickWeighted(this, win.states), lintel: win.lintel && trim, trimTint: o.trimTint, ac: this.chance(win.ac) });
            }
          }
        }
        for (const op of side.openings || []) openings.push(op);
      }
      for (const op of openings) {
        const lx = op.cx ?? op.x + op.w / 2;
        const wp = [a[0] + (b[0] - a[0]) * (lx / L) + nn[0] * 0.5, a[1] + (b[1] - a[1]) * (lx / L) + nn[1] * 0.5];
        if (op.type === 'door' || op.walk) info.doors.push(wp);
        else if (op.type === 'window') info.windows.push([wp[0], op.y + op.h / 2, wp[1]]);
      }
      const room = side.room ?? Math.min(1.1, 0.3 * minExtent(poly));
      if (enter) {
        // enterable ground floor: real wall with inner face + door gaps in the collision; solid upper part
        const gOps = openings.filter((op) => (op.y ?? 0) < groundH - 0.01), uOps = openings.filter((op) => (op.y ?? 0) >= groundH - 0.01);
        this.wall({ a, b, y0: 0, h: groundH, t, mat, tint: o.tint, grime, openings: gOps, inner: o.interiorWall || 'interior_wall', interior: true, collide: true });
        if (floors > 1) this.wall({ a, b, y0: groundH, h: height - groundH, t, mat, tint: o.tint, grime: null, openings: uOps.map((op) => ({ ...op, y: op.y - groundH })), bands: bands.map((v) => v - groundH), room, interior: false, collide: false });
      } else {
        this.wall({ a, b, y0: 0, h: height, t, mat, tint: o.tint, grime, openings, bands, room, interior: false, collide: false });
      }
      // horizontal trims on this facade
      this.at({ x: a[0], y: 0, z: a[1], rot: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) }, () => {
        const ext = 0.04; // trims run slightly past the corners to hide the mitre
        if (plinth && side.type === 'facade') {
          // plinth band below ground-floor windows, interrupted by doors / shops / garages
          const cuts = openings.filter((op) => (op.y ?? 0) < plinth.h + 0.01).map((op) => [op.cx !== undefined ? op.cx - op.w / 2 : op.x, (op.cx !== undefined ? op.cx + op.w / 2 : op.x + op.w)]).sort((p, q) => p[0] - q[0]);
          let x = -ext;
          for (const [c0, c1] of [...cuts, [L + ext, L + ext]]) {
            if (c0 - x > 0.05) this.box({ x: (x + c0) / 2, y: 0, z: 0.025, w: c0 - x, h: plinth.h, d: 0.05, mat: plinth.mat, faces: { bottom: false, nz: false }, grime: { y: 0, h: 0.5, k: 0.3 } });
            x = Math.max(x, c1);
          }
        }
        if (o.belt !== false && side.type !== 'hidden') for (const by of bands) this.box({ x: L / 2, y: by - 0.1, z: 0.03, w: L + 2 * ext, h: 0.18, d: 0.06, mat: trim, tint: o.trimTint, faces: { nz: false } });
        if (o.cornice !== false && roof.type === 'flat') {
          const c = { h: 0.32, depth: 0.22, mat: trim, ...(o.cornice || {}) };
          const prof = [[0, -c.h], [c.depth * 0.35, -c.h], [c.depth * 0.45, -c.h * 0.55], [c.depth, -c.h * 0.3], [c.depth, 0], [0, 0]];
          this.sweep(prof.map(([pz, py]) => [pz, py]).map(([pz, py]) => [-pz, py]).reverse(), [[-c.depth, height, 0], [L + c.depth, height, 0]], c.mat, { closed: true, tint: o.trimTint, up: [0, 1, 0] });
        }
        if (side.awning) this.awning({ x0: side.awning.x0 ?? 0.3, x1: side.awning.x1 ?? L - 0.3, y: side.awning.y ?? groundH - 0.35, depth: side.awning.depth ?? 1.4, mat: side.awning.mat, tint: side.awning.tint, style: side.awning.style });
        if (side.sign) this.facadeSign({ x0: side.sign.x0 ?? 0.6, x1: side.sign.x1 ?? L - 0.6, y: side.sign.y ?? groundH - 0.95, h: side.sign.h ?? 0.7, mat: side.sign.mat, tint: side.sign.tint, lit: side.sign.lit });
        if (side.fireEscape !== undefined && side.fireEscape !== false && floors > 1) {
          const nb = Math.max(1, Math.floor((L - 0.8) / win.bay));
          const bw = L / nb;
          const k = Math.min(nb - 1, side.fireEscape | 0);
          this.fireEscape({ x: bw * (k + 0.5), floors, groundH, floorH, width: Math.min(bw * 2 - 0.4, 4.2), rows: side.fireEscapeRows });
        }
        if (side.pipes !== false && this.chance(0.5) && side.type === 'facade') this.downpipe(this.chance(0.5) ? 0.25 : L - 0.25, height);
      });
    }
    // corner quoins: thin stone plates on both faces of every convex corner, alternating long / short
    if (o.quoins) {
      const qh = 0.26, gap = 0.04, dep = 0.035;
      for (let i = 0; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        this.at({ x: a[0], z: a[1], rot: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) }, () => {
          let k = 0;
          for (let y = (plinth ? plinth.h : 0) + 0.05; y < height - qh - 0.2; y += qh + gap, k++) {
            const len = k % 2 ? 0.28 : 0.46;
            for (const [x0, x1] of [[-dep, len], [L - len, L + dep]]) {
              this.box({ x: (x0 + x1) / 2, y, z: dep / 2, w: x1 - x0, h: qh, d: dep, mat: trim, tint: o.trimTint, faces: { nz: false } });
            }
          }
        });
      }
    }
    // roof
    if (roof.type === 'flat') this._flatRoof(poly, height, roof, o);
    else this._gableRoof(poly, height, roof, o);
    if (roof.type === 'flat') info.roofY = height;
    // collision
    if (o.collide !== false) {
      const surf = this.material(mat).surf;
      this.colPrism(poly, enter ? groundH : 0, height, surf);
      if (roof.type === 'flat' && roof.parapet > 0) {
        for (let i = 0; i < n; i++) {
          const a = poly[i], b = poly[(i + 1) % n];
          this.at({ x: a[0], z: a[1], rot: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) }, () => {
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
            this.colBox({ x: L / 2, y: height, z: -0.12, w: L, h: roof.parapet, d: 0.25 }, surf);
          });
        }
      }
    }
    if (enter) this._groundInterior(poly, groundH, t, o, info);
    return info;
  },

  _flatRoof(poly, y, roof, o) {
    const pt = 0.25;
    if (roof.parapet > 0) {
      const inner = insetPoly(poly, pt);
      // parapet inner faces + coping
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], ia = inner[i], ib = inner[(i + 1) % poly.length];
        this.face([[a[0], y, a[1]], [b[0], y, b[1]], [b[0], y + roof.parapet, b[1]], [a[0], y + roof.parapet, a[1]]], o.mat || 'brick_red', { tint: o.tint, grime: null });
        this.face([[ib[0], y, ib[1]], [ia[0], y, ia[1]], [ia[0], y + roof.parapet, ia[1]], [ib[0], y + roof.parapet, ib[1]]], o.mat || 'brick_red', { tint: o.tint, shade: 0.9, grime: { y, h: 0.4, k: 0.35 } });
        const top = y + roof.parapet;
        const ex = 0.04;
        const n1 = edgeNormal(a, b);
        this.face(fixUpFacing([[a[0] + n1[0] * ex, top + 0.08, a[1] + n1[1] * ex], [b[0] + n1[0] * ex, top + 0.08, b[1] + n1[1] * ex], [ib[0], top + 0.08, ib[1]], [ia[0], top + 0.08, ia[1]]]), roof.coping || 'trim_concrete');
        this.face([[a[0] + n1[0] * ex, top, a[1] + n1[1] * ex], [b[0] + n1[0] * ex, top, b[1] + n1[1] * ex], [b[0] + n1[0] * ex, top + 0.08, b[1] + n1[1] * ex], [a[0] + n1[0] * ex, top + 0.08, a[1] + n1[1] * ex]], roof.coping || 'trim_concrete');
        this.face([[ib[0], top, ib[1]], [ia[0], top, ia[1]], [ia[0], top + 0.08, ia[1]], [ib[0], top + 0.08, ib[1]]], roof.coping || 'trim_concrete');
      }
      this.ground(inner, { y: y + 0.02, mat: roof.mat, collide: false });
    } else {
      this.ground(poly, { y, mat: roof.mat, collide: false });
    }
    if (roof.clutter) this._roofClutter(insetPoly(poly, pt + 0.6), y + 0.02, roof);
  },

  _roofClutter(inner, y, roof) {
    // AC units, vents, a hatch; positions sampled inside the inner polygon's bbox
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of inner) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    const area = (x1 - x0) * (z1 - z0);
    if (area < 12) return;
    const count = Math.min(6, Math.floor(area / 40) + 1);
    const placed = [];
    for (let k = 0; k < count * 3 && placed.length < count; k++) {
      const p = [this.rnd(x0 + 1, x1 - 1), this.rnd(z0 + 1, z1 - 1)];
      if (!pointInPoly(p, inner) || placed.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 2.6)) continue;
      placed.push(p);
      const kind = this.pick(['ac', 'ac', 'vent', 'hatch', 'box']);
      const rot = this.pick([0, Math.PI / 2]);
      if (kind === 'ac') {
        this.bbox({ x: p[0], y, z: p[1], rot, w: 1.6, h: 1.0, d: 1.1, bevel: 0.03, mat: 'steel', tint: this.pick(['#cfcfca', '#b9bab5', '#a9a49a']), collide: true });
        this.cyl({ x: p[0], y: y + 1.0, z: p[1], r: 0.38, h: 0.05, seg: 14, mat: 'steel_dark' });
      } else if (kind === 'vent') {
        this.cyl({ x: p[0], y, z: p[1], r: 0.18, h: 0.9, seg: 10, mat: 'steel', collide: true });
        this.cyl({ x: p[0], y: y + 0.9, z: p[1], r: 0.3, r2: 0.05, h: 0.25, seg: 10, mat: 'steel' });
      } else if (kind === 'hatch') {
        this.box({ x: p[0], y, z: p[1], rot, w: 1.0, h: 0.5, d: 1.0, mat: 'trim_concrete', collide: true });
        this.box({ x: p[0], y: y + 0.5, z: p[1], rot, w: 1.05, h: 0.05, d: 1.05, mat: 'metal_painted', tint: '#6d6a62' });
      } else {
        this.box({ x: p[0], y, z: p[1], rot, w: 2.2, h: 1.6, d: 1.3, mat: 'corrugated', collide: true });
      }
    }
  },

  _gableRoof(poly, y, roof, o) {
    // rectangular footprints only: ridge along the longer side
    const pitch = ((roof.pitch ?? 32) * Math.PI) / 180, ov = roof.overhang ?? 0.45;
    const e = poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
    const len = (s) => Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]);
    const i0 = len(e[0]) >= len(e[1]) ? 0 : 1; // long edge index
    const A = e[i0], Bq = e[(i0 + 2) % 4];
    const L = len(A), D = len(e[(i0 + 1) % 4]);
    const ux = (A[1][0] - A[0][0]) / L, uz = (A[1][1] - A[0][1]) / L;
    const nA = edgeNormal(A[0], A[1]);
    const rise = Math.tan(pitch) * (D / 2);
    const mid0 = [(A[0][0] + Bq[1][0]) / 2, (A[0][1] + Bq[1][1]) / 2], mid1 = [(A[1][0] + Bq[0][0]) / 2, (A[1][1] + Bq[0][1]) / 2];
    const ext = (p, s) => [p[0] + ux * s, p[1] + uz * s];
    const r0 = ext(mid0, -ov), r1 = ext(mid1, ov);
    const dropY = Math.tan(pitch) * ov;
    const eave = (p, nrm, s) => [p[0] + nrm[0] * ov, p[1] + nrm[1] * ov, s];
    const a0 = ext(A[0], -ov), a1 = ext(A[1], ov), b0 = ext(Bq[1], -ov), b1 = ext(Bq[0], ov);
    const nB = [-nA[0], -nA[1]];
    const e0 = eave(a0, nA), e1 = eave(a1, nA), f0 = eave(b0, nB), f1 = eave(b1, nB);
    const ry = y + rise, ey = y - dropY;
    const mat = roof.mat || 'roof_shingles';
    // slopes (top) + undersides
    this.face([[e0[0], ey, e0[1]], [e1[0], ey, e1[1]], [r1[0], ry, r1[1]], [r0[0], ry, r0[1]]], mat, { tint: roof.tint });
    this.face([[f1[0], ey, f1[1]], [f0[0], ey, f0[1]], [r0[0], ry, r0[1]], [r1[0], ry, r1[1]]], mat, { tint: roof.tint });
    this.face([[r0[0], ry - 0.12, r0[1]], [r1[0], ry - 0.12, r1[1]], [e1[0], ey - 0.12, e1[1]], [e0[0], ey - 0.12, e0[1]]], 'trim_wood', { tint: '#8c8578' });
    this.face([[r1[0], ry - 0.12, r1[1]], [r0[0], ry - 0.12, r0[1]], [f0[0], ey - 0.12, f0[1]], [f1[0], ey - 0.12, f1[1]]], 'trim_wood', { tint: '#8c8578' });
    // fascia boards
    this.face([[e0[0], ey - 0.12, e0[1]], [e1[0], ey - 0.12, e1[1]], [e1[0], ey, e1[1]], [e0[0], ey, e0[1]]], 'trim_wood', { tint: '#d8d4cc' });
    this.face([[f1[0], ey - 0.12, f1[1]], [f0[0], ey - 0.12, f0[1]], [f0[0], ey, f0[1]], [f1[0], ey, f1[1]]], 'trim_wood', { tint: '#d8d4cc' });
    // gable ends (wall material triangles)
    const g0 = [A[0], Bq[1]], g1 = [Bq[0], A[1]];
    for (const [p, q] of [g0, g1]) {
      const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      this.face([[q[0], y, q[1]], [p[0], y, p[1]], [m[0], ry, m[1]]].reverse().reverse(), o.mat || 'wood_siding', { tint: o.tint, grime: null });
    }
    // collision roof planes
    this.colQuad([e0[0], ey, e0[1]], [e1[0], ey, e1[1]], [r1[0], ry, r1[1]], [r0[0], ry, r0[1]], 'wood');
    this.colQuad([f1[0], ey, f1[1]], [f0[0], ey, f0[1]], [r0[0], ry, r0[1]], [r1[0], ry, r1[1]], 'wood');
  },

  /** Enterable ground floor: interior faces, floor, ceiling, real collision with door gaps. */
  _groundInterior(poly, groundH, t, o, info) {
    const inner = insetPoly(poly, t);
    this.ground(inner, { y: 0.02, mat: o.interiorFloor || 'interior_floor', collide: 'tile' });
    const ceil = inner.map((p) => [p[0], groundH - 0.02, p[1]]);
    this.face(fixUpFacing(ceil).reverse(), 'interior_ceiling');
    void info;
  },

  /** Awning over a shop front (wall-local frame): sloped fabric with valance and side cheeks. */
  awning(a) {
    const { x0, x1, y, depth } = a;
    const drop = a.drop ?? 0.55, val = 0.25;
    const mat = a.mat || 'awning_fabric';
    const tint = a.tint || this.pick(['#ffffff', '#3b6b4a', '#2f4f7a', '#8a7a52', '#5e2a2a']);
    if (a.style === 'flat') {
      this.box({ x: (x0 + x1) / 2, y: y - 0.12, z: depth / 2, w: x1 - x0, h: 0.12, d: depth, mat: 'steel', tint: '#b8b6b0', collide: true });
      return;
    }
    const p = (x, yy, z) => [x, yy, z];
    this.face([p(x0, y - drop, depth), p(x1, y - drop, depth), p(x1, y, 0.02), p(x0, y, 0.02)], mat, { tint });
    this.face([p(x0, y, 0.02), p(x1, y, 0.02), p(x1, y - drop, depth), p(x0, y - drop, depth)], mat, { tint, shade: 0.7 });
    this.face([p(x0, y - drop - val, depth), p(x1, y - drop - val, depth), p(x1, y - drop, depth), p(x0, y - drop, depth)], mat, { tint });
    this.face([p(x1, y - drop - val, depth), p(x0, y - drop - val, depth), p(x0, y - drop, depth), p(x1, y - drop, depth)], mat, { tint, shade: 0.7 });
    for (const xx of [x0, x1]) {
      const s = xx === x0 ? -1 : 1;
      const tri = [p(xx, y, 0.02), p(xx, y - drop, depth), p(xx, y - drop - val, depth), p(xx, y - drop - 0.05, 0.02)];
      this.face(s > 0 ? tri.reverse() : tri, mat, { tint });
      this.face(s > 0 ? tri.slice().reverse() : tri.slice().reverse(), mat, { tint, shade: 0.7 });
    }
  },

  /** Flat fascia sign band (wall-local). lit: adds a warm strip light + baked light. */
  facadeSign(s) {
    const { x0, x1, y, h } = s;
    const mat = s.mat || this.pick(['sign_white', 'sign_red', 'sign_green', 'sign_blue', 'sign_yellow']);
    this.bbox({ x: (x0 + x1) / 2, y, z: 0.07, w: x1 - x0, h, d: 0.14, bevel: 0.02, mat, tint: s.tint });
    // faded lettering blocks
    const n = Math.max(3, Math.floor((x1 - x0) / 0.55));
    const lw = ((x1 - x0) * 0.75) / n;
    const lx0 = (x0 + x1) / 2 - (lw * n) / 2;
    for (let i = 0; i < n; i++) if (this.chance(0.85)) {
      this.box({ x: lx0 + lw * (i + 0.5), y: y + h * 0.22, z: 0.142, w: lw * 0.72, h: h * 0.56, d: 0.008, mat: this.pick(['frame_dark', 'frame_white', 'sign_red']), faces: { nz: false } });
    }
    if (s.lit) {
      this.box({ x: (x0 + x1) / 2, y: y + h + 0.02, z: 0.25, w: x1 - x0 - 0.4, h: 0.06, d: 0.08, mat: 'lamp_warm' });
      this.light({ pos: [(x0 + x1) / 2, y + h * 0.5, 0.8], color: '#ffc98a', intensity: 6, range: 6 });
    }
  },

  /** Vertical downpipe (wall-local x), from roof height to the ground with a kick-out shoe. */
  downpipe(x, height) {
    const r = 0.055, seg = 8;
    const ring = [];
    for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; ring.push([Math.cos(a) * r, Math.sin(a) * r]); }
    this.sweep(ring, [[x, height + 0.1, 0.12], [x, 0.35, 0.12], [x, 0.12, 0.3]], 'steel', { smooth: true, tint: '#8d8c86', up: [0, 0, 1] });
  },

  /**
   * Fire escape on a facade (wall-local frame): platforms at every upper floor, railings, diagonal stairs
   * between platforms and a drop ladder above the street. x = centre along the wall.
   */
  fireEscape(f) {
    const { x, floors, groundH, floorH } = f;
    const W = f.width ?? 3.8, D = 1.25, mat = 'steel_dark';
    const tint = '#5d5853';
    for (let k = 1; k < floors; k++) {
      const y = groundH + (k - 1) * floorH - 0.05;
      // platform grate + frame
      this.box({ x, y, z: D / 2 + 0.02, w: W, h: 0.06, d: D, mat: 'steel_dark', tint: '#4a4642', collide: 'grate' });
      // railings: posts + top rail + mid rail (front + sides)
      const rh = 1.0;
      const posts = Math.max(2, Math.round(W / 1.2) + 1);
      for (let i = 0; i < posts; i++) this.box({ x: x - W / 2 + (W * i) / (posts - 1), y: y + 0.06, z: D - 0.02, w: 0.04, h: rh, d: 0.04, mat, tint });
      for (const ry of [rh, rh * 0.5]) {
        this.box({ x, y: y + 0.06 + ry - 0.03, z: D - 0.02, w: W, h: 0.035, d: 0.035, mat, tint });
        for (const s of [-1, 1]) this.box({ x: x + (s * W) / 2, y: y + 0.06 + ry - 0.03, z: D / 2, w: 0.035, h: 0.035, d: D, mat, tint });
      }
      // collision rail (thin wall)
      this.colBox({ x, y: y + 0.06, z: D - 0.02, w: W, h: rh, d: 0.06 }, 'grate');
      for (const s of [-1, 1]) this.colBox({ x: x + (s * W) / 2, y: y + 0.06, z: D / 2, w: 0.06, h: rh, d: D }, 'grate');
      // brackets
      for (const s of [-1, 1]) this.at({ x: x + s * (W / 2 - 0.1), y: y - 0.02, z: 0.02 }, () => this.sweep([[-0.02, -0.02], [0.02, -0.02], [0.02, 0.02], [-0.02, 0.02]], [[0, 0, 0], [0, 0, D - 0.05], [0, -0.7, 0.02]], mat, { tint }));
      // stairs from this platform up to the next one
      if (k < floors - 1) {
        const y2 = y + floorH, run = W - 0.9;
        const steps = Math.round(floorH / 0.2);
        const sx0 = x - W / 2 + 0.3, sw = 0.6, zc = D * 0.5;
        for (let s = 0; s < steps; s++) {
          const yy = y + 0.06 + ((s + 1) * (y2 - y)) / (steps + 1), xx = sx0 + 0.1 + (s * run) / steps;
          this.box({ x: xx, y: yy - 0.03, z: zc, w: run / steps + 0.05, h: 0.03, d: sw, mat, tint: '#4a4642' });
        }
        for (const dz of [-sw / 2, sw / 2]) this.sweep([[-0.015, -0.08], [0.015, -0.08], [0.015, 0.02], [-0.015, 0.02]], [[sx0, y + 0.06, zc + dz], [sx0 + run + 0.2, y2 + 0.06, zc + dz]], mat, { tint });
      }
    }
    // drop ladder from the first platform
    const y1 = groundH - 0.05;
    const lx = x + W / 2 - 0.45;
    for (const s of [-0.22, 0.22]) this.box({ x: lx + s, y: y1 - 2.4, z: D - 0.15, w: 0.04, h: 2.4, d: 0.04, mat, tint });
    for (let r = 0; r < 7; r++) this.box({ x: lx, y: y1 - 2.3 + r * 0.32, z: D - 0.15, w: 0.44, h: 0.025, d: 0.025, mat, tint });
  },

  /**
   * Straight stairs (visual steps + walkable ramp collision): from [x, y, z] bottom-front centre going along
   * dir (radians, travel direction as rot), rise total, run total, width. sides: stringer material or false.
   */
  stairs(s) {
    const steps = Math.max(2, Math.round(s.rise / (s.stepH ?? 0.18)));
    const rh = s.rise / steps, rd = s.run / steps, mat = s.mat || 'trim_concrete';
    this.at({ x: s.at[0], y: s.at[1], z: s.at[2], rot: s.rot || 0 }, () => {
      for (let i = 0; i < steps; i++) {
        // local -z = travel direction (rot convention: forward = -z)
        this.box({ x: 0, y: i * rh, z: -(i + 0.5) * rd, w: s.width, h: rh, d: rd, mat, faces: { bottom: false }, tint: s.tint });
        if (s.solid !== false) this.box({ x: 0, y: 0, z: -(i + 0.5) * rd, w: s.width, h: i * rh + 1e-3, d: rd, mat, faces: { top: false, bottom: false }, tint: s.tint });
      }
      this.colRamp(this.W([0, 0, 0.05]), this.W([0, s.rise, -s.run]), s.width, this.material(mat).surf);
      if (s.rail) for (const sx of [-s.width / 2, s.width / 2]) {
        this.sweep([[-0.025, -0.025], [0.025, -0.025], [0.025, 0.025], [-0.025, 0.025]], [[sx, 0.95, 0], [sx, s.rise + 0.95, -s.run]], 'steel_dark', {});
      }
    });
  },

  /** Walkable ramp (visual slab + collision). from / to: [x, y, z] centre of the low and high edge, width. */
  ramp(r) {
    const d = V.sub(r.to, r.from);
    const side = V.norm(V.cross([d[0], 0, d[2]], [0, 1, 0]));
    const hw = r.width / 2;
    const a = V.add(r.from, V.scale(side, hw)), b = V.sub(r.from, V.scale(side, hw));
    const c = V.sub(r.to, V.scale(side, hw)), e = V.add(r.to, V.scale(side, hw));
    this.face([b, a, e, c].reverse(), r.mat || 'concrete_floor', {});
    const th = r.thickness ?? 0.2;
    const dn = (p) => [p[0], Math.min(p[1] - th, r.from[1]), p[2]];
    if (r.sides !== false) {
      this.face([a, dn(a), dn(e), e].reverse(), r.side || r.mat || 'concrete_floor', {});
      this.face([b, c, dn(c), dn(b)].reverse(), r.side || r.mat || 'concrete_floor', {});
    }
    this.colQuad(b, a, e, c, this.material(r.mat || 'concrete_floor').surf);
  },
});

export function insetPoly(poly, d) {
  const p = ensureCCW(poly);
  const n = p.length;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    const nn = edgeNormal(a, b);
    lines.push([[a[0] - nn[0] * d, a[1] - nn[1] * d], [b[0] - nn[0] * d, b[1] - nn[1] * d]]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const L1 = lines[(i - 1 + n) % n], L2 = lines[i];
    const r = [L1[1][0] - L1[0][0], L1[1][1] - L1[0][1]], s = [L2[1][0] - L2[0][0], L2[1][1] - L2[0][1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) { out.push(L2[0]); continue; }
    const t = ((L2[0][0] - L1[0][0]) * s[1] - (L2[0][1] - L1[0][1]) * s[0]) / den;
    out.push([L1[0][0] + r[0] * t, L1[0][1] + r[1] * t]);
  }
  return out;
}
export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function minExtent(poly) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  return Math.min(x1 - x0, z1 - z0);
}
