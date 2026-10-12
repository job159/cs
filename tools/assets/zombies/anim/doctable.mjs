// Writes the generated clip table of docs/ZOMBIE_ANIMS.md (between <!-- clips:begin --> / <!-- clips:end -->).
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './skeleton.mjs';

export function writeDocTable(clips, meta) {
  const doc = path.join(REPO, 'docs', 'ZOMBIE_ANIMS.md');
  if (!fs.existsSync(doc)) return;
  const rows = clips.map((c) => {
    const m = meta[c.name];
    const extra = [
      m.events && 'events: ' + Object.entries(m.events).map(([k, v]) => `${k} ${v}s`).join(', '),
      m.rootMotion && `root drift z ${m.rootMotion.z} m`,
      m.travel && `travel ${m.travel} m`,
      m.climbSpeed && `climbSpeed ${m.climbSpeed} m/s`,
    ].filter(Boolean).join('; ');
    const notes = (m.notes || '').replace(/\|/g, '/');
    return `| \`${c.name}\` | ${m.duration.toFixed(2)} | ${m.loop ? 'loop' : 'once'} | ${m.speed ? m.speed.toFixed(2) : '-'} | ${m.source} | ${notes}${extra ? ` (${extra})` : ''} |`;
  });
  const table = ['| Clip | Duration (s) | Loop | Speed (m/s) | Source | Notes |', '|---|---|---|---|---|---|', ...rows].join('\n');
  let s = fs.readFileSync(doc, 'utf8');
  const a = s.indexOf('<!-- clips:begin'), b = s.indexOf('<!-- clips:end -->');
  if (a < 0 || b < a) return;
  s = s.slice(0, s.indexOf('\n', a) + 1) + table + '\n' + s.slice(b);
  fs.writeFileSync(doc, s);
}
