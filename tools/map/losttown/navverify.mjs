// Nav / gameplay-data check of the COMPILED Lost Town package (game/assets/maps/losttown/): reads nav.json/.bin
// and map.json, flood-fills the grid from the fort deck with the runtime's rules (game/src/world/nav.js: step 0.55 m,
// 8-neighbour, no corner cutting) and verifies that every player spawn, spawner (pos via nearestWalkable like the
// runtime, and its exit), supply point, buy zone and boss-arena entry sits on / next to a reachable cell, that the
// boss arenas are clear of low obstacles, and that no walkable island is left disconnected.
//   node tools/map/losttown/navverify.mjs [--png [file]] [--map dir]
// --png writes a top-down picture (default captures/map/losttown/nav.png, 4 px per 0.5 m cell):
//   blue = street (y < 0.1), slate = sidewalk / floors, green ramp = fort deck + ramps, purple = CLIMB, red = walkable
//   but NOT connected to the fort, dark = not walkable; yellow dots = spawners (orange = their exits), cyan = supply,
//   white = player spawns, magenta rings = boss arenas; thin grey lines = build-zone seams (|x| or |z| = 26).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const dir = path.resolve(ROOT, opt('map', 'game/assets/maps/losttown'));
const def = JSON.parse(fs.readFileSync(path.join(dir, 'map.json'), 'utf8'));
const nj = JSON.parse(fs.readFileSync(path.join(dir, 'nav.json'), 'utf8'));
const bin = fs.readFileSync(path.join(dir, 'nav.bin'));
const { w: W, h: H, cell } = nj;
const [ox, oz] = nj.origin;
const N = W * H;
const heights = new Float32Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + N * 4));
const flags = new Uint8Array(bin.buffer.slice(bin.byteOffset + N * 4, bin.byteOffset + N * 5));
const STEP = 0.55;
const WALK = 1, CLIMB = 4, BLOCK = 8;
const walk = (k) => k >= 0 && (flags[k] & WALK) !== 0;
const idx = (x, z) => { const i = Math.floor((x - ox) / cell), j = Math.floor((z - oz) / cell); return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i; };
const nearest = (x, z, r = 6) => {
  const i0 = Math.floor((x - ox) / cell), j0 = Math.floor((z - oz) / cell);
  for (let rad = 0; rad <= r; rad++) for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== rad) continue;
    const i = i0 + di, j = j0 + dj;
    if (i < 0 || j < 0 || i >= W || j >= H) continue;
    if (walk(j * W + i)) return j * W + i;
  }
  return -1;
};

// ---- flood fill from the fort deck (runtime rules)
const seen = new Uint8Array(N);
const start = nearest(0.3, 0.3, 8);
if (start < 0) { console.error('no walkable cell at the fort centre'); process.exit(1); }
const q = new Int32Array(N);
let qh = 0, qt = 0;
q[qt++] = start; seen[start] = 1;
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
while (qh < qt) {
  const k = q[qh++], i = k % W, j = (k / W) | 0;
  for (const [di, dj] of N8) {
    const ni = i + di, nj2 = j + dj;
    if (ni < 0 || nj2 < 0 || ni >= W || nj2 >= H) continue;
    const nk = nj2 * W + ni;
    if (seen[nk] || !walk(nk) || Math.abs(heights[nk] - heights[k]) > STEP) continue;
    if (di && dj && (!walk(j * W + ni) || !walk(nj2 * W + i))) continue;
    seen[nk] = 1; q[qt++] = nk;
  }
}
let nWalk = 0, nReach = 0;
for (let k = 0; k < N; k++) { if (walk(k)) nWalk++; if (seen[k]) nReach++; }

