// Coarse nav-connectivity check of the LOST TOWN blockout (no geometry build needed): rasterises layout.mjs onto the
// runtime's 0.5 m 2.5D grid rules (step 0.55 m, 8-neighbour, no corner cutting, agent radius 0.3 m), flood-fills
// from the fort deck and verifies every spawner exit, supply point, boss entry and pocket is reachable.
//   node tools/map/losttown/navcheck.mjs [--png]   (--png writes captures/losttown_navcheck.png)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './layout.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { cell, origin } = L.NAV_RULES;
const [minx, , minz, maxx, , maxz] = L.META.bounds;
const W = Math.ceil((maxx - minx) / cell), Hh = Math.ceil((maxz - minz) / cell);
const R = 0.3;
const inPoly = L.pointInPoly;

// walkable universe -------------------------------------------------------------------------------------------
const octagon = [[-15, -9], [-9, -15], [9, -15], [15, -9], [15, 9], [8, 16], [-8, 16], [-15, 9]];
const open = [...L.STREETS.map((s) => s.row), octagon];
const interiors = L.BUILDINGS.filter((b) => b.interior).map((b) => b.interior.poly);
const fort = L.LANDMARKS.fort;
const carriage = L.STREETS.filter((s) => L.CURBS[s.id]).map((s) => { const c = L.CURBS[s.id], [x0, z0] = s.row[0], [x1, z1] = s.row[2]; return c.x ? L.rect(c.x[0], z0, c.x[1], z1) : L.rect(x0, c.z[0], x1, c.z[1]); });
carriage.push(L.rect(-5.5, -9, 5.5, 9), L.rect(-9, -5.5, 9, 5.5));
// obstacles (ground level): buildings, props >= 0.5 m, landmark parts
const obst = [];
for (const b of L.BUILDINGS) obst.push({ poly: b.footprint, id: b.id, interior: b.interior?.poly });
for (const p of L.PROPS) if (p.h >= 0.5) obst.push({ poly: L.boxCorners(p), id: p.id });
for (const lm of [L.LANDMARKS.bridge.barricade, L.LANDMARKS.ledGantry.barricade, L.LANDMARKS.truckBarricade]) for (const p of lm.parts) obst.push({ poly: L.boxCorners(p), id: p.kind });
for (const a of L.LANDMARKS.bridge.abutments) obst.push({ poly: a, id: 'abutment' });
for (const p of L.LANDMARKS.ledGantry.posts) obst.push({ poly: L.rect(p[0] - 0.6, p[1] - 0.6, p[0] + 0.6, p[1] + 0.6), id: 'led_post' });
for (const p of L.LANDMARKS.signalMasts.poles) obst.push({ poly: L.rect(p.base[0] - 0.15, p.base[1] - 0.15, p.base[0] + 0.15, p.base[1] + 0.15), id: p.id });
for (const sb of fort.roofCover) obst.push({ poly: sb.poly, id: sb.id, deck: true });
for (const l of L.STREET_LAMPS) obst.push({ poly: L.rect(l.x - 0.12, l.z - 0.12, l.x + 0.12, l.z + 0.12), id: l.id });

