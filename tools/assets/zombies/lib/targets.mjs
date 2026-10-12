// MakeHuman .target morphs (sparse per-vertex deltas on the hm08 base mesh, decimetres) and the
// "macro" body model (gender / age / muscle / weight / height / proportions / race). The macro blend
// rules follow the open data in MPFB2's targets/macrodetails/macro.json: each macro variable is split into
// piecewise-linear weights over its named stops, and every macro target file is named after one stop per
// variable, so its weight is the product of those stop weights.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { mpfb2, mpfb2Has } from './fetch.mjs';

const cache = new Map();

/** Loads a target by MPFB2 path (relative to data/targets, without extension). Returns {idx:Int32Array, d:Float32Array}. */
export async function loadTarget(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const file = await mpfb2(`targets/${rel}.target.gz`);
  const text = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
  const idx = [], d = [];
  for (const line of text.split('\n')) {
    if (!line || line[0] === '#') continue;
    const p = line.trim().split(/\s+/);
    if (p.length < 4) continue;
    idx.push(+p[0]); d.push(+p[1], +p[2], +p[3]);
  }
  const t = { idx: Int32Array.from(idx), d: Float32Array.from(d) };
  cache.set(rel, t);
  return t;
}

/** Adds weight * target to positions (in place). */
export function applyTarget(positions, t, weight) {
  if (!weight) return;
  for (let i = 0; i < t.idx.length; i++) {
    const v = t.idx[i] * 3;
    positions[v] += t.d[i * 3] * weight;
    positions[v + 1] += t.d[i * 3 + 1] * weight;
    positions[v + 2] += t.d[i * 3 + 2] * weight;
  }
}

// piecewise-linear weights over named stops
function stops(value, names, at) {
  const out = {};
  const v = Math.min(at[at.length - 1], Math.max(at[0], value));
  for (let i = 0; i < at.length - 1; i++) {
    if (v >= at[i] && v <= at[i + 1]) {
      const f = (v - at[i]) / (at[i + 1] - at[i]);
      if (names[i]) out[names[i]] = (out[names[i]] || 0) + (1 - f);
      if (names[i + 1]) out[names[i + 1]] = (out[names[i + 1]] || 0) + f;
      break;
    }
  }
  for (const k of Object.keys(out)) if (out[k] < 1e-6) delete out[k];
  return out;
}

/**
 * Macro parameters (all 0..1, MakeHuman semantics): gender 0 female .. 1 male; age 0 = 1 yr, 0.1875 = 11,
 * 0.5 = 25, 1 = 90; muscle / weight 0.5 = average; height / proportions 0.5 = neutral (proportions 1 =
 * idealised, 0 = uncommon); race = {african, asian, caucasian} (normalised).
 * Returns [[targetPath, weight], ...].
 */
export function macroTargets(m = {}) {
  const gender = stops(m.gender ?? 0.5, ['female', 'male'], [0, 1]);
  const age = stops(m.age ?? 0.5, ['baby', 'child', 'young', 'old'], [0, 0.1875, 0.5, 1]);
  const muscle = stops(m.muscle ?? 0.5, ['minmuscle', 'averagemuscle', 'maxmuscle'], [0, 0.5, 1]);
  const weight = stops(m.weight ?? 0.5, ['minweight', 'averageweight', 'maxweight'], [0, 0.5, 1]);
  const height = stops(m.height ?? 0.5, ['minheight', '', 'maxheight'], [0, 0.5, 1]);
  const prop = stops(m.proportions ?? 0.5, ['uncommonproportions', '', 'idealproportions'], [0, 0.5, 1]);
  const raceIn = m.race || { african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3 };
  const rs = Object.values(raceIn).reduce((a, b) => a + b, 0) || 1;
  const race = Object.fromEntries(Object.entries(raceIn).map(([k, v]) => [k, v / rs]));
  const out = [];
  const each = (o, fn) => { for (const [k, w] of Object.entries(o)) if (w > 0) fn(k, w); };
  each(race, (r, wr) => each(gender, (g, wg) => each(age, (a, wa) => out.push([`macrodetails/${r}-${g}-${a}`, wr * wg * wa]))));
  each(gender, (g, wg) => each(age, (a, wa) => each(muscle, (mu, wm) => each(weight, (we, ww) => {
    const base = `${g}-${a}-${mu}-${we}`;
    const w = wg * wa * wm * ww;
    out.push([`macrodetails/universal-${base}`, w]);
    each(height, (h, wh) => out.push([`macrodetails/height/${base}-${h}`, w * wh]));
    each(prop, (p, wp) => out.push([`macrodetails/proportions/${base}-${p}`, w * wp]));
  }))));
  return out.filter(([, w]) => w > 1e-5);
}

/**
 * Resolves a "modifier" in the MPFB2 target.json style: e.g. ('torso', 'torso-scale-horiz-decr|incr', 0.4)
 * or the short form 'torso/torso-scale-horiz-incr' with weight. Negative values pick the 'decr'/'down'/'in'
 * side automatically for '<name>-decr-incr' style category names.
 */
let index = null;
export async function resolveModifier(name, value) {
  if (!index) index = JSON.parse(fs.readFileSync(await mpfb2('targets/target.json'), 'utf8'));
  // direct target path
  if (name.includes('/')) return [[name, value]];
  for (const [group, g] of Object.entries(index)) {
    for (const c of g.categories) {
      const side = name.startsWith('l-') ? 'left' : name.startsWith('r-') ? 'right' : 'unsided';
      const bare = side === 'unsided' ? name : name.slice(2);
      if (c.name !== bare) continue;
      const key = (value < 0 ? 'negative-' : 'positive-') + side;
      const t = c.opposites?.[key];
      if (!t) throw new Error(`modifier ${name}: no ${key} target`);
      return [[`${group}/${t}`, Math.abs(value)]];
    }
  }
  throw new Error('unknown modifier ' + name);
}

/** Path of an expression unit target (race-specific in MPFB2; caucasian by default). */
export function expressionTarget(unit, race = 'caucasian') {
  const rel = `expression/units/${race}/${unit}`;
  if (!mpfb2Has(`targets/${rel}.target.gz`)) throw new Error('unknown expression unit ' + unit);
  return rel;
}
