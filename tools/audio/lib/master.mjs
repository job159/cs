// Mastering: loudness normalisation with a true-peak ceiling, plus the standard "finalize" chain every shipped
// sound goes through (resample -> channel policy -> DC removal -> LUFS -> true-peak limit -> edge fades).
import { SR, db2lin, lin2db } from './buffer.mjs';
import { lufs as measureLufs, truePeak } from './loudness.mjs';
import { limit } from './dynamics.mjs';
import { resample } from './resample.mjs';
import { scale, toMono, toStereo, removeDC, fadeIn, fadeOut, edgeLevels } from './edit.mjs';

/**
 * Bring `buf` to `target` LUFS (integrated) with true peak <= `ceiling` dBTP. If the gain needed would push peaks
 * over the ceiling, a lookahead true-peak limiter takes the overs, and the gain is re-iterated so the final
 * loudness still lands on target (±tolerance). Result carries .meta = { lufs, truePeakDb, gainDb, limitedDb, iterations }.
 * limitedDb > ~3 dB means the material is too peaky for the target — shape it first (transientShaper/softClip/compress).
 */
export function normalizeLufs(buf, target, { ceiling = -1, tolerance = 0.1, maxIter = 10, limiter = {} } = {}) {
  const L0 = measureLufs(buf);
  if (!Number.isFinite(L0)) { const c = buf.clone(); c.meta = { lufs: L0, truePeakDb: -Infinity, gainDb: 0, limitedDb: 0, iterations: 0 }; return c; }
  let g = target - L0, out = null, L = L0, it = 0, limitedDb = 0, prev = null;
  for (; it < maxIter; it++) {
    const pre = scale(buf, db2lin(g));
    out = truePeak(pre) > db2lin(ceiling) ? limit(pre, { ceiling, ...limiter }) : pre;
    L = measureLufs(out);
    limitedDb = (L0 + g) - L;
    if (Math.abs(target - L) <= tolerance) break;
    // secant step: under heavy limiting 1 dB of gain buys < 1 dB of loudness
    let slope = 1;
    if (prev && Math.abs(g - prev[0]) > 1e-3) slope = Math.min(1, Math.max(0.05, (L - prev[1]) / (g - prev[0])));
    prev = [g, L];
    g += (target - L) / slope;
    if (g - (target - L0) > 30) break; // runaway safety: material can't reach target
  }
  out.meta = { lufs: L, truePeakDb: lin2db(truePeak(out)), gainDb: g, limitedDb, iterations: it + 1 };
  return out;
}

/**
 * Standard finishing chain for a shipped one-shot or loop.
 *   lufs: target (required unless normalize=false), ceiling (dBTP, -1), channels: 1 | 2 | undefined (keep, max 2),
 *   loop (no fades; mean-based DC removal), sampleRate (48000), fadeInSec / fadeOutSec (only applied when the edge
 *   is not already quiet), normalize (true)
 */
export function finalize(buf, { lufs, ceiling = -1, channels, loop = false, sampleRate = SR, fadeInSec = 0.0015, fadeOutSec = 0.008, normalize = true, limiter } = {}) {
  let b = buf;
  if (b.sampleRate !== sampleRate) b = resample(b, sampleRate);
  if (channels === 1 && b.channels !== 1) b = toMono(b);
  else if (channels === 2 && b.channels !== 2) b = toStereo(b);
  else if (b.channels > 2) b = toStereo(b);
  b = removeDC(b, { mode: loop ? 'mean' : 'hp' });
  if (normalize) {
    if (lufs === undefined) throw new Error('finalize: lufs target required (or normalize: false)');
    b = normalizeLufs(b, lufs, { ceiling, limiter });
  }
  const meta = b.meta;
  if (!loop) {
    const e = edgeLevels(b);
    if (e.startDb > -60) b = fadeIn(b, fadeInSec, 'sine');
    if (e.endDb > -60) b = fadeOut(b, fadeOutSec, 'sine');
  }
  // final safety: fades never raise peaks, but guard against NaN / inf from upstream processing
  for (const d of b.data) for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i])) d[i] = 0;
  b.meta = meta;
  return b;
}

