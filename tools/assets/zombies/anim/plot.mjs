// Diagnostic plot (PNG) of foot contact points for locomotion clips: for each clip a row showing
// heel / toe height over the treadmill-compensated forward position (left = l foot blue, right
// = r foot orange). Planted contacts show as tight horizontal clusters at height 0; sliding shows
// as smears along the ground line.
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { footPoints } from './ik.mjs';

export function plotFeet(skel, clips, file, { W = 1400, rowH = 120, scaleX = 260, scaleY = 900, cycles = 2 } = {}) {
  const H = rowH * clips.length;
  const png = new PNG({ width: W, height: H });
  png.data.fill(24);
  for (let k = 3; k < png.data.length; k += 4) png.data[k] = 255;
  const dot = (x, y, c, r = 1) => {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const X = Math.round(x + dx), Y = Math.round(y + dy);
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const i = (Y * W + X) * 4; png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2];
    }
  };
  clips.forEach((clip, row) => {
    const base = row * rowH + rowH - 20;
    for (let x = 0; x < W; x++) dot(x, base, [70, 70, 70], 0);
    for (let x = 0; x < W; x += scaleX / 4) for (let y = base - 3; y <= base + 3; y++) dot(x, y, [70, 70, 70], 0);
    const v = clip.meta?.speed || 0;
    const n = clip.poses.length;
    const frames = clip.loop ? (n - 1) * cycles : n;
    for (let f = 0; f < frames; f++) {
      const p = clip.poses[clip.loop ? f % (n - 1) : f];
      const fk = skel.fk(p);
      const t = f / clip.fps;
      for (const s of ['l', 'r']) {
        const fp = footPoints(skel, fk, s);
        for (const k of ['heel', 'toe']) {
          const q = fp[k];
          const X = 40 + (q.z + v * t + 0.5) * scaleX;
          const Y = base - q.y * scaleY;
          const c = s === 'l' ? (k === 'heel' ? [90, 160, 255] : [160, 210, 255]) : (k === 'heel' ? [255, 150, 70] : [255, 210, 150]);
          dot(X, Y, c, 1);
        }
      }
    }
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}
