// High-level helpers: turn source takes into clean, in-place, looping target clips.
import { cmu, ual1, ual2, MAP_CMU, MAP_UE } from './sources.mjs';
import { retarget } from './retarget.mjs';
import { makeClip, removeRootMotion, findLoop, makeLoop, fixSigns, crop, smoothClip, duration } from './clip.mjs';
import { lockFeet, groundFeet, estimateSpeed, clampFeetAboveGround } from './ik.mjs';

/** Retargeted CMU take (seconds range), heading normalised to the travel direction. */
export function fromCMU(skel, trial, { from = 0, to = null, heading = 'travel', name = trial } = {}) {
  const src = cmu(trial, { from, to });
  return makeClip(name, retarget(src, MAP_CMU, skel, { heading }), { meta: { source: `CMU ${trial} [${from}-${to ?? 'end'}s]` } });
}

/** Retargeted Quaternius clip (lib 1 or 2). */
export function fromUAL(skel, lib, anim, { name = anim, heading = 0 } = {}) {
  const src = (lib === 1 ? ual1 : ual2)(anim);
  const c = makeClip(name, retarget(src, MAP_UE, skel, { finger3: true, heading }));
  c.meta.source = `Quaternius UAL${lib} ${anim}`;
  return c;
}

/**
 * Builds a seamless in-place locomotion loop from a long mocap take:
 * retarget -> remove root trend -> search the best loop window -> cross-fade seam -> lock feet.
 */
export function mocapLoop(skel, trial, { from, to, minLen = 1.0, maxLen = 2.6, blend = 8, smoothing = 1, lock = {}, name = trial, pick = null } = {}) {
  const c = fromCMU(skel, trial, { from, to, name });
  removeRootMotion(c);
  const speed = c.meta.speed;
  if (smoothing) smoothClip(c, smoothing);
  const fps = c.fps;
  const margin = blend + 4;
  const best = pick ? { s: Math.round(pick[0] * fps), e: Math.round(pick[1] * fps) } : findLoop(skel, c, { minLen: Math.round(minLen * fps), maxLen: Math.round(maxLen * fps), lo: margin, hi: c.poses.length - 1 });
  const L = makeLoop(c, best.s, best.e, blend);
  L.name = name;
  L.meta = { ...c.meta, speed, loopFrom: +(from + best.s / fps).toFixed(2), loopTo: +(from + best.e / fps).toFixed(2) };
  fixSigns(L);
  groundFeet(skel, L);
  lockFeet(skel, L, { speed, ...lock });
  clampFeetAboveGround(skel, L);
  return L;
}

/** In-place loop from a Quaternius loop clip (already cyclic). Speed is measured from the feet. */
export function ualLoop(skel, lib, anim, { name = anim, lock = true, timeScale = 1 } = {}) {
  const c = fromUAL(skel, lib, anim, { name });
  c.loop = true;
  removeRootMotion(c, { center: true });
  const rootSpeed = c.meta.speed;
  c.meta.speed = estimateSpeed(skel, c) + rootSpeed;
  if (timeScale !== 1) { c.fps = c.fps; c.meta.speed *= timeScale; }
  fixSigns(c);
  groundFeet(skel, c);
  if (lock) lockFeet(skel, c, { speed: c.meta.speed });
  clampFeetAboveGround(skel, c);
  return c;
}

export { duration, crop };
