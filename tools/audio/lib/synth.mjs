// Small synthesis toolkit for layers that recordings can't give us: sub thumps under gunshots, noise bursts for
// cracks / whooshes / rumble, UI tones, crackle, motor whine. All randomness is seeded (pass rng or seed).
//
//   thump({ f0: 140, f1: 45, dur: 0.35 })                  sub "kick" for a gun's low layer
//   noiseBurst({ dur: 0.08, color: 'white', hp: 2000, decay: 0.03 })
//   tone(0.2, { type: 'sine', freq: [[0, 880], [0.2, 660]] })  // breakpoint glide
//   noise(2, { color: 'brown', seed: 'rumble' })
import { Buf, SR, rng as makeRng, db2lin } from './buffer.mjs';
import { toFn, eq, sweep } from './filters.mjs';

const R = (o) => (o.rng ? o.rng : makeRng(o.seed ?? 1));

/** Noise: color white | pink | brown | blue | violet | velvet (sparse impulses, density/s). */
export function noise(sec, { color = 'white', channels = 1, sampleRate = SR, seed, rng, density = 2000, amp = 1 } = {}) {
  const r = R({ seed, rng });
  const n = Math.max(0, Math.round(sec * sampleRate));
  const data = [];
  for (let c = 0; c < channels; c++) {
    const o = new Float32Array(n);
    if (color === 'white') for (let i = 0; i < n; i++) o[i] = (r.next() * 2 - 1);
    else if (color === 'pink') { // Paul Kellet's refined filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = r.next() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        o[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    } else if (color === 'brown') { let l = 0; for (let i = 0; i < n; i++) { l = (l + 0.02 * (r.next() * 2 - 1)) / 1.02; o[i] = l * 3.5; } }
    else if (color === 'blue' || color === 'violet') { let p = 0; for (let i = 0; i < n; i++) { const w = r.next() * 2 - 1; o[i] = (w - p) * (color === 'violet' ? 0.5 : 0.7); p = w; } }
    else if (color === 'velvet') { const step = sampleRate / density; for (let k = 0; k * step < n; k++) { const i = Math.floor(k * step + r.next() * step); if (i < n) o[i] = r.sign(); } }
    else throw new Error(`noise: unknown color ${color}`);
    if (amp !== 1) for (let i = 0; i < n; i++) o[i] *= amp;
    data.push(o);
  }
  return new Buf(data, sampleRate);
}

/** Oscillator. freq: Hz | fn(t) | [[t, Hz], ...]; type sine|triangle|saw|square|pulse; band-limited by polyBLEP. */
export function tone(sec, { type = 'sine', freq = 440, amp = 1, phase = 0, pulseWidth = 0.5, sampleRate = SR } = {}) {
  const F = toFn(freq), n = Math.round(sec * sampleRate), o = new Float32Array(n);
  let ph = phase % 1;
  const blep = (t, dt) => { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; };
  for (let i = 0; i < n; i++) {
    const dt = Math.min(0.49, F(i / sampleRate) / sampleRate);
    let v;
    switch (type) {
      case 'sine': v = Math.sin(2 * Math.PI * ph); break;
      case 'saw': v = 2 * ph - 1 - blep(ph, dt); break;
      case 'square': case 'pulse': {
        const pw = type === 'square' ? 0.5 : pulseWidth;
        v = (ph < pw ? 1 : -1) + blep(ph, dt) - blep((ph + 1 - pw) % 1, dt);
        break;
      }
      case 'triangle': v = 1 - 4 * Math.abs(ph - 0.5); break; // slope discontinuities only: aliasing is negligible
      default: throw new Error(`tone: unknown type ${type}`);
    }
    o[i] = v * amp;
    ph += dt; if (ph >= 1) ph -= 1;
  }
  return new Buf([o], sampleRate);
}

/** Envelope from breakpoints [[t, level], ...] (linear) — returns Float32Array of `sec` length. */
export function envCurve(sec, points, { sampleRate = SR, curve = 'linear' } = {}) {
  const F = toFn(points), n = Math.round(sec * sampleRate), o = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = F(i / sampleRate); o[i] = curve === 'db' ? db2lin(v) : v; }
  return o;
}

/** ADSR envelope (seconds; sustain level 0..1). Total length = a + d + hold + r. */
export function adsr({ a = 0.005, d = 0.05, s = 0.6, hold = 0.1, r = 0.1, sampleRate = SR } = {}) {
  return envCurve(a + d + hold + r, [[0, 0], [a, 1], [a + d, s], [a + d + hold, s], [a + d + hold + r, 0]], { sampleRate });
}

/** Multiply a Buf by an envelope (Float32Array, shorter envelopes hold their last value). */
export function applyEnv(buf, env) {
  return new Buf(buf.data.map((d) => { const o = new Float32Array(d.length); const L = env.length; for (let i = 0; i < d.length; i++) o[i] = d[i] * (i < L ? env[i] : env[L - 1] ?? 0); return o; }), buf.sampleRate);
}

/** Exponential-decay envelope: 1 at t=0 (after `attack` ramp), -60 dB after t60. */
export function expEnv(sec, { attack = 0.001, t60 = 0.2, sampleRate = SR } = {}) {
  const n = Math.round(sec * sampleRate), o = new Float32Array(n), k = 6.907755 / Math.max(t60, 1e-4), na = Math.max(1, Math.round(attack * sampleRate));
  for (let i = 0; i < n; i++) { const t = i / sampleRate; o[i] = (i < na ? Math.sin((i / na) * Math.PI / 2) : 1) * Math.exp(-k * Math.max(0, t - attack)); }
  return o;
}