// ---- islands (walkable but disconnected), grouped
const isl = new Int32Array(N).fill(-1);
const islands = [];
for (let k0 = 0; k0 < N; k0++) {
  if (!walk(k0) || seen[k0] || isl[k0] >= 0) continue;
  const id = islands.length, cells = [];
  const st = [k0]; isl[k0] = id;
  while (st.length) {
    const k = st.pop(); cells.push(k);
    const i = k % W, j = (k / W) | 0;
    for (const [di, dj] of N8) {
      const ni = i + di, nj2 = j + dj;
      if (ni < 0 || nj2 < 0 || ni >= W || nj2 >= H) continue;
      const nk = nj2 * W + ni;
      if (isl[nk] >= 0 || seen[nk] || !walk(nk) || Math.abs(heights[nk] - heights[k]) > STEP) continue;
      isl[nk] = id; st.push(nk);
    }
  }
  let sx = 0, sz = 0, sy = 0;
  for (const k of cells) { sx += ox + ((k % W) + 0.5) * cell; sz += oz + (((k / W) | 0) + 0.5) * cell; sy += heights[k]; }
  islands.push({ id, n: cells.length, at: [+(sx / cells.length).toFixed(1), +(sy / cells.length).toFixed(2), +(sz / cells.length).toFixed(1)] });
}
islands.sort((a, b) => b.n - a.n);

// ---- gameplay points
const bad = [], warn = [];
const reachAt = (x, z, r) => { const k = nearest(x, z, r); return k >= 0 && seen[k] ? k : -1; };
const fmt = (p) => `[${p.map((v) => +(+v).toFixed(1)).join(', ')}]`;
for (const [n, p] of (def.playerSpawns || []).entries()) {
  const k = idx(p[0], p[2]);
  if (!walk(k) || !seen[k]) bad.push(`player spawn ${n} ${fmt(p)} not on a reachable cell`);
  else if (Math.abs(heights[k] - p[1]) > 0.3) warn.push(`player spawn ${n} y ${p[1]} vs nav ${heights[k].toFixed(2)}`);
}
for (const s of def.spawners || []) {
  // runtime: nearestWalkable(pos) within 10 cells (window / roof spawners drop to the sidewalk)
  const k = reachAt(s.pos[0], s.pos[2], 10); // ZombieManager.spawn: nav.nearestWalkable(x, z, 10)
  if (k < 0) bad.push(`spawner ${s.id} (${s.kind}) ${fmt(s.pos)}: nearest walkable cell (5 m search) is not connected to the fort`);
  else {
    const d = Math.hypot(ox + ((k % W) + 0.5) * cell - s.pos[0], oz + (((k / W) | 0) + 0.5) * cell - s.pos[2]);
    if (d > 1.6 && s.kind !== 'window' && s.kind !== 'roof') warn.push(`spawner ${s.id} snaps ${d.toFixed(1)} m to the nav`);
  }
  if (s.exit && reachAt(s.exit[0], s.exit[2], 3) < 0) bad.push(`spawner ${s.id} exit ${fmt(s.exit)} unreachable`);
}
for (const [n, p] of (def.supply || []).entries()) {
  const pos = Array.isArray(p) ? p : p.pos;
  if (reachAt(pos[0], pos[2], 3) < 0) bad.push(`supply ${n} ${fmt(pos)} unreachable`);
}
for (const b of def.buy || []) if (reachAt(b[0], b[2], 4) < 0) bad.push(`buy zone ${fmt(b)} unreachable`);
for (const [name, a] of Object.entries(def.bossArenas || {})) {
  const c = a.center;
  if (reachAt(c[0], c[2], 4) < 0) bad.push(`boss arena ${name} entry ${fmt(c)} unreachable`);
  // clearance: the boss footprint (radius 1.8 m final, 1.0 m mid) around the entry must be walkable
  const br = name === 'final' ? 1.8 : 1.0;
  let blocked = 0, tot = 0;
  for (let dz = -br; dz <= br; dz += cell) for (let dx = -br; dx <= br; dx += cell) {
    if (dx * dx + dz * dz > br * br) continue;
    tot++; if (!seen[idx(c[0] + dx, c[2] + dz)]) blocked++;
  }
  if (blocked) warn.push(`boss arena ${name}: ${blocked}/${tot} cells of the ${br} m entry footprint not walkable`);
  // share of the arena disc that is reachable street (for the report)
  let rs = 0, rt = 0;
  for (let dz = -a.radius; dz <= a.radius; dz += 1) for (let dx = -a.radius; dx <= a.radius; dx += 1) {
    if (dx * dx + dz * dz > a.radius * a.radius) continue;
    const k = idx(c[0] + dx, c[2] + dz); rt++; if (k >= 0 && seen[k]) rs++;
  }
  a._open = rs / Math.max(1, rt);
}

