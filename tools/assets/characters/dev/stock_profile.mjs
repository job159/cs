// dev: top / bottom profile of rifle stocks (weapon space from S_grip_r): node stock_profile.mjs akm m4
import path from 'node:path';
import { loadWeapon } from '../collide.mjs';
for (const id of process.argv.slice(2)) {
  const w = loadWeapon(path.resolve('game/assets/weapons', id + '.glb'));
  const bins = new Map();
  for (let i = 0; i < w.verts.length; i += 3) {
    const x = w.verts[i], y = w.verts[i + 1], z = w.verts[i + 2];
    if (z < -0.05 || Math.abs(x) > 0.03) continue;
    const k = Math.round(z / 0.02);
    const b = bins.get(k) || { top: -1, bot: 1, wid: 0 };
    b.top = Math.max(b.top, y); b.bot = Math.min(b.bot, y); b.wid = Math.max(b.wid, Math.abs(x));
    bins.set(k, b);
  }
  console.log(id, 'sight', JSON.stringify(Object.fromEntries(Object.entries(w.points).map(([k, v]) => [k, v.toArray().map((x) => +x.toFixed(3))]))));
  console.log([...bins.entries()].sort((a, b) => a[0] - b[0]).map(([k, b]) => `z${(k * 0.02).toFixed(2)}: ${b.bot.toFixed(3)}..${b.top.toFixed(3)} w${b.wid.toFixed(3)}`).join('\n'));
}
