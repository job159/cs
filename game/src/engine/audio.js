// WebAudio engine: manifest-driven sample playback with variants, pitch jitter, per-sound voice caps,
// 3D positioning (equal-power panner + distance low-pass for air absorption), buses with ducking, and
// a cross-fading music layer. The manifest format is documented in docs/AUDIO.md (index.json lists
// manifest.<category>.json files: { sounds: { name: { files, vol, pitch, voices, bus, spatial, range, loop } } }).
const BASE = 'assets/audio/';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.defs = Object.create(null);
    this.buffers = new Map();     // file -> AudioBuffer | Promise
    this.voices = [];             // active voices
    this.maxVoices = 40;
    this.listener = { x: 0, y: 0, z: 0 };
    this.volumes = { master: 0.9, sfx: 1, music: 0.55, ui: 0.8, amb: 0.7, voice: 1 };
    this.ready = false;
    this.warned = new Set();
    this.duck = 0;
    this.music = null;
  }

  /** Must be called from a user gesture on mobile. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) this._create();
    if (this.ctx.state === 'suspended') this.ctx.resume();
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
    this.buses = {};
    for (const b of ['sfx', 'music', 'ui', 'amb', 'voice']) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses[b] = g;
    }
    this._applyVolumes();
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
    } catch (e) {
      console.warn('audio manifest missing', e.message);
    }
    this.ready = true;
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
      .then((buf) => { this.buffers.set(file, buf); return buf; })
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
  }

  /**
   * Plays a sound. opts: pos {x,y,z} (3D), volume, pitch (multiplier), delay (s), loop, bus override.
   * Returns a handle { stop(fade), setPos(p), setVolume(v), setRate(r) } or null.
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
    const spatial = opts.pos && def.spatial !== false;
    // distance cull before doing anything expensive
    let dist = 0;
    if (spatial) {
      const dx = opts.pos.x - this.listener.x, dy = opts.pos.y - this.listener.y, dz = opts.pos.z - this.listener.z;
      dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const maxD = def.range?.[1] ?? 60;
      if (dist > maxD) return null;
    }
    // voice caps (per sound and global); steal the oldest
    const same = this.voices.filter((v) => v.name === name);
    if (same.length >= (def.voices ?? 4)) same[0].stop(0.03);
    if (this.voices.length >= this.maxVoices) this.voices.sort((a, b) => a.prio - b.prio || a.start - b.start)[0].stop(0.02);

    const handle = { name, prio: def.priority ?? 1, start: ctx.currentTime, src: null, stopped: false };
    const startWith = (buffer) => {
      if (!buffer || handle.stopped) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const pr = def.pitch || [1, 1];
      src.playbackRate.value = (pr[0] + Math.random() * (pr[1] - pr[0])) * (opts.pitch ?? 1);
      src.loop = !!(opts.loop ?? def.loop);
      const gain = ctx.createGain();
      gain.gain.value = (def.vol ?? 1) * (opts.volume ?? 1);
      let node = src;
      if (spatial) {
        const pan = ctx.createPanner();
        pan.panningModel = 'equalpower';
        pan.distanceModel = 'inverse';
        pan.refDistance = def.range?.[0] ?? 2;
        pan.maxDistance = def.range?.[1] ?? 60;
        pan.rolloffFactor = def.rolloff ?? 1;
        pan.positionX ? (pan.positionX.value = opts.pos.x, pan.positionY.value = opts.pos.y, pan.positionZ.value = opts.pos.z) : pan.setPosition(opts.pos.x, opts.pos.y, opts.pos.z);
        // air absorption: distant sounds lose highs
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = Math.max(1200, 20000 - dist * 260);
        node.connect(lp); lp.connect(pan); node = pan;
        handle.pan = pan; handle.lp = lp;
      }
      node.connect(gain);
      gain.connect(this.buses[opts.bus || def.bus || 'sfx'] || this.buses.sfx);
      src.start(ctx.currentTime + (opts.delay || 0));
      src.onended = () => { handle.stopped = true; const i = this.voices.indexOf(handle); if (i >= 0) this.voices.splice(i, 1); };
      handle.src = src; handle.gain = gain;
    };
    handle.stop = (fade = 0.05) => {
      if (handle.stopped) return;
      handle.stopped = true;
      const i = this.voices.indexOf(handle); if (i >= 0) this.voices.splice(i, 1);
      if (handle.src) {
        const t = ctx.currentTime;
        handle.gain.gain.setTargetAtTime(0, t, fade / 3);
        try { handle.src.stop(t + fade + 0.02); } catch { /* already stopped */ }
      }
    };
    handle.setPos = (p) => { if (handle.pan) { const t = ctx.currentTime; handle.pan.positionX.setTargetAtTime(p.x, t, 0.02); handle.pan.positionY.setTargetAtTime(p.y, t, 0.02); handle.pan.positionZ.setTargetAtTime(p.z, t, 0.02); } };
    handle.setVolume = (v) => { if (handle.gain) handle.gain.gain.setTargetAtTime((def.vol ?? 1) * v, ctx.currentTime, 0.03); };
    handle.setRate = (r) => { if (handle.src) handle.src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.03); };
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

  /** Music: plays a looping track with a cross-fade; tracks are sound names on the music bus. */
  playMusic(name, fade = 1.5) {
    if (this.music?.name === name) return;
    const old = this.music;
    if (old) old.stop(fade);
    this.music = this.play(name, { loop: true, bus: 'music', volume: 1 });
    if (this.music) this.music.name = name;
  }
}
