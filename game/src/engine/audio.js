// WebAudio engine: manifest-driven sample playback with variants, pitch jitter, per-sound voice caps,
// 3D positioning (equal-power panner + distance low-pass for air absorption), buses with ducking, and
// a cross-fading music layer. The manifest format is documented in docs/AUDIO.md (index.json lists
// manifest.<category>.json files: { sounds: { name: { files, vol, pitch, voices, bus, spatial, range, loop } } }).
// A manifest may also carry `aliases: { name: { to, ...overrides } }`: a name the game plays mapped onto an existing
// sound (vol multiplies the target's, other fields replace it); a real entry of that name always wins.
const BASE = 'assets/audio/';
const ALIAS_KEYS = ['to', 'note', 'vol'];
const MUSIC_KEEP = 4;   // decoded music loops kept cached (see _musicBudget)

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.defs = Object.create(null);
    this.buffers = new Map();     // file -> AudioBuffer | Promise
    this.voices = [];             // active voices
    this.tracked = [];            // positional loops: distance fade + air absorption follow the listener
    this.maxVoices = 40;
    this.listener = { x: 0, y: 0, z: 0 };
    this.volumes = { master: 0.9, sfx: 1, music: 0.55, ui: 0.8, amb: 0.7, voice: 1 };
    this.ready = false;
    this.warned = new Set();
    this.duck = 0;
    this.music = null;
    // the track that should be playing: a request made before the context exists (boot, or a match started straight
    // from dev params) starts as soon as it does; the menus are the first screen, so the menu theme is the default
    this.wantMusic = 'menu_theme';
  }

  /** Must be called from a user gesture on mobile. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) this._create();
    if (this.ctx.state === 'suspended' && !this.background) this.ctx.resume();
    this._kickMusic();
  }

  /**
   * App sent to the background (Android Home / app switch, hidden tab): suspends the context so music, ambience and
   * voices stop behind the home screen (an Android WebView keeps WebAudio running after onPause), resumes on return.
   */
  setBackground(on) {
    this.background = !!on;
    const ctx = this.ctx;
    if (!ctx) return;
    if (on) { if (ctx.state === 'running') ctx.suspend().catch(() => {}); }
    else if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  _create() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    // master chain: bus gains -> glue compressor -> limiter -> out
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 8; this.comp.ratio.value = 3; this.comp.attack.value = 0.004; this.comp.release.value = 0.18;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2; this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.001; this.limiter.release.value = 0.08;
    this.master.connect(this.comp); this.comp.connect(this.limiter); this.limiter.connect(ctx.destination);
    // world sounds (sfx, voices, ambience) pass a low-pass the flash / concussion effect closes (setMuffle);
    // fully open it is the identity (cutoff at Nyquist), so it costs nothing in normal play
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = ctx.sampleRate / 2;
    this.muffle.Q.value = -3;   // dB: Butterworth, no resonance bump when it closes
    this.muffle.connect(this.master);
    this.muffleAmt = 0;
    this.buses = {};
    for (const b of ['sfx', 'music', 'ui', 'amb', 'voice']) {
      const g = ctx.createGain();
      g.connect(b === 'music' || b === 'ui' ? this.master : this.muffle);
      this.buses[b] = g;
    }
    this._applyVolumes();
    if (this.background) ctx.suspend().catch(() => {});
    this._kickMusic();
  }

  setVolume(bus, v) { this.volumes[bus] = v; this._applyVolumes(); }
  _applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    for (const [b, g] of Object.entries(this.buses)) g.gain.value = this.volumes[b] ?? 1;
  }

  async init() {
    try {
      const idx = await (await fetch(BASE + 'index.json')).json();
      const files = Array.isArray(idx) ? idx : idx.manifests || [];
      const mans = await Promise.all(files.map((f) => fetch(BASE + f).then((r) => r.json()).catch(() => null)));
      for (const m of mans) if (m && m.sounds) Object.assign(this.defs, m.sounds);
      for (const m of mans) for (const [name, a] of Object.entries(m?.aliases || {})) this._alias(name, a);
    } catch (e) {
      console.warn('audio manifest missing', e.message);
    }
    this.ready = true;
    this._kickMusic();
  }

  /** Manifest alias: `name` plays `a.to` (vol multiplies, every other field overrides). Real entries win. */
  _alias(name, a) {
    const base = this.defs[a?.to];
    if (this.defs[name] || !base) { if (!base) console.warn('audio alias target missing', name, '->', a?.to); return; }
    const d = { ...base, alias: a.to, vol: (base.vol ?? 1) * (a.vol ?? 1) };
    for (const [k, v] of Object.entries(a)) if (!ALIAS_KEYS.includes(k)) d[k] = v;
    this.defs[name] = d;
  }

  has(name) { return !!this.defs[name]; }

  /** Missing names fall back to a generic relative (runner_pain -> zombie_pain, impact_tile -> impact_concrete, x_far -> x_close). */
  _resolve(name) {
    let m;
    const alts = [];
    if ((m = /^[a-z]+_(idle|alert|attack|pain|death)$/.exec(name))) alts.push('zombie_' + m[1]);
    if (name.endsWith('_far')) alts.push(name.slice(0, -4) + '_close');
    if (name.startsWith('impact_')) alts.push('impact_concrete');
    if (name.startsWith('footstep_')) alts.push('footstep_concrete');
    if (name === 'headshot_kill') alts.push('killmarker');
    if (name === 'hitmarker_head') alts.push('hitmarker');
    for (const a of alts) if (this.defs[a]) return (this.defs[name] = this.defs[a]);
    return null;
  }

  _load(file) {
    let b = this.buffers.get(file);
    if (b) return b;
    b = fetch(BASE + file).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((ab) => { if (!this.ctx) this._create(); return this.ctx.decodeAudioData(ab); })
      .then((buf) => { if (this.buffers.get(file) === b) this.buffers.set(file, buf); return buf; })
      .catch((e) => { this.buffers.set(file, null); console.warn('audio load failed', file, e.message); return null; });
    this.buffers.set(file, b);
    return b;
  }

  /** Decodes every variant of the given sounds (call during loading screens). */
  preload(names) {
    const jobs = [];
    for (const n of names) { const d = this.defs[n]; if (d) for (const f of d.files) jobs.push(this._load(f)); }
    return Promise.all(jobs);
  }

  preloadPrefix(prefixes) {
    return this.preload(Object.keys(this.defs).filter((n) => prefixes.some((p) => n.startsWith(p))));
  }

  setListener(pos, forward, up) {
    this.listener.x = pos.x; this.listener.y = pos.y; this.listener.z = pos.z;
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.01); L.positionY.setTargetAtTime(pos.y, t, 0.01); L.positionZ.setTargetAtTime(pos.z, t, 0.01);
      L.forwardX.setTargetAtTime(forward.x, t, 0.01); L.forwardY.setTargetAtTime(forward.y, t, 0.01); L.forwardZ.setTargetAtTime(forward.z, t, 0.01);
      L.upX.setTargetAtTime(up.x, t, 0.01); L.upY.setTargetAtTime(up.y, t, 0.01); L.upZ.setTargetAtTime(up.z, t, 0.01);
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
    if (this.tracked.length) this._track(t);
  }

  /** Positional loops (fires, rocket flight...): air absorption and an out-of-range fade follow the listener. */
  _track(t) {
    for (let i = this.tracked.length - 1; i >= 0; i--) {
      const h = this.tracked[i];
      if (h.stopped) { this.tracked.splice(i, 1); continue; }
      if (!h.lp) continue;
      const p = h.at, dx = p.x - this.listener.x, dy = p.y - this.listener.y, dz = p.z - this.listener.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      h.lp.frequency.setTargetAtTime(Math.max(1200, 20000 - d * 260), t, 0.1);
      h.dist.gain.setTargetAtTime(Math.min(1, Math.max(0, (h.maxD - d) / (h.maxD * 0.25))), t, 0.15);
    }
  }

  /**
   * Plays a sound. opts: pos {x,y,z} (3D), volume, pitch (multiplier), delay (s) or at (context time), loop, bus override,
   * range [ref, max] override, offset (s into the file, or fn(startTime) -> s), fadeIn (s), onStart(buffer, handle).
   * Returns a handle { stop(fade), setPos(p), setVolume(v), setRate(r), position() } or null.
   */
  play(name, opts = {}) {
    const def = this.defs[name] || (this.ready ? this._resolve(name) : null);
    if (!def) {
      if (!this.warned.has(name)) { this.warned.add(name); if (this.ready) console.debug('sound missing:', name); }
      return null;
    }
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const file = def.files[(Math.random() * def.files.length) | 0];
    const buf = this.buffers.get(file);
    const spatial = !!opts.pos && def.spatial !== false;
    const loop = !!(opts.loop ?? def.loop);
    const range = opts.range || def.range;
    // distance cull before doing anything expensive (a positional loop is kept: the listener may walk up to it)
    let dist = 0;
    if (spatial) {
      const dx = opts.pos.x - this.listener.x, dy = opts.pos.y - this.listener.y, dz = opts.pos.z - this.listener.z;
      dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const maxD = range?.[1] ?? 60;
      if (dist > maxD && !loop) return null;
    }
    // voice caps (per sound and global). A positional play (a teammate's gun, the world) never cuts the local
    // player's own non-positional one: it steals the oldest positional instance, or is dropped if all are local.
    const same = this.voices.filter((v) => v.name === name);
    if (same.length >= (def.voices ?? 4)) {
      const pool = same.some((v) => v.spatial) ? same.filter((v) => v.spatial) : spatial ? [] : same;
      const victim = pool.reduce((o, v) => (!o || v.start < o.start ? v : o), null);
      if (!victim) return null;
      victim.stop(0.03);
    }
    if (this.voices.length >= this.maxVoices) this.voices.sort((a, b) => a.rank - b.rank || a.start - b.start)[0].stop(0.02);

    const prio = def.priority ?? 1;
    // steal order: priority, then far positional sounds before near ones before the local player's own
    const handle = { name, prio, rank: prio + (spatial ? -Math.min(dist, 150) * 0.002 : 0.5), spatial, start: ctx.currentTime, src: null, stopped: false, def };
    const startWith = (buffer) => {
      if (!buffer || handle.stopped) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const pr = def.pitch || [1, 1];
      src.playbackRate.value = (pr[0] + Math.random() * (pr[1] - pr[0])) * (opts.pitch ?? 1);
      src.loop = loop;
      if (loop && def.loopEnd > 0 && def.loopEnd <= buffer.duration + 1e-3) { src.loopStart = def.loopStart || 0; src.loopEnd = Math.min(def.loopEnd, buffer.duration); }
      const gain = ctx.createGain();
      const level = (def.vol ?? 1) * (opts.volume ?? 1);
      const t0 = opts.at ? Math.max(ctx.currentTime, opts.at) : ctx.currentTime + (opts.delay || 0);
      if (opts.fadeIn > 0) { gain.gain.value = 0; gain.gain.setValueAtTime(0, t0); gain.gain.linearRampToValueAtTime(level, t0 + opts.fadeIn); } else gain.gain.value = level;
      let node = src;
      if (spatial) {
        const pan = ctx.createPanner();
        pan.panningModel = 'equalpower';
        pan.distanceModel = 'inverse';
        pan.refDistance = range?.[0] ?? 2;
        pan.maxDistance = range?.[1] ?? 60;
        pan.rolloffFactor = def.rolloff ?? 1;
        const p = handle.at || opts.pos;
        pan.positionX ? (pan.positionX.value = p.x, pan.positionY.value = p.y, pan.positionZ.value = p.z) : pan.setPosition(p.x, p.y, p.z);
        // air absorption: distant sounds lose highs
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = Math.max(1200, 20000 - dist * 260);
        node.connect(lp); lp.connect(pan); node = pan;
        handle.pan = pan; handle.lp = lp;
        if (loop) {
          const dg = ctx.createGain();
          handle.maxD = range?.[1] ?? 60;
          dg.gain.value = Math.min(1, Math.max(0, (handle.maxD - dist) / (handle.maxD * 0.25)));
          node.connect(dg); node = dg;
          handle.dist = dg;
        }
      }
      node.connect(gain);
      gain.connect(this.buses[opts.bus || def.bus || 'sfx'] || this.buses.sfx);
      const o0 = typeof opts.offset === 'function' ? opts.offset(t0) : opts.offset;
      const off = o0 > 0 ? o0 % buffer.duration : 0;
      src.start(t0, off);
      handle.t0 = t0; handle.off0 = off;
      src.onended = () => { handle.stopped = true; const i = this.voices.indexOf(handle); if (i >= 0) this.voices.splice(i, 1); };
      handle.src = src; handle.gain = gain;
      opts.onStart?.(buffer, handle);
    };
    handle.stop = (fade = 0.05) => {
      if (handle.stopped) return;
      handle.stopped = true;
      const i = this.voices.indexOf(handle); if (i >= 0) this.voices.splice(i, 1);
      if (handle.src) {
        const t = ctx.currentTime;
        const g = handle.gain.gain;
        // a fade-in still ramping must not ramp back up after the fade-out starts
        if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { const v = g.value; g.cancelScheduledValues(t); g.setValueAtTime(v, t); }
        g.setTargetAtTime(0, t, fade / 3);
        // (not started yet: a stop at its start time means it never plays)
        try { handle.src.stop(handle.t0 > t ? handle.t0 : t + fade + 0.02); } catch { /* already stopped */ }
      }
    };
    handle.setPos = (p) => {
      if (handle.at) { handle.at.x = p.x; handle.at.y = p.y; handle.at.z = p.z; }
      if (handle.pan) { const t = ctx.currentTime; handle.pan.positionX.setTargetAtTime(p.x, t, 0.02); handle.pan.positionY.setTargetAtTime(p.y, t, 0.02); handle.pan.positionZ.setTargetAtTime(p.z, t, 0.02); }
    };
    handle.setVolume = (v) => { if (handle.gain) handle.gain.gain.setTargetAtTime((def.vol ?? 1) * v, ctx.currentTime, 0.03); };
    handle.setRate = (r) => { if (handle.src) handle.src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.03); };
    /** Playback position in the file (s), wrapped into the loop: what a phase-locked successor starts at. */
    handle.position = (at = ctx.currentTime) => {
      const s = handle.src;
      if (!s) return 0;
      const ls = s.loopStart || 0, le = s.loopEnd || s.buffer.duration;
      const p = handle.off0 + Math.max(0, at - handle.t0) * s.playbackRate.value;
      return !s.loop || p < le ? p : ls + ((p - ls) % Math.max(1e-3, le - ls));
    };
    if (spatial && loop) { handle.at = { x: opts.pos.x, y: opts.pos.y, z: opts.pos.z }; this.tracked.push(handle); }
    this.voices.push(handle);
    // a sample still decoding is a Promise in the cache: wait for it (a second play during the load used to throw)
    if (buf && !(buf instanceof Promise)) startWith(buf);
    else if (buf === undefined || buf instanceof Promise) this._load(file).then(startWith);
    return handle;
  }

  /** Short sidechain-style dip of ambience + music under loud local events (gunfire, explosions). */
  duckFor(amount = 0.5, release = 0.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const b of ['amb', 'music']) {
      const g = this.buses[b].gain;
      const base = this.volumes[b];
      g.cancelScheduledValues(t);
      g.setTargetAtTime(base * (1 - amount), t, 0.01);
      g.setTargetAtTime(base, t + 0.05, release);
    }
  }

  /** Flash / concussion: 0 = open, 1 = deafened (world sounds behind a ~350 Hz low-pass; music and UI stay clear). */
  setMuffle(amount) {
    if (!this.ctx) return;
    const a = Math.min(1, Math.max(0, amount || 0));
    if (Math.abs(a - this.muffleAmt) < 0.005) return;
    this.muffleAmt = a;
    const ny = this.ctx.sampleRate / 2, f = this.muffle.frequency, t = this.ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setTargetAtTime(a < 0.01 ? ny : Math.min(ny, 350 * Math.pow(ny / 350, Math.pow(1 - a, 1.6))), t, 0.03);
    if (a < 0.01) f.setValueAtTime(ny, t + 0.25);   // land exactly on Nyquist: the identity filter again
  }

  // ---------------------------------------------------------------- music
  /** Starts the wanted track once the context and the manifests both exist (nothing else playing). */
  _kickMusic() {
    if (this.ctx && this.ready && this.wantMusic && !this.music && !this.stingerPending) this.playMusic(this.wantMusic);
  }

  /**
   * Music: plays a looping track (a sound name on the music bus) with a cross-fade. Tracks of one `sync` group
   * (calm / combat_low / combat_high: one grid, phase-compatible) continue at the old track's loop position and
   * cross-fade both ways; any other change fades the old track out under the new one (o.fadeIn, default 80 ms).
   * o: { fade, fadeIn, delay, at } (a number is the fade, as before).
   */
  playMusic(name, o = {}) {
    if (typeof o === 'number') o = { fade: o };
    this.stingerPending = false;
    const fade = o.fade ?? 1.5;
    this.wantMusic = name;
    if (this.music?.name === name && !this.music.stopped) return this.music;
    if (!this.ctx || !this.ready) return null;
    const def = this.defs[name];
    const old = this.music?.stopped ? null : this.music;
    const synced = !!(old && def?.sync && old.def?.sync === def.sync && old.src);
    if (old) old.stop(fade);
    // the successor's phase is taken when it actually starts (its buffer may still be decoding)
    this.music = this.play(name, { loop: true, bus: 'music', volume: 1, offset: synced ? (t0) => old.position(t0) : 0, delay: o.delay, at: o.at,
      fadeIn: o.fadeIn ?? (synced ? fade : old ? 0.08 : 0.5) });
    if (this.music) this.music.name = name;
    this._musicBudget(name);
    return this.music;
  }

  /** Decodes a track ahead of its cue (a boss round's music during the buy time before it). */
  prepareMusic(name) {
    this._musicBudget(name);
    return this.preload([name]);
  }

  stopMusic(fade = 1) {
    this.wantMusic = null;
    if (this.music) this.music.stop(fade);
    this.music = null;
  }

  /**
   * One-shot music cue (victory / defeat): the loop fades out under it, and `then` (a loop) fades in once it ends.
   * volume 1.5 (+3.5 dB) puts the -18 LUFS cue, after the music bus, level with the UI round stingers (round_win
   * -18 LUFS on the ui bus): the match's last word should not land under an ordinary round's. Returns its handle.
   */
  stinger(name, { fade = 0.6, then = null, gap = 0.6, fadeIn = 4, volume = 1.5 } = {}) {
    this.stopMusic(fade);
    this.wantMusic = then;
    const token = (this.stingerToken = (this.stingerToken || 0) + 1);
    this.stingerPending = true;   // a tap while the cue decodes must not start `then` over it (_kickMusic)
    const h0 = this.play(name, { bus: 'music', volume, onStart: (buf, h) => {
      if (token === this.stingerToken) this.stingerPending = false;
      // `at` (not a delay): the loop may still have to decode, it must not slip later than the stinger's end
      if (then && token === this.stingerToken && this.wantMusic === then && !this.music) this.playMusic(then, { at: h.t0 + buf.duration / h.src.playbackRate.value + gap, fadeIn });
    } });
    if (!h0) { this.stingerPending = false; this._kickMusic(); }
    return h0;
  }

  /**
   * A decoded music loop is ~20-28 MB of PCM: at most MUSIC_KEEP stay cached (a match's calm / combat_low / combat_high
   * / boss: no re-decode, so phase-locked switches never wait), the least recently cued go first (the menu theme
   * during a match, the match tracks back in the menus). Tracks decoded ahead (preload) count as just cued.
   */
  _musicBudget(name) {
    const lru = this.musicLRU || (this.musicLRU = []);
    const i = lru.indexOf(name);
    if (i >= 0) lru.splice(i, 1);
    lru.push(name);
    const decoded = (n) => this.defs[n]?.files.some((f) => { const b = this.buffers.get(f); return !!b && !(b instanceof Promise); });
    const loops = Object.keys(this.defs).filter((n) => this.defs[n].bus === 'music' && this.defs[n].loop && n !== name && decoded(n));
    loops.sort((a, b) => (lru.indexOf(a) + 1 || 1e9) - (lru.indexOf(b) + 1 || 1e9));   // never cued: newest
    for (let k = 0; k < loops.length - (MUSIC_KEEP - 1); k++) {
      const n = loops[k];
      if (this.music?.name === n && !this.music.stopped) continue;
      for (const f of this.defs[n].files) this.buffers.delete(f);   // a fading-out source keeps its own reference
      lru.splice(lru.indexOf(n) >>> 0, lru.includes(n) ? 1 : 0);
    }
  }
}
