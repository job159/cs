// Zombie-style post-processing layered on top of any clip: slumped spine, lolling/tilted head,
// dropped shoulder and asymmetric arm hang, clawed fingers and loop-safe twitches.
import { applyOffsets, fingerCurl, loopNoise, noise } from './pose.mjs';

export const ZDEFAULT = {
  slump: 6, // forward spine bend (deg, spread over spine_01..03)
  neck: 6, // neck forward
  headTilt: 12, // head roll to the character's right (deg)
  headNod: 4, // head pitch (deg, + = chin down)
  headYaw: 0,
  dropL: 7, // left shoulder drop (deg)
  dropR: 0,
  hangL: 6, // extra left arm hang (upperarm pitch back, elbow straighter)
  hangR: 0,
  claw: 28, // finger curl (deg per joint)
  clawR: null, // override for the right hand
  twitch: 1, // head/neck twitch amplitude scale (0 = off)
  sway: 1, // torso sway scale
  seed: 1,
};

export function zombify(skel, clip, opts = {}) {
  const o = { ...ZDEFAULT, ...opts };
  const n = clip.poses.length;
  const P = (n - 1) / clip.fps;
  const loop = clip.loop;
  for (let f = 0; f < n; f++) {
    const t = f / clip.fps;
    // twitch: occasional sharp head jerks (loop-safe when looping)
    const nz = (k, cyc) => (loop ? loopNoise(t, P, Math.max(1, Math.round(cyc * P)), o.seed + k) : noise(t * cyc, o.seed + k));
    const jerk = Math.pow(Math.max(0, nz(1, 1.3)), 3) * 14 * o.twitch;
    const off = {
      spine_01: [o.slump * 0.3, 0, nz(2, 0.6) * 1.5 * o.sway],
      spine_02: [o.slump * 0.4, nz(3, 0.5) * 2 * o.sway, 0],
      spine_03: [o.slump * 0.3, 0, nz(4, 0.4) * 1.5 * o.sway],
      neck_01: [o.neck + nz(5, 0.7) * 2 * o.twitch, 0, o.headTilt * 0.35],
      head: [o.headNod + jerk * 0.4, o.headYaw + nz(6, 0.9) * 4 * o.twitch, o.headTilt * 0.65 + jerk],
    };
    if (o.dropL) off.clavicle_l = [0, 0, -o.dropL];
    if (o.dropR) off.clavicle_r = [0, 0, -o.dropR];
    if (o.hangL) { off.upperarm_l = [o.hangL * 0.6, 0, -o.hangL * 0.4]; off.lowerarm_l = [o.hangL * 0.5, 0, 0]; }
    if (o.hangR) { off.upperarm_r = [o.hangR * 0.6, 0, -o.hangR * 0.4]; off.lowerarm_r = [o.hangR * 0.5, 0, 0]; }
    if (o.extra) Object.assign(off, typeof o.extra === 'function' ? o.extra(t, f) : o.extra);
    applyOffsets(skel, clip.poses[f], off);
    if (o.claw) {
      fingerCurl(skel, clip.poses[f], 'l', o.claw, { thumb: o.claw * 0.4, spread: 8 });
      fingerCurl(skel, clip.poses[f], 'r', o.clawR ?? o.claw * 0.85, { thumb: o.claw * 0.4, spread: 10 });
    }
  }
  return clip;
}
