// Molotov / incendiary fire (CS2 inferno): flame nodes spread over the floor from the impact point
// (1.07 m spacing, up to ~3.8 m, a new node every 0.02-0.05 s, blocked by walls, following the terrain),
// each node keeps emitting wispy fire fragments that overlap into one see-through burning sheet (soft floor
// contact, magenta fuel flecks at the fringe, a tall billow where the bottle broke), light grey smoke and embers
// with a flat ground glow;
// shared flickering lights; burns ~7 s, shrinks out over 0.8 s and leaves a scorch mark. Smoke grenades
// put the nodes out.
import * as THREE from 'three';
import { FRAME, RAMP, DECAL } from './atlas.js';

const R = Math.random;
const UP = [0, 1, 0];
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
let ids = 0;

export class Infernos {
  constructor(fx, { quality = 1 } = {}) {
    this.fx = fx;
    this.k = quality;
    this.list = [];
  }

  /** opts: radius (m), duration (s), spacing (m). Returns the inferno (call .stop() to extinguish). */
  spawn(pos, { radius = 3.8, duration = 7, spacing = 1.07 } = {}) {
    const fx = this.fx, col = fx.game.world.collision;
    const g = col ? col.floorBelow(pos, 0.5, 3) : pos.y;
    const y0 = isFinite(g) ? g : pos.y;
    const step = spacing * (this.k < 0.5 ? 1.35 : 1);
    // pre-compute the spread order (BFS over a hex-ish grid on the floor)
    const nodes = [];
    const seen = new Set();
    const queue = [[0, 0, y0]];
    seen.add('0,0');
    const maxNodes = Math.round(40 * Math.max(0.45, Math.min(1.2, this.k)));
    while (queue.length && nodes.length < maxNodes) {
      const [i, j, y] = queue.shift();
      const x = pos.x + (i + (j & 1) * 0.5) * step + (R() - 0.5) * 0.3, z = pos.z + j * step * 0.87 + (R() - 0.5) * 0.3;
      nodes.push({ p: new THREE.Vector3(x, y, z), at: nodes.length ? 0.15 + nodes.length * (0.02 + R() * 0.03) : 0, t: 0, emit: R() * 0.1, smoke: R() * 0.3, scale: 0.75 + R() * 0.45, out: false });
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
        const ni = i + di, nj = j + dj, kk = ni + ',' + nj;
        if (seen.has(kk)) continue;
        seen.add(kk);
        const nx = pos.x + (ni + (nj & 1) * 0.5) * step, nz = pos.z + nj * step * 0.87;
        if (Math.hypot(nx - pos.x, nz - pos.z) > radius) continue;
        let ny = y;
        if (col) {
          if (col.blocked(_v.set(x, y + 0.4, z), _w.set(nx, y + 0.4, nz))) continue;
          ny = col.floorBelow(_w, 1.0, 1.6);
          if (!isFinite(ny) || Math.abs(ny - y) > 0.9) continue;
        }
        queue.push([ni, nj, ny]);
      }
    }
    // initial whoosh
    fx.particles.spawn({ additive: true, x: pos.x, y: y0 + 0.5, z: pos.z, life: 0.35, size: 1.4, size1: 2.6, sizePow: 0.5, color: [1.2, 1, 1, 1], frame: FRAME.puff + 1, ramp: RAMP.flame, heat: 1, heat1: 0.2 });
    for (let k = 0; k < 6; k++) fx.particles.spawn({ additive: true, x: pos.x + (R() - 0.5) * 0.6, y: y0 + 0.2, z: pos.z + (R() - 0.5) * 0.6, vx: (R() - 0.5) * 3, vy: 1.5 + R() * 2, vz: (R() - 0.5) * 3, drag: 2, life: 0.4 + R() * 0.2, size: 0.6, size1: 1.3, color: [1, 1, 1, 1], frame: FRAME.fire, frames: 8, ramp: RAMP.flame, heat: 1, heat1: 0.1, mode: 'align', dir: UP, aspect: 1.3, anchor: 0.5 });
    const far = nodes.reduce((m, n) => Math.max(m, Math.hypot(n.p.x - pos.x, n.p.z - pos.z)), 0.5);
    for (const n of nodes) n.edge = Math.hypot(n.p.x - pos.x, n.p.z - pos.z) / far;
    const inf = { id: 'inferno' + (ids++), pos: pos.clone(), y0, nodes, t: 0, duration, radius, stopT: -1, lightPhase: R() * 10, scorched: false };
    inf.stop = () => { if (inf.stopT < 0) inf.stopT = inf.t; };
    this.list.push(inf);
    return inf;
  }

  update(dt) {
    const fx = this.fx, P = fx.particles;
    const smokes = fx.smokes;
    for (let li = this.list.length - 1; li >= 0; li--) {
      const inf = this.list[li];
      inf.t += dt;
      if (inf.stopT < 0 && inf.t > inf.duration) inf.stopT = inf.t;
      const dying = inf.stopT >= 0 ? Math.max(0, 1 - (inf.t - inf.stopT) / 0.8) : 1;
      let alive = 0, cx = 0, cz = 0;
      for (const nd of inf.nodes) {
        if (nd.out || inf.t < nd.at) continue;
        nd.t += dt;
        if (smokes && smokes.contains(nd.p, 0.6)) { nd.out = true; P.spawn({ x: nd.p.x, y: nd.p.y + 0.4, z: nd.p.z, vy: 0.8, life: 1.4, size: 0.5, size1: 1.6, sizePow: 0.5, color: [0.5, 0.48, 0.45, 0.5], color1: [0.5, 0.5, 0.5, 0], frame: FRAME.puff + 2, lit: true }); continue; }
        if (dying <= 0) continue;
        alive++; cx += nd.p.x; cz += nd.p.z;
        const grow = Math.min(1, nd.t / 0.35) * dying;
        const s = nd.scale * grow;
        nd.emit -= dt;
        const sk = THREE.MathUtils.clamp(1 / Math.sqrt(Math.max(0.3, this.k)), 1, 1.45);   // fewer, bigger flames on low
        const bedK = this.k < 0.5 ? 1.35 : 1;                                             // ...and a wider bed to close the gaps
        if (nd.emit <= 0) {
          // CS2 (2024+ inferno): a continuous, see-through sheet of burning gas: many wispy, fibrous fire fragments
          // overlapping into one low carpet (~0.4-0.9 m, taller licks here and there), cream-white where it is
          // dense, salmon-orange at the edges, magenta-violet flecks around the base and fringe
          nd.emit = (0.075 + R() * 0.05) / Math.max(0.5, this.k);
          const gy = nd.p.y;
          const ox = (R() - 0.5) * 1.1, oz = (R() - 0.5) * 1.1, sv = (0.8 + R() * 0.5) * sk;
          // a. fire fragment (the body of the sheet)
          P.spawn({ additive: true, x: nd.p.x + ox, y: gy, z: nd.p.z + oz, vx: (R() - 0.5) * 0.3, vy: 0.5 + R() * 0.45, vz: (R() - 0.5) * 0.3,
            life: 0.38 + R() * 0.3, size: 0.55 * s * sv, size1: 0.72 * s * sv, sizePow: 0.6, color: [1, 1, 1, 0.9], color1: [1, 1, 1, 0], colorPow: 1.5,
            frame: FRAME.flick[(R() * 4) | 0], ramp: RAMP.flame, heat: 0.95 + R() * 0.25, heat1: 0.3, heatPow: 1.1,
            mode: 'align', dir: UP, aspect: 0.85 + R() * 0.5, anchor: 0.32, mirror: R() < 0.5, rot: (R() - 0.5) * 0.5, drag: 1.2, ground: gy, soft: 0.14 });
          // b. low wide bed fragment that merges the fragments into one burning carpet
          P.spawn({ additive: true, x: nd.p.x + ox * 0.5 + (R() - 0.5) * 0.5, y: gy, z: nd.p.z + oz * 0.5 + (R() - 0.5) * 0.5, vy: 0.2,
            life: 0.45 + R() * 0.3, size: 0.85 * s * sk * bedK, size1: 1.0 * s * sk * bedK, color: [0.85, 0.85, 0.85, 0.75], color1: [1, 1, 1, 0], colorPow: 1.2,
            frame: FRAME.flick[(R() * 4) | 0], ramp: RAMP.flame, heat: 0.82 + R() * 0.15, heat1: 0.3,
            mode: 'align', dir: UP, aspect: 0.5 + R() * 0.2, anchor: 0.3, mirror: R() < 0.5, rot: (R() - 0.5) * 0.25, ground: gy, soft: 0.1 });
          // c. tall licking tongue now and then
          if (R() < 0.12) P.spawn({ additive: true, x: nd.p.x + ox * 0.8, y: gy, z: nd.p.z + oz * 0.8, vy: 0.5 + R() * 0.4, vx: (R() - 0.5) * 0.25, vz: (R() - 0.5) * 0.25,
            life: 0.45 + R() * 0.35, size: 0.6 * s * sv, size1: 0.85 * s * sv, sizePow: 0.6, color: [1, 1, 1, 0.85], color1: [1, 1, 1, 0], colorPow: 1.6,
            frame: FRAME.fire, frames: 8, fps: 14 + R() * 8, loop: true, frameOffset: R() * 7,
            ramp: RAMP.flame, heat: 1.0 + R() * 0.2, heat1: 0.35, heatPow: 1.2, mode: 'align', dir: UP, aspect: 1.3 + R() * 0.3, anchor: 0.38, mirror: R() < 0.5, rot: (R() - 0.5) * 0.35, ground: gy, soft: 0.12 });
          // d. violet-magenta flecks all along the base and the fringe (Valve's Mirage clip: a continuous purple
          //    fringe of small flames under the cream fire, CS2's burning fuel)
          const nfl = (R() < 0.6 ? 2 : 1) + (nd.edge > 0.55 ? 1 : 0);   // denser at the outer fringe
          for (let f = 0; f < nfl; f++) {
            const a = R() * 6.283, rf = f ? 0.55 + R() * 0.35 : R() * 0.6;
            P.spawn({ additive: true, x: nd.p.x + Math.cos(a) * rf, y: gy, z: nd.p.z + Math.sin(a) * rf, vy: 0.2 + R() * 0.25,
              life: 0.25 + R() * 0.25, size: (0.18 + R() * 0.2) * s, size1: (0.26 + R() * 0.2) * s, color: [1.3, 0.55, 1.0, 0.75], color1: [1.2, 0.5, 1.0, 0],
              frame: FRAME.flick[(R() * 4) | 0], ramp: RAMP.purple, heat: 0.6 + R() * 0.25, heat1: 0.25, mode: 'align', dir: UP, aspect: 0.55 + R() * 0.4, anchor: 0.3,
              mirror: R() < 0.5, rot: (R() - 0.5) * 0.8, ground: gy, soft: 0.05 });
          }
          // e. soft glowing billows: the diffuse, out-of-focus cream glow the sheet reads as from a distance
          if (s > 0.55 && R() < 0.45) P.spawn({ additive: true, x: nd.p.x + ox * 0.7, y: gy + 0.25 * s, z: nd.p.z + oz * 0.7, vy: 0.6 + R() * 0.4, vx: (R() - 0.5) * 0.3, vz: (R() - 0.5) * 0.3,
            life: 0.45 + R() * 0.25, size: 0.6 * s * sk, size1: 1.0 * s * sk, sizePow: 0.6, color: [0.5, 0.45, 0.4, 0.55], color1: [0.5, 0.4, 0.3, 0], colorPow: 0.8,
            frame: FRAME.puff + ((R() * 4) | 0), ramp: RAMP.flame, heat: 0.95, heat1: 0.3, rot: R() * 6.28, spin: (R() - 0.5) * 0.8, drag: 1, ground: gy, soft: 0.2 });
          if (R() < 0.12 * this.k) P.spawn({ additive: true, x: nd.p.x + ox, y: gy + 0.3, z: nd.p.z + oz, vx: (R() - 0.5) * 0.8, vy: 1.5 + R() * 2, vz: (R() - 0.5) * 0.8, life: 0.8 + R() * 0.8, size: 0.012, stretch: 0.03, color: [6, 2.6, 0.6, 1], color1: [2, 0.4, 0.05, 1], frame: FRAME.spark, drag: 0.5, gravity: -0.4 });
        }
        // the burst column at the impact point for the first ~1.5 s (CS2: a tall bright billow where the bottle broke)
        if (nd === inf.nodes[0] && inf.t < 1.6 && R() < dt * 14 * Math.max(0.5, this.k)) {
          const f = 1 - inf.t / 1.6;
          P.spawn({ additive: true, x: nd.p.x + (R() - 0.5) * 0.4, y: nd.p.y, z: nd.p.z + (R() - 0.5) * 0.4, vy: 1.2 + R() * 0.8, vx: (R() - 0.5) * 0.4, vz: (R() - 0.5) * 0.4,
            life: 0.45 + R() * 0.3, size: (0.9 + 0.7 * f) * sk, size1: (1.3 + 0.8 * f) * sk, sizePow: 0.6, color: [1, 1, 1, 0.75 * f + 0.2], color1: [1, 1, 1, 0], colorPow: 1.3,
            frame: FRAME.flick[(R() * 4) | 0], ramp: RAMP.flame, heat: 1.05 + R() * 0.15, heat1: 0.4, mode: 'align', dir: UP, aspect: 1.35, anchor: 0.32, mirror: R() < 0.5, rot: (R() - 0.5) * 0.4, drag: 1, ground: nd.p.y, soft: 0.15 });
        }
        nd.smoke -= dt;
        if (nd.smoke <= 0) {
          // dark brown-grey smoke boiling up right out of the flames (Valve's clip: soot mixed into the fire at flame
          // height), thinning as it rises; see-through, never a ceiling
          nd.smoke = (0.35 + R() * 0.3) / Math.max(0.4, this.k) * 1.6;
          P.spawn({ x: nd.p.x + (R() - 0.5) * 0.6, y: nd.p.y + 0.55 * s + 0.15, z: nd.p.z + (R() - 0.5) * 0.6, vx: (R() - 0.5) * 0.3, vy: 1.0 + R() * 0.6, vz: (R() - 0.5) * 0.3,
            life: 2.2 + R(), size: 0.6, size1: 2.2, sizePow: 0.6, color: [0.16, 0.13, 0.11, 0.24], color1: [0.3, 0.29, 0.28, 0], colorPow: 0.8, fadeIn: 0.15, frame: FRAME.puff + ((R() * 4) | 0), lit: true, drag: 0.3, spin: (R() - 0.5) * 0.6 });
        }
        // ground glow (flat, refreshed often so it flickers)
        if (R() < dt * 9) P.spawn({ additive: true, x: nd.p.x, y: nd.p.y + 0.03, z: nd.p.z, life: 0.22, size: 2.2 * s, color: [0.55, 0.22, 0.05, 1], color1: [0.4, 0.15, 0.03, 0], frame: FRAME.glow, mode: 'flat', dir: UP });
      }
      // lights: one keyed light at the fire's centre, flickering 6-10 Hz
      if (alive) {
        cx /= alive; cz /= alive;
        inf.lightPhase += dt;
        const fl = 0.75 + 0.15 * Math.sin(inf.lightPhase * 47) + 0.1 * Math.sin(inf.lightPhase * 71 + 1.3);
        fx.lights.hold(inf.id, _v.set(cx, inf.y0 + 1.1, cz), 0xff8a3c, (14 + alive * 1.2) * fl * dying, 7 + inf.radius);
      } else fx.lights.release(inf.id);
      if (dying <= 0 || (inf.t > 1.5 && !alive)) {
        if (!inf.scorched) {
          inf.scorched = true;
          fx.lights.release(inf.id);
          const c = fx.game.world.collision;
          const hit = c?.raycast(_v.set(inf.pos.x, inf.y0 + 0.5, inf.pos.z), _w.set(0, -1, 0), 2);
          if (hit) fx.decals.add(hit.point, hit.normal, { frame: DECAL.scorch, size: inf.radius * 1.6, alpha: 0.85, fit: false });
          for (let k = 0; k < 5; k++) P.spawn({ x: inf.pos.x + (R() - 0.5) * inf.radius, y: inf.y0 + 0.3, z: inf.pos.z + (R() - 0.5) * inf.radius, vy: 0.5, life: 2.5, size: 0.8, size1: 2.5, sizePow: 0.5, color: [0.2, 0.19, 0.18, 0.35], color1: [0.3, 0.3, 0.3, 0], frame: FRAME.puff + k % 4, lit: true, drag: 0.4 });
        }
        if (inf.t - Math.max(0, inf.stopT) > 1.2 || !alive) this.list.splice(li, 1);
      }
    }
  }
}
