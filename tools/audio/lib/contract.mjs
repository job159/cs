// The sound-name contract between the game code and the audio build.
//   REQUIRED: names the task brief says the game already plays (must all exist).
//   scanGame(): additionally scans game/src for every name the code can play (string literals passed to
//   audio.play(...), clip 'snd' events, and the dynamic families: <gun>_close/_tail/_far/_mech, impact_<surf>,
//   footstep_<surf>, <voice>_idle/_attack/_pain/_death).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.mjs';

export const GUN_SUFFIXES = { required: ['_close', '_tail', '_far'], optional: ['_mech'] };
export const VOICE_SUFFIXES = ['_idle', '_attack', '_pain', '_death'];
export const MUSIC = ['calm', 'combat_low', 'combat_high', 'boss', 'menu_theme'];

export const REQUIRED = [
  'ui_click', 'ui_back', 'ui_buy', 'ui_deny', 'special_ready', 'special_activate', 'special_end', 'perfect_reload',
  'saw_launch', 'saw_catch', 'level_up', 'round_start', 'round_win', 'victory', 'defeat', 'boss_warning', 'supply_drop',
  'revive', 'dryfire', 'swing', 'grenade_pin', 'grenade_bounce', 'explosion_small', 'explosion_large', 'explosion_far',
  'fire_burst', 'debris_fall', 'body_fall', 'impact_flesh', 'headshot', 'knife_hit_wall', 'knife_hit_flesh', 'armor_hit',
  'acid_splash', 'brute_roar', 'brute_stomp', 'brute_charge', 'spitter_spit', 'spitter_gurgle', 'screamer_scream',
  'crawler_screech', 'bloater_pop', 'player_pain', 'player_downed', 'rocket_fly', 'minigun_spin', 'minigun_spindown',
  ...MUSIC,
];

const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return ''; } };
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.js$/.test(e.name)) out.push(p);
  }
  return out;
}
const literals = (s) => [...s.matchAll(/'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
// literals in a play() argument, minus comparison operands (name === 'menu' ? 'ui_back' : 'ui_open')
const argLiterals = (s) => [...s.matchAll(/([=!]==?\s*)?'([A-Za-z0-9_]+)'(\s*[=!]==?)?/g)].filter((m) => !m[1] && !m[3]).map((m) => m[2]);

/** Text of the first call argument starting at index i (stops at a depth-0 ',' or ')'; skips string contents). */
function firstArg(s, i) {
  let depth = 0, q = null;
  const start = i;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
    else if (c === ',' && depth === 0) break;
  }
  return s.slice(start, i);
}

/** Scan the game sources. Returns { required: Set, optional: Set, sources: Map(name -> 'file:line') }. */
export function scanGame() {
  const required = new Set(REQUIRED), optional = new Set(), where = new Map();
  const note = (n, w) => { if (!where.has(n)) where.set(n, w); };
  // weapon families
  const defs = read('game/src/weapons/defs.js');
  const guns = new Set([...defs.matchAll(/sound:\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]));
  for (const g of guns) {
    for (const s of GUN_SUFFIXES.required) { required.add(g + s); note(g + s, 'weapons/defs.js (def.sound)'); }
    for (const s of GUN_SUFFIXES.optional) { optional.add(g + s); note(g + s, 'weapons/defs.js (def.sound, optional)'); }
  }
  // impacts
  const bal = read('game/src/weapons/ballistics.js');
  const sm = bal.match(/SURF_SOUND\s*=\s*\{([^}]*)\}/);
  for (const v of new Set(sm ? literals(sm[1]) : ['concrete'])) { required.add('impact_' + v); note('impact_' + v, 'weapons/ballistics.js SURF_SOUND'); }
  // footsteps
  const game = read('game/src/game.js');
  const st = game.match(/STEP_SURF\s*=\s*\{([^}]*)\}/);
  for (const v of new Set(st ? literals(st[1]) : [])) { required.add('footstep_' + v); note('footstep_' + v, 'game.js STEP_SURF'); }
  // zombie voices
  const zd = read('game/src/zombies/defs.js');
  for (const v of new Set([...zd.matchAll(/voice:\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]).concat(['zombie']))) {
    for (const s of VOICE_SUFFIXES) { required.add(v + s); note(v + s, 'zombies/defs.js voice'); }
  }
  // literal play() calls + clip 'snd' events everywhere
  const srcDir = path.join(ROOT, 'game/src');
  if (fs.existsSync(srcDir)) for (const f of walk(srcDir)) {
    const s = fs.readFileSync(f, 'utf8');
    const relf = path.relative(srcDir, f).split(path.sep).join('/');
    for (const m of s.matchAll(/\b(?:audio|au)\??\.(?:play|playMusic|has)\(/g)) {
      const arg = firstArg(s, m.index + m[0].length);
      if (/\+/.test(arg)) continue; // dynamic families handled above
      const line = s.slice(0, m.index).split('\n').length;
      for (const n of argLiterals(arg)) { required.add(n); note(n, `${relf}:${line}`); }
    }
    for (const m of s.matchAll(/\[\s*[\d.]+\s*,\s*'snd',\s*([^\]]+)\]/g)) { // clip events: [t, 'snd', name]
      const line = s.slice(0, m.index).split('\n').length;
      for (const n of literals(m[1])) { required.add(n); note(n, `${relf}:${line} (clip event)`); }
    }
  }
  for (const n of optional) required.delete(n);
  return { required, optional, where };
}

/** Compare the defined sound names against the contract. */
export function coverage(defined) {
  const have = defined instanceof Set ? defined : new Set(defined);
  const { required, optional, where } = scanGame();
  const missing = [...required].filter((n) => !have.has(n)).sort();
  const extra = [...have].filter((n) => !required.has(n) && !optional.has(n)).sort();
  return { required: [...required].sort(), missing, extra, optionalPresent: [...optional].filter((n) => have.has(n)).sort(), where };
}