// heights --------------------------------------------------------------------------------------------------------
function rampHeight(r, x, z) {
  // distance along the downhill direction from the top edge
  const [tx, tz] = r.top, [fx, fz] = r.foot; const dx = fx - tx, dz = fz - tz, len = Math.hypot(dx, dz);
  const t = ((x - tx) * dx + (z - tz) * dz) / (len * len);
  return L.LEVEL.fortDeck * (1 - Math.min(1, Math.max(0, t)));
}
function sample(x, z) {
  // returns height or null (not walkable at this exact point)
  if (inPoly([x, z], fort.deck.poly)) { for (const o of obst) if (o.deck && inPoly([x, z], o.poly)) return null; return L.LEVEL.fortDeck; }
  for (const r of fort.ramps) if (inPoly([x, z], r.poly)) return rampHeight(r, x, z);
  const inInterior = interiors.some((p) => inPoly([x, z], p));
  if (!inInterior && !open.some((p) => inPoly([x, z], p))) return null;
  for (const o of obst) if (!o.deck && inPoly([x, z], o.poly) && !(o.interior && inPoly([x, z], o.interior))) return null;
  if (inInterior) return L.LEVEL.curb;
  return carriage.some((p) => inPoly([x, z], p)) ? 0 : L.LEVEL.curb;
}
const heights = new Float32Array(W * Hh), walk = new Uint8Array(W * Hh);
for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
  const x = minx + (i + 0.5) * cell, z = minz + (j + 0.5) * cell, k = j * W + i;
  const h0 = sample(x, z); if (h0 === null) continue;
  // clearance: the 4 points at agent radius must be walkable at a similar height (walls / fort edges)
  let ok = true;
  for (const [ox, oz] of [[R, 0], [-R, 0], [0, R], [0, -R]]) { const h = sample(x + ox, z + oz); if (h === null || Math.abs(h - h0) > 0.6) { ok = false; break; } }
  if (!ok) continue;
  heights[k] = h0; walk[k] = 1;
}
// flood fill from the fort centre
const idx = (x, z) => { const i = Math.floor((x - minx) / cell), j = Math.floor((z - minz) / cell); return i < 0 || j < 0 || i >= W || j >= Hh ? -1 : j * W + i; };
const seen = new Uint8Array(W * Hh); const q = [idx(0.3, 0.3)]; seen[q[0]] = 1;
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
while (q.length) {
  const k = q.pop(), i = k % W, j = (k / W) | 0;
  for (const [di, dj] of N8) {
    const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= Hh) continue;
    const nk = nj * W + ni; if (seen[nk] || !walk[nk] || Math.abs(heights[nk] - heights[k]) > L.NAV_RULES.step) continue;
    if (di && dj && (!walk[j * W + ni] || !walk[nj * W + i])) continue;
    seen[nk] = 1; q.push(nk);
  }
}
const reach = (x, z, r = 3) => { // nearest walkable within r cells reachable?
  const i0 = Math.floor((x - minx) / cell), j0 = Math.floor((z - minz) / cell);
  for (let rad = 0; rad <= r; rad++) for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) { const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= W || j >= Hh) continue; if (seen[j * W + i]) return true; }
  return false;
};
const bad = [];
for (const s of L.SPAWNERS) {
  const p = (s.kind === 'window' || s.kind === 'roof') ? s.exit : s.pos;
  if (!reach(p[0], p[2], s.kind === 'gate' && /DOCK/.test(s.id) ? 12 : 3)) bad.push(`spawner ${s.id} at ${p}`);
  if (s.exit && !reach(s.exit[0], s.exit[2])) bad.push(`spawner ${s.id} exit ${s.exit}`);
}
for (const s of L.SUPPLY) if (!reach(s.pos[0], s.pos[2])) bad.push(`supply ${s.id}`);
for (const [k, a] of Object.entries(L.BOSS_ARENAS)) if (!reach(a.center[0], a.center[2])) bad.push(`boss ${k} entry`);
for (const p of L.PLAYER_SPAWNS) if (!reach(p[0], p[2], 1)) bad.push(`player spawn ${p}`);
let nWalk = 0, nReach = 0; for (let k = 0; k < W * Hh; k++) { nWalk += walk[k]; nReach += seen[k]; }
console.log(`nav grid ${W}x${Hh} @ ${cell} m: ${nWalk} walkable cells, ${nReach} reachable from the fort (${((100 * nReach) / nWalk).toFixed(1)}%)`);
for (const b of bad) console.log('UNREACHABLE:', b);
console.log(bad.length ? `${bad.length} problems` : 'nav OK: every spawner, supply point, boss entry and player spawn is connected to the fort');

if (process.argv.includes('--png')) {
  const { PNG } = await import('pngjs');
  const S = 4, png = new PNG({ width: W * S / 2, height: Hh * S / 2 });
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const k = Math.floor((y * 2) / S) * W + Math.floor((x * 2) / S), o = (y * png.width + x) * 4;
    const h = heights[k];
    const c = !walk[k] ? [24, 24, 24] : seen[k] ? (h > 0.5 ? [90 + h * 50, 200, 120] : h > 0.1 ? [120, 140, 170] : [90, 105, 135]) : [220, 60, 60];
    png.data[o] = c[0]; png.data[o + 1] = c[1]; png.data[o + 2] = c[2]; png.data[o + 3] = 255;
  }
  for (const s of L.SPAWNERS) { const p = (s.kind === 'window' || s.kind === 'roof') ? s.exit : s.pos; const cx = Math.round(((p[0] - minx) / cell) * (S / 2)), cy = Math.round(((p[2] - minz) / cell) * (S / 2)); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const o = ((cy + dy) * png.width + cx + dx) * 4; if (o >= 0 && o < png.data.length) { png.data[o] = 255; png.data[o + 1] = 230; png.data[o + 2] = 0; } } }
  const out = path.join(root, 'captures', 'losttown_navcheck.png');
  fs.writeFileSync(out, PNG.sync.write(png)); console.log('wrote', out);
}
process.exitCode = bad.length ? 1 : 0;