/**
 * Pitched-down sine "thump" (sub layer). Frequency glides exponentially f0 -> f1 over `sweep` s, amplitude decays
 * with t60 `decay`. `click` adds a short noise transient (0..1). Optional `drive` saturates (adds harmonics so
 * phones can hear it).
 */
export function thump({ f0 = 150, f1 = 45, sweep: sw = 0.05, decay = 0.25, dur, click = 0.15, drive = 0, seed = 'thump', sampleRate = SR } = {}) {
  dur = dur ?? decay * 1.2 + 0.02;
  const n = Math.round(dur * sampleRate), o = new Float32Array(n);
  let ph = 0;
  const k = 6.907755 / decay;
  const r = makeRng(seed);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const f = f1 + (f0 - f1) * Math.exp(-t / Math.max(sw, 1e-4));
    ph += f / sampleRate;
    const a = Math.min(1, t / 0.0015) * Math.exp(-k * t);
    let v = Math.sin(2 * Math.PI * ph) * a;
    if (click > 0 && t < 0.006) v += (r.next() * 2 - 1) * click * (1 - t / 0.006);
    if (drive > 0) v = Math.tanh(v * (1 + drive)) / Math.tanh(1 + drive);
    o[i] = v;
  }
  return new Buf([o], sampleRate);
}

/** Filtered noise burst: crack / hiss / whoosh / rumble building block. */
export function noiseBurst({ dur = 0.15, attack = 0.0005, decay = 0.05, color = 'white', hp, lp, bp, q = 1, seed = 'burst', channels = 1, sampleRate = SR } = {}) {
  let b = noise(dur, { color, seed, channels, sampleRate });
  const specs = [];
  if (hp) specs.push({ type: 'hp', f: hp, order: 2 });
  if (lp) specs.push({ type: 'lp', f: lp, order: 2 });
  if (bp) specs.push({ type: 'bp', f: bp, q });
  if (specs.length) b = eq(b, specs);
  return applyEnv(b, expEnv(dur, { attack, t60: decay, sampleRate }));
}

/** Swept band-pass noise whoosh (f0 -> f1 Hz) with a bell-shaped envelope. */
export function whoosh({ dur = 0.5, f0 = 400, f1 = 2500, q = 2.5, color = 'pink', seed = 'whoosh', sampleRate = SR } = {}) {
  const b = noise(dur, { color, seed, sampleRate });
  const s = sweep(b, 'bp', (t) => f0 * Math.pow(f1 / f0, t / dur), { q });
  const env = envCurve(dur, [[0, 0], [dur * 0.55, 1], [dur, 0]]);
  for (let i = 0; i < env.length; i++) env[i] = env[i] * env[i];
  return applyEnv(s, env);
}

/** Random crackle / pops (fire, electricity, debris ticks). density: events per second. */
export function crackle(sec, { density = 30, minAmp = 0.1, maxAmp = 1, decay = 0.004, hp = 1500, seed = 'crackle', sampleRate = SR } = {}) {
  const r = makeRng(seed), n = Math.round(sec * sampleRate), o = new Float32Array(n);
  const k = 6.907755 / (decay * sampleRate);
  for (let e = 0, cnt = Math.round(density * sec); e < cnt; e++) {
    const at = Math.floor(r.next() * n), amp = minAmp + (maxAmp - minAmp) * Math.pow(r.next(), 2), len = Math.round(decay * sampleRate * 3);
    for (let i = 0; i < len && at + i < n; i++) o[at + i] += (r.next() * 2 - 1) * amp * Math.exp(-k * i);
  }
  return eq(new Buf([o], sampleRate), [{ type: 'hp', f: hp, order: 2 }]);
}

/** Simple 2-operator FM tone (UI blips, alarms). */
export function fm(sec, { carrier = 880, ratio = 2, index = 2, indexDecay = 0.1, amp = 1, sampleRate = SR } = {}) {
  const C = toFn(carrier), n = Math.round(sec * sampleRate), o = new Float32Array(n);
  let pc = 0, pm = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate, fc = C(t), fmod = fc * ratio;
    const I = index * Math.exp(-t / Math.max(indexDecay, 1e-4));
    pm += fmod / sampleRate; pc += fc / sampleRate;
    o[i] = Math.sin(2 * Math.PI * pc + I * Math.sin(2 * Math.PI * pm)) * amp;
  }
  return new Buf([o], sampleRate);
}

/** Additive partials (metallic hits, bells): partials [[ratio, amp, t60], ...] over base frequency. */
export function partials(sec, { base = 400, list = [[1, 1, 0.5], [2.76, 0.5, 0.3], [5.4, 0.25, 0.15]], sampleRate = SR, seed = 'partials' } = {}) {
  const n = Math.round(sec * sampleRate), o = new Float32Array(n), r = makeRng(seed);
  for (const [ratio, amp, t60] of list) {
    const f = base * ratio, k = 6.907755 / t60, ph0 = r.next();
    for (let i = 0; i < n; i++) { const t = i / sampleRate; o[i] += Math.sin(2 * Math.PI * (f * t + ph0)) * amp * Math.exp(-k * t) * Math.min(1, t / 0.0008); }
  }
  return new Buf([o], sampleRate);
}

/** Silence of `sec` seconds. */
export const silence = (sec, channels = 1, sampleRate = SR) => Buf.seconds(sec, channels, sampleRate);
