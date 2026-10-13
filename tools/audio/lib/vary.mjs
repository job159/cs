// Variant generation — "avoid the machine-gun effect" (research 03 §4.12: 4-8 variants per layer, pitch ±3-5 %,
// level ±1-2 dB). Pitch moves are tape-style (varispeed: pitch and length change together, transients stay intact).
//
//   const vs = variations(shot, 6, { seed: 'ak_close' });          // 6 Bufs, each with .meta { semis, gainDb, tiltDb }
//   const vs = variations(step, 5, { semis: [-1, 1], gainDb: [-2, 0], tiltDb: [-2, 2], includeOriginal: true });
import { rng as makeRng, db2lin } from './buffer.mjs';
import { varispeed } from './resample.mjs';
import { eq } from './filters.mjs';
import { scale } from './edit.mjs';

/**
 * n variants of `buf`. Values are stratified across each range (not clumped) and shuffled, seeded by `seed`.
 *   semis [min, max]   pitch offset in semitones (default ±0.6 st ≈ ±3.5 %)
 *   gainDb [min, max]  level offset (default ±1.5 dB; re-normalise later if the variants get finalized to a target)
 *   tiltDb [min, max]  spectral tilt around tiltHz (+ = brighter)
 *   includeOriginal    first variant is the untouched input
 */
export function variations(buf, n, { seed = 'variations', semis = [-0.6, 0.6], gainDb = [-1.5, 1.5], tiltDb = [-1.5, 1.5], tiltHz = 1500, includeOriginal = false } = {}) {
  const r = makeRng(seed);
  const strat = ([lo, hi]) => r.shuffle(Array.from({ length: n }, (_, k) => lo + (hi - lo) * ((k + r.next()) / n)));
  const S = strat(semis), G = strat(gainDb), T = strat(tiltDb);
  const out = [];
  for (let k = 0; k < n; k++) {
    if (includeOriginal && k === 0) { const o = buf.clone(); o.meta = { semis: 0, gainDb: 0, tiltDb: 0 }; out.push(o); continue; }
    let b = Math.abs(S[k]) > 1e-3 ? varispeed(buf, Math.pow(2, S[k] / 12)) : buf.clone();
    if (Math.abs(T[k]) > 0.05) b = eq(b, { type: 'tilt', f: tiltHz, gain: T[k] });
    if (Math.abs(G[k]) > 0.01) b = scale(b, db2lin(G[k]));
    b.meta = { semis: Math.round(S[k] * 100) / 100, gainDb: Math.round(G[k] * 100) / 100, tiltDb: Math.round(T[k] * 100) / 100 };
    out.push(b);
  }
  return out;
}

/** Pick `n` distinct items from `list` (seeded); repeats only when the list is shorter than n. */
export function pickN(list, n, seed = 'pick') {
  const r = makeRng(seed);
  const out = [];
  while (out.length < n && list.length) out.push(...r.shuffle(list).slice(0, n - out.length));
  return out;
}
