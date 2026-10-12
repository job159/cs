// dev helper: prints hips trajectory of CMU takes (seconds, x, z, y, speed, heading)
import { cmu } from './sources.mjs';
for (const t of process.argv.slice(2)) {
  const m = cmu(t, { fps: 10 });
  const h = m.names.indexOf('Hips');
  console.log('==', t, m.frames / 10, 's');
  let line = [];
  for (let f = 0; f < m.frames; f += 5) {
    const p = m.worldP[f][h], q = m.worldP[Math.min(f + 5, m.frames - 1)][h];
    const sp = Math.hypot(q.x - p.x, q.z - p.z) / 0.5, hd = Math.atan2(q.x - p.x, q.z - p.z) * 180 / Math.PI;
    line.push(`${(f / 10).toFixed(1)}s(${p.x.toFixed(1)},${p.z.toFixed(1)} y${p.y.toFixed(2)} v${sp.toFixed(2)} h${hd.toFixed(0)})`);
  }
  console.log(line.join(' '));
}