console.log(`nav ${W} x ${H} @ ${cell} m (origin ${ox}, ${oz}): ${nWalk.toLocaleString()} walkable, ${nReach.toLocaleString()} connected to the fort (${((100 * nReach) / nWalk).toFixed(1)} %)`);
const climb = flags.reduce((s, f) => s + ((f & CLIMB) ? 1 : 0), 0), block = flags.reduce((s, f) => s + ((f & BLOCK) ? 1 : 0), 0);
console.log(`flags: ${climb} CLIMB, ${block} BLOCK cells`);
if (islands.length) {
  console.log(`${islands.length} disconnected walkable islands (${islands.reduce((s, i) => s + i.n, 0)} cells); largest:`);
  for (const i of islands.slice(0, 12)) console.log(`  ${String(i.n).padStart(5)} cells around ${fmt(i.at)}`);
}
for (const [name, a] of Object.entries(def.bossArenas || {})) console.log(`boss arena ${name}: centre ${fmt(a.center)} r ${a.radius} m, ${(a._open * 100).toFixed(0)} % of the disc is reachable ground`);
for (const w of warn) console.log('WARN:', w);
for (const b of bad) console.log('FAIL:', b);
console.log(bad.length ? `${bad.length} problems` : `OK: ${def.playerSpawns.length} player spawns, ${def.spawners.length} spawners, ${def.supply.length} supply points, ${def.buy.length} buy zone(s) and ${Object.keys(def.bossArenas).length} boss entries are connected to the fort`);

if (args.includes('--png')) {
  const { PNG } = await import('pngjs');
  const S = 4;
  const png = new PNG({ width: W * S, height: H * S });
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= png.width || y >= png.height) return; const o = (y * png.width + x) * 4; png.data[o] = c[0]; png.data[o + 1] = c[1]; png.data[o + 2] = c[2]; png.data[o + 3] = 255; };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, h = heights[k];
    let c;
    if (!walk(k)) c = (flags[k] & BLOCK) ? [60, 30, 30] : [22, 22, 24];
    else if (!seen[k]) c = [230, 50, 50];
    else if (flags[k] & CLIMB) c = [150, 90, 200];
    else if (h > 0.5) c = [70 + Math.min(150, h * 50), 200, 110];
    else if (h > 0.1) c = [118, 132, 160];
    else if (h < -0.02) c = [255, 160, 40];
    else c = [70, 88, 125];
    // grid shading every 2 m for scale
    const g = ((i * cell) % 10 < cell || (j * cell) % 10 < cell) ? 0.85 : 1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(i * S + x, j * S + y, c.map((v) => v * g));
  }
  const toPx = (x, z) => [Math.round(((x - ox) / cell) * S), Math.round(((z - oz) / cell) * S)];
  // zone seams
  for (const v of [-26, 26]) {
    for (let z = oz; z < oz + H * cell; z += 0.25) { const [px, py] = toPx(v, z); put(px, py, [150, 150, 150]); }
    for (let x = ox; x < ox + W * cell; x += 0.25) { const [px, py] = toPx(x, v); put(px, py, [150, 150, 150]); }
  }
  const dot = (x, z, r, c) => { const [cx, cy] = toPx(x, z); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) put(cx + dx, cy + dy, c); };
  const ring = (x, z, R, c) => { for (let a = 0; a < Math.PI * 2; a += 0.004) { const [px, py] = toPx(x + Math.cos(a) * R, z + Math.sin(a) * R); put(px, py, c); put(px + 1, py, c); } };
  for (const a of Object.values(def.bossArenas || {})) { ring(a.center[0], a.center[2], a.radius, [255, 60, 255]); dot(a.center[0], a.center[2], 6, [255, 60, 255]); }
  for (const s of def.spawners || []) { if (s.exit) dot(s.exit[0], s.exit[2], 3, [255, 140, 0]); dot(s.pos[0], s.pos[2], 5, [255, 230, 0]); }
  for (const p of def.supply || []) { const pos = Array.isArray(p) ? p : p.pos; dot(pos[0], pos[2], 4, [0, 230, 255]); }
  for (const p of def.playerSpawns || []) dot(p[0], p[2], 3, [255, 255, 255]);
  const out = path.resolve(ROOT, opt('png', 'captures/map/losttown/nav.png'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log('wrote', path.relative(ROOT, out));
}
process.exitCode = bad.length ? 1 : 0;
