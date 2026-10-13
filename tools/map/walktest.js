// In-game walk test for package maps (tools/map/mapshots.mjs --eval): the real player controller walks nav-grid paths from the
// first player spawn to every spawner exit, supply point, boss-arena entry and buy zone, and reports where it gets
// stuck (an invisible wall, a kerb / step the nav allows but the controller cannot climb, a hole) or falls.
//   node tools/map/mapshots.mjs losttown --eval tools/map/walktest.js --out captures/map/losttown/walk   (long eval: mapshots,
//   not tools/shot.mjs, whose evaluate call times out after 120 s)
// Result: JSON { routes, ok, stuck: [{ to, at, wp }], falls, noPath, seconds } (+ a top-down screenshot of the map).
for (let i = 0; i < 1200 && !(__cf.game && __cf.game.player && __cf.game.world && __cf.game.world.def); i++) await new Promise((r) => setTimeout(r, 500));
__cf.stop();
const g = __cf.game, nav = g.world.nav, def = g.world.def, inp = __cf.input, p = g.player;
if (!nav) return 'no nav grid';
const T0 = performance.now();
const W = nav.w, H = nav.h, cell = nav.cell;
const walk = (k) => k >= 0 && (nav.flags[k] & 1) !== 0;
const cellOf = (x, z) => nav.nearestWalkable(x, z, 8);
const ctr = (k) => [nav.ox + ((k % W) + 0.5) * cell, nav.heights[k], nav.oz + (((k / W) | 0) + 0.5) * cell];
// A* (8-neighbour, no corner cutting, |dh| <= 0.55) with a clearance bias: prefer cells away from non-walkable ones
const clear = new Uint8Array(W * H);
for (let k = 0; k < W * H; k++) {
  if (!walk(k)) continue;
  const i = k % W, j = (k / W) | 0;
  let c = 3;
  for (let r = 1; r <= 3 && c === 3; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const ni = i + di, nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= W || nj >= H || !walk(nj * W + ni)) { c = Math.min(c, r - 1); }
  }
  clear[k] = c;
}
function path(a, b) {
  const N = W * H, gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const bi = b % W, bj = (b / W) | 0;
  const hh = (k) => Math.hypot((k % W) - bi, ((k / W) | 0) - bj);
  // binary min-heap of [f, k]
  const hf = [], hk = [];
  const push = (f, k) => { let i = hf.length; hf.push(f); hk.push(k); while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [hf[p], hf[i]] = [hf[i], hf[p]]; [hk[p], hk[i]] = [hk[i], hk[p]]; i = p; } };
  const pop = () => { const k = hk[0], lf = hf.pop(), lk = hk.pop(); if (hf.length) { hf[0] = lf; hk[0] = lk; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hf.length && hf[l] < hf[m]) m = l; if (r < hf.length && hf[r] < hf[m]) m = r; if (m === i) break; [hf[m], hf[i]] = [hf[i], hf[m]]; [hk[m], hk[i]] = [hk[i], hk[m]]; i = m; } } return k; };
  gs[a] = 0; push(hh(a), a);
  const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (hf.length) {
    const k = pop();
    if (done[k]) continue;
    done[k] = 1;
    if (k === b) break;
    const i = k % W, j = (k / W) | 0;
    for (const [di, dj, c] of N8) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nk = nj * W + ni;
      if (done[nk] || !walk(nk) || Math.abs(nav.heights[nk] - nav.heights[k]) > 0.55) continue;
      if (di && dj && (!walk(j * W + ni) || !walk(nj * W + i))) continue;
      const ng = gs[k] + c + (3 - clear[nk]) * 0.8;
      if (ng < gs[nk]) { gs[nk] = ng; from[nk] = k; push(ng + hh(nk), nk); }
    }
  }
  if (from[b] < 0 && a !== b) return null;
  const out = [];
  for (let k = b; k >= 0; k = from[k]) { out.push(k); if (k === a) break; }
  return out.reverse();
}
const targets = [];
for (const s of def.spawners || []) targets.push([s.id + (s.exit ? ' exit' : ''), s.exit || s.pos]);
(def.supply || []).forEach((s, i) => targets.push(['supply ' + i, Array.isArray(s) ? s : s.pos]));
for (const [n, a] of Object.entries(def.bossArenas || {})) targets.push(['boss ' + n, a.center]);
const sp0 = def.def?.playerSpawns?.[0] || def.playerSpawns[0];   // world.def.playerSpawns are Vector3s, def.def the raw map.json
const sp = Array.isArray(sp0) ? sp0 : [sp0.x, sp0.y, sp0.z];
const start = cellOf(sp[0], sp[2]);
const res = { routes: 0, ok: 0, stuck: [], falls: [], noPath: [] };
const dt = 1 / 60;
for (const [name, tp] of targets) {
  const goal = cellOf(tp[0], tp[2]);
  if (goal < 0) { res.noPath.push(name + ' (no cell)'); continue; }
  const cp = path(start, goal);
  if (!cp) { res.noPath.push(name); continue; }
  res.routes++;
  const wps = cp.filter((_, i) => i % 3 === 0 || i === cp.length - 1).map(ctr);
  p.pos.set(sp[0], sp[1] + 0.05, sp[2]);
  p.vel?.set?.(0, 0, 0);
  let w = 1, best = Infinity, still = 0, frames = 0, failed = false, jumps = 0;
  while (w < wps.length && frames < 60 * 90) {
    const [tx, ty, tz] = wps[w];
    const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.6) { w++; best = Infinity; still = 0; jumps = 0; continue; }
    p.yaw = Math.atan2(-dx, -dz); p.pitch = 0;
    inp.stick.x = 0; inp.stick.y = 1;
    g.frame(dt); frames++;
    inp.state.pressed.jump = false; inp.release('jump');
    if (p.pos.y < ty - 1.2 && ty > 1) { res.falls.push({ to: name, at: [+p.pos.x.toFixed(1), +p.pos.y.toFixed(2), +p.pos.z.toFixed(1)] }); failed = true; break; }
    // like a player: blocked for 0.4 s -> jump (vault a 0.55 m window sill, hop a kerb); still blocked after 2 jumps -> stuck
    if (d < best - 0.05) { best = d; still = 0; } else if (++still === 24 && jumps < 2) { jumps++; still = 0; res.jumps = (res.jumps || 0) + 1; inp.press('jump'); } else if (still > 75) {
      res.stuck.push({ to: name, at: [+p.pos.x.toFixed(1), +p.pos.y.toFixed(2), +p.pos.z.toFixed(1)], wp: [+tx.toFixed(1), +ty.toFixed(2), +tz.toFixed(1)] });
      failed = true; break;
    }
  }
  inp.stick.y = 0;
  if (!failed && w >= wps.length) res.ok++;
  else if (!failed) res.stuck.push({ to: name, at: [+p.pos.x.toFixed(1), +p.pos.y.toFixed(2), +p.pos.z.toFixed(1)], wp: 'timeout' });
}
res.seconds = +((performance.now() - T0) / 1000).toFixed(1);
// top-down picture (the game bundle is an IIFE: no THREE import here, the stuck list is the result)
p.pos.set(0, 70, 8); p.yaw = 0; p.pitch = 1.45;
if (g.vm) g.vm.visible = false;
document.querySelectorAll('#hud, .fe-lockhint, #fe').forEach((e) => { e.style.display = 'none'; });
g.frame(dt); p.pos.set(0, 70, 8); p.yaw = 0; p.pitch = 1.45; g.frame(dt); g.render();
return JSON.stringify(res);
