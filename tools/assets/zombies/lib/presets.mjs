// Body proportion presets: macro values + MPFB2 modifiers (+ optional additive pose offsets the game applies
// after animation, stored as root extras.poseOffsets {bone: [x, y, z] degrees, local euler XYZ}).
// Combine with merge(): later presets add modifiers and override macro keys.
export const PRESETS = {
  average: { macro: { muscle: 0.5, weight: 0.5 } },
  gaunt: {
    macro: { muscle: 0.3, weight: 0.12 },
    modifiers: {
      'stomach-pregnant-decr-incr': -0.4, 'torso-scale-depth-decr-incr': -0.25, 'measure-waist-circ-decr-incr': -0.4,
      'head-fat-decr-incr': -0.6, 'cheek-volume-decr-incr': -0.8, 'cheek-bones-decr-incr': 0.6, 'neck-scale-horiz-decr-incr': -0.3,
      'l-upperarm-fat-decr-incr': -0.6, 'r-upperarm-fat-decr-incr': -0.6, 'l-lowerarm-fat-decr-incr': -0.5, 'r-lowerarm-fat-decr-incr': -0.5,
      'l-upperleg-fat-decr-incr': -0.5, 'r-upperleg-fat-decr-incr': -0.5,
    },
  },
  bloated: {
    macro: { muscle: 0.25, weight: 0.95 },
    modifiers: { 'stomach-pregnant-decr-incr': 0.7, 'neck-double-decr-incr': 0.6, 'head-fat-decr-incr': 0.6, 'torso-scale-depth-decr-incr': 0.3 },
  },
  muscular: {
    macro: { muscle: 0.95, weight: 0.6 },
    modifiers: { 'torso-vshape-decr-incr': 0.5, 'torso-muscle-pectoral-decr-incr': 0.5, 'neck-scale-horiz-decr-incr': 0.3 },
  },
  hunched: {
    poseOffsets: { spine_01: [10, 0, 0], spine_02: [12, 0, 0], spine_03: [10, 0, 0], neck_01: [-14, 0, 0], head: [-10, 0, 0], clavicle_l: [0, 0, -6], clavicle_r: [0, 0, 6] },
  },
};

/** Deep-merges presets / overrides into one Human.create() options object (+ poseOffsets). */
export function merge(...list) {
  const out = { macro: {}, modifiers: {}, expression: {}, poseOffsets: {} };
  for (let p of list) {
    if (typeof p === 'string') p = PRESETS[p];
    if (!p) continue;
    Object.assign(out.macro, p.macro || {});
    for (const [k, v] of Object.entries(p.modifiers || {})) out.modifiers[k] = (out.modifiers[k] || 0) + v;
    Object.assign(out.expression, p.expression || {});
    for (const [k, v] of Object.entries(p.poseOffsets || {})) out.poseOffsets[k] = v;
  }
  for (const [k, v] of Object.entries(out.modifiers)) out.modifiers[k] = Math.max(-1, Math.min(1, v));
  return out;
}
