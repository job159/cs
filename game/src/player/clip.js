// Tiny keyframe clip system for first-person actions (reloads, draws, inspects, melee swings).
// A clip is { duration, tracks, events }:
//   tracks[name] = [[t, value, ease?], ...]   t in 0..1 (normalised), value number or array
//   events = [[t, name, arg?], ...]           fired once when playback crosses t
// Tracks are sampled with per-key easing (the ease of the key being approached).
import { ease } from '../engine/util.js';

const EASES = {
  linear: (t) => t, in: ease.inQuad, out: ease.outQuad, inOut: ease.inOutCubic, outBack: (t) => ease.outBack(t, 1.4),
  outExpo: ease.outExpo, in3: ease.inCubic, out3: ease.outCubic, snap: (t) => (t < 1 ? 0 : 1),
};

export function sampleTrack(keys, t, out) {
  if (!keys || !keys.length) return undefined;
  if (t <= keys[0][0]) return copy(keys[0][1], out);
  for (let i = 1; i < keys.length; i++) {
    const k1 = keys[i];
    if (t <= k1[0]) {
      const k0 = keys[i - 1];
      const span = k1[0] - k0[0];
      let u = span > 0 ? (t - k0[0]) / span : 1;
      u = (EASES[k1[2] || 'inOut'] || EASES.inOut)(u);
      return lerpVal(k0[1], k1[1], u, out);
    }
  }
  return copy(keys[keys.length - 1][1], out);
}

function copy(v, out) {
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (out) { for (let i = 0; i < v.length; i++) out[i] = v[i]; return out; }
  return v.slice();
}
function lerpVal(a, b, u, out) {
  if (typeof a === 'string') return u < 1 ? a : b;
  if (typeof a === 'number') return a + (b - a) * u;
  const o = out || new Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = a[i] + (b[i] - a[i]) * u;
  return o;
}

/** Discrete track (anchors, hand poses): returns the last key whose time <= t, plus how long ago it started. */
export function sampleStep(keys, t) {
  if (!keys || !keys.length) return null;
  let k = null;
  for (const key of keys) { if (key[0] <= t) k = key; else break; }
  return k;
}

export class ClipPlayer {
  constructor() { this.clip = null; this.t = 0; this.time = 0; this.speed = 1; this.onEvent = null; this.done = true; }
  play(clip, { duration, onEvent, speed = 1 } = {}) {
    this.clip = clip;
    this.duration = duration ?? clip.duration;
    this.time = 0; this.t = 0; this.speed = speed;
    this.onEvent = onEvent;
    this.done = false;
    this._fired = 0;
    this._fire(0);
  }
  stop() { this.clip = null; this.done = true; }
  update(dt) {
    if (!this.clip || this.done) return;
    const prev = this.t;
    this.time += dt * this.speed;
    this.t = Math.min(1, this.time / this.duration);
    this._fire(this.t, prev);
    if (this.t >= 1) { this.done = true; }
  }
  _fire(t) {
    const ev = this.clip.events;
    if (!ev) return;
    while (this._fired < ev.length && ev[this._fired][0] <= t) {
      const e = ev[this._fired++];
      this.onEvent?.(e[1], e[2]);
    }
  }
  sample(name, out) { return this.clip && !this.done ? sampleTrack(this.clip.tracks[name], this.t, out) : undefined; }
  step(name) { return this.clip && !this.done ? sampleStep(this.clip.tracks[name], this.t) : null; }
  get active() { return !!this.clip && !this.done; }
}
