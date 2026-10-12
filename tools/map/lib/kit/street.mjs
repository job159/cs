// Street furniture and set dressing: fences / chain-link / gates, barricades (jersey barriers, sandbags,
// plank barricades, police tape), street lights, utility poles + wires, traffic lights, cones, signs,
// billboards, water tower, shipping containers, debris and trash, wall / hanging lamps, Poly Haven props.
import * as THREE from 'three';
import { Kit, V, SURF } from './core.mjs';

const circle = (r, seg) => { const out = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; out.push([Math.cos(a) * r, Math.sin(a) * r]); } return out; };
const rectProf = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
const segLen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

Object.assign(Kit.prototype, {
  // ------------------------------------------------------------------------------------------ fences
  /**
   * Fence along a polyline [[x, z]...]. kind: 'chainlink' (default) | 'wood' | 'metal' (palisade) | 'concrete'.
   * h (2.2), y (base), post spacing (2.6), barbed (chain-link: 3 strands on angled arms), gaps: [[from, to] m along
   * the path] left open, collide (true: thin wall, blocks players and zombies; zombies may climb if nav says so).
   */
  fence(path, o = {}) {
    const kind = o.kind || 'chainlink', h = o.h ?? 2.2, y = o.y || 0, sp = o.spacing ?? 2.6;
    let along = 0;
    const gaps = o.gaps || [];
    const inGap = (s) => gaps.some(([g0, g1]) => s > g0 && s < g1);
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], L = segLen(a, b);
      if (L < 1e-3) continue;
      const rot = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      this.at({ x: a[0], y, z: a[1], rot }, () => {
        const nPost = Math.max(1, Math.round(L / sp));
        // spans
        for (let k = 0; k < nPost; k++) {
          const s0 = (L * k) / nPost, s1 = (L * (k + 1)) / nPost;
          if (inGap(along + (s0 + s1) / 2)) continue;
          if (kind === 'chainlink') {
            const top = h - 0.05;
            this.face([[s0, 0.05, 0], [s1, 0.05, 0], [s1, top, 0], [s0, top, 0]], 'chainlink', { uvs: [[along + s0, 0.05], [along + s1, 0.05], [along + s1, top], [along + s0, top]] });
            if (o.collide !== false) this.colBox({ x: (s0 + s1) / 2, y: 0, z: 0, w: s1 - s0, h, d: 0.05 }, 'metal');
          } else if (kind === 'wood') {
            const nb = Math.round((s1 - s0) / 0.16);
            for (let j = 0; j < nb; j++) {
              const bx = s0 + ((s1 - s0) * (j + 0.5)) / nb, bh = h - this.rnd(0, 0.12);
              if (this.chance(0.04)) continue; // missing board
              this.box({ x: bx, y: 0.04, z: 0.03, w: (s1 - s0) / nb - 0.012, h: bh, d: 0.022, mat: 'wood_planks', tint: o.tint || '#c7b9a4', uvOffset: [this.rnd(0, 5), 0] });
            }
            for (const ry of [0.35, h - 0.4]) this.box({ x: (s0 + s1) / 2, y: ry, z: -0.02, w: s1 - s0, h: 0.09, d: 0.045, mat: 'wood_planks', tint: '#9a8c78' });
            if (o.collide !== false) this.colBox({ x: (s0 + s1) / 2, y: 0, z: 0, w: s1 - s0, h, d: 0.08 }, 'wood');
          } else if (kind === 'metal') {
            const nb = Math.round((s1 - s0) / 0.13);
            for (let j = 0; j < nb; j++) {
              const bx = s0 + ((s1 - s0) * (j + 0.5)) / nb;
              this.box({ x: bx, y: 0.02, z: 0, w: 0.025, h: h - 0.02, d: 0.025, mat: 'steel_dark', tint: o.tint || '#2e302f' });
              this.cyl({ x: bx, y: h, z: 0, r: 0.03, r2: 0.0, h: 0.09, seg: 4, mat: 'steel_dark', tint: o.tint || '#2e302f' });
            }
            for (const ry of [0.2, h - 0.25]) this.box({ x: (s0 + s1) / 2, y: ry, z: 0, w: s1 - s0, h: 0.04, d: 0.05, mat: 'steel_dark', tint: o.tint || '#2e302f' });
            if (o.collide !== false) this.colBox({ x: (s0 + s1) / 2, y: 0, z: 0, w: s1 - s0, h, d: 0.06 }, 'metal');
          } else if (kind === 'concrete') {
            this.box({ x: (s0 + s1) / 2, y: 0, z: 0, w: s1 - s0, h, d: 0.2, mat: o.mat || 'concrete_wall', tint: o.tint, grime: { y: 0, h: 1.0, k: 0.3 }, collide: o.collide === false ? false : true });
            this.box({ x: (s0 + s1) / 2, y: h, z: 0, w: s1 - s0 + 0.02, h: 0.06, d: 0.26, mat: 'trim_concrete' });
          }
        }
        // posts + rails
        if (kind === 'chainlink') {
          for (let k = 0; k <= nPost; k++) {
            const s = (L * k) / nPost;
            if (k === nPost && i < path.length - 2) continue;
            const postH = h + (o.barbed ? 0.05 : 0.05);
            this.cyl({ x: s, y: 0, z: 0, r: 0.032, h: postH, seg: 6, mat: 'steel', tint: '#9a9da0' });
            this.cyl({ x: s, y: postH, z: 0, r: 0.04, h: 0.05, seg: 6, mat: 'steel', tint: '#8e9093' });
            if (o.barbed) {
              this.at({ x: s, y: postH, z: 0, rx: -0.75 }, () => this.box({ x: 0, y: 0, z: 0, w: 0.03, h: 0.42, d: 0.03, mat: 'steel_dark' }));
            }
          }
          this.sweep(circle(0.022, 6), [[0, h - 0.02, 0], [L, h - 0.02, 0]], 'steel', { smooth: true, tint: '#9a9da0' });
          if (o.barbed) for (let s = 0; s < 3; s++) {
            const yy = h + 0.15 + s * 0.11, zz = 0.1 + s * 0.09;
            this.sweep(circle(0.005, 4), [[0, yy, zz], [L / 2, yy - 0.02, zz], [L, yy, zz]], 'wire', { smooth: true });
          }
        } else if (kind === 'wood' || kind === 'metal') {
          for (let k = 0; k <= nPost; k++) {
            const s = (L * k) / nPost;
            this.box({ x: s, y: 0, z: kind === 'wood' ? -0.06 : 0, w: kind === 'wood' ? 0.09 : 0.06, h: h + 0.05, d: kind === 'wood' ? 0.09 : 0.06, mat: kind === 'wood' ? 'wood_planks' : 'steel_dark', tint: kind === 'wood' ? '#8f7f6a' : o.tint || '#2e302f' });
          }
        }
      });
      along += L;
    }
  },

  /** Chain-link (or palisade) gate panel: at [x, z], rot, w, h, open (radians swing). */
  gate(g) {
    const w = g.w ?? 3.6, h = g.h ?? 2.1;
    this.at({ x: g.at[0], y: g.y || 0, z: g.at[1], rot: (g.rot || 0) + (g.open || 0) }, () => {
      const fr = 'steel';
      this.sweep(circle(0.025, 6), [[0, 0.1, 0], [w, 0.1, 0], [w, h, 0], [0, h, 0], [0, 0.1, 0]], fr, { smooth: true, tint: '#a3a6a8' });
      this.sweep(circle(0.02, 6), [[0, h / 2, 0], [w, h / 2, 0]], fr, { smooth: true, tint: '#a3a6a8' });
      this.face([[0.03, 0.12, 0], [w - 0.03, 0.12, 0], [w - 0.03, h - 0.03, 0], [0.03, h - 0.03, 0]], 'chainlink', { uvs: [[0, 0.12], [w, 0.12], [w, h], [0, h]] });
      if (g.collide !== false) this.colBox({ x: w / 2, y: 0, z: 0, w, h, d: 0.06 }, 'metal');
      this.cyl({ x: 0, y: 0, z: -0.08, r: 0.05, h: h + 0.2, seg: 8, mat: 'steel', tint: '#8f9295', collide: true });
    });
  },

  // ------------------------------------------------------------------------------------------ barricades
  /** Concrete jersey barrier (procedural profile, 3.0 m) at [x, z], rot; tint; stripes (orange/white bands). */
  jersey(j) {
    const L = j.length ?? 3.0;
    const prof = [[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.18, 0.33], [0.08, 0.81], [-0.08, 0.81], [-0.18, 0.33], [-0.3, 0.08]];
    this.at({ x: j.at[0], y: j.y || 0, z: j.at[1], rot: j.rot || 0 }, () => {
      // sweep along local x, profile in (z, y)
      const p2 = prof.map(([pz, py]) => [pz, py]);
      this.sweep(p2.map(([a, b]) => [-a, b]).reverse(), [[-L / 2, 0, 0], [L / 2, 0, 0]], j.mat || 'concrete_wall', { caps: true, tint: j.tint || '#d1cdc3', grime: { y: 0, h: 0.5, k: 0.3 } });
      if (j.stripes) for (const s of [-0.9, 0.9]) {
        this.face([[s - 0.25, 0.4, 0.15], [s + 0.25, 0.4, 0.15], [s + 0.25, 0.7, 0.096], [s - 0.25, 0.7, 0.096]].map((p) => [p[0], p[1], p[2] + 0.006]), 'paint_red', { uvs: [[0, 0], [0.5, 0], [0.5, 0.3], [0, 0.3]] });
      }
      if (j.collide !== false) this.colHex([[-L / 2, 0, 0.3], [L / 2, 0, 0.3], [L / 2, 0.81, 0.08], [-L / 2, 0.81, 0.08], [-L / 2, 0, -0.3], [L / 2, 0, -0.3], [L / 2, 0.81, -0.08], [-L / 2, 0.81, -0.08]].map((p, i) => (i < 4 ? p : p)), 'concrete');
    });
  },

  /** Sandbag wall along a path: rows high (3), bags staggered. */
  sandbags(path, o = {}) {
    const rows = o.rows ?? 3, bl = 0.62, bw = 0.34, bh = 0.15;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], L = segLen(a, b);
      this.at({ x: a[0], y: o.y || 0, z: a[1], rot: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) }, () => {
        for (let r = 0; r < rows; r++) {
          const off = r % 2 ? bl / 2 : 0;
          const n = Math.floor((L - off) / bl);
          for (let k = 0; k < n; k++) {
            const x = off + bl * (k + 0.5) + this.rnd(-0.03, 0.03);
            this.bbox({ x, y: r * bh * 0.92, z: this.rnd(-0.03, 0.03), rot: this.rnd(-0.08, 0.08), w: bl - 0.02, h: bh, d: bw, bevel: 0.055, mat: 'sandbag', tint: this.pick(['#ffffff', '#e9e2d2', '#d6cdb9']), taper: { top: [0.9, 0.8] } });
          }
        }
        if (o.collide !== false) this.colBox({ x: L / 2, y: 0, z: 0, w: L, h: rows * bh * 0.92 + 0.02, d: bw }, 'sand');
      });
    }
  },

  /** Wooden plank barricade (X-braced boards on two trestles) at [x, z], rot, w (2.4). */
  plankBarricade(p) {
    const w = p.w ?? 2.4, h = p.h ?? 1.1;
    this.at({ x: p.at[0], y: p.y || 0, z: p.at[1], rot: p.rot || 0 }, () => {
      for (const s of [-w / 2 + 0.2, w / 2 - 0.2]) {
        this.at({ x: s, y: 0, z: 0 }, () => {
          this.at({ x: 0, y: 0, z: 0.2, rx: -0.35 }, () => this.box({ x: 0, y: 0, z: 0, w: 0.08, h: h / Math.cos(0.35), d: 0.06, mat: 'wood_planks', tint: '#a89a86' }));
          this.at({ x: 0, y: 0, z: -0.2, rx: 0.35 }, () => this.box({ x: 0, y: 0, z: 0, w: 0.08, h: h / Math.cos(0.35), d: 0.06, mat: 'wood_planks', tint: '#a89a86' }));
        });
      }
      for (const [yy, rz] of [[h - 0.15, this.rnd(-0.04, 0.04)], [h * 0.55, this.rnd(-0.05, 0.05)], [0.25, 0.3], [0.25, -0.3]]) {
        this.at({ x: 0, y: yy, z: 0.04, rz }, () => this.box({ x: 0, y: -0.09, z: 0, w: w + this.rnd(0, 0.3), h: 0.18, d: 0.03, mat: 'wood_planks', tint: this.pick(['#ffffff', '#ddd2c2']), uvOffset: [this.rnd(0, 4), 0] }));
      }
      if (p.stripes !== false) this.box({ x: 0, y: h - 0.24, z: 0.06, w: w * 0.9, h: 0.17, d: 0.005, mat: 'reflective_white', tint: '#d8d4cc' });
      if (p.collide !== false) this.colBox({ x: 0, y: 0, z: 0, w, h, d: 0.5 }, 'wood');
    });
  },

  /** Police / hazard tape between points [[x, y, z]...] (slight sag). */
  tape(points, o = {}) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const mid = V.lerp(a, b, 0.5); mid[1] -= o.sag ?? 0.08;
      const pts = [a, mid, b];
      for (let k = 0; k < 2; k++) {
        const p0 = pts[k], p1 = pts[k + 1];
        const hh = 0.04;
        this.face([[p0[0], p0[1] - hh, p0[2]], [p1[0], p1[1] - hh, p1[2]], [p1[0], p1[1] + hh, p1[2]], [p0[0], p0[1] + hh, p0[2]]], o.mat || 'tape_police', {});
      }
    }
  },

  /** Traffic cone at [x, z]. */
  cone(at, o = {}) {
    this.at({ x: at[0], y: o.y || 0, z: at[1], rot: this.rnd(0, 6.28), rz: o.fallen ? Math.PI / 2 - 0.1 : 0 }, () => {
      this.box({ x: 0, y: 0, z: 0, w: 0.38, h: 0.03, d: 0.38, mat: 'car_plastic', tint: '#2a2a2a' });
      this.cyl({ x: 0, y: 0.03, z: 0, r: 0.15, r2: 0.03, h: 0.68, seg: 12, mat: 'cone_orange' });
      this.cyl({ x: 0, y: 0.33, z: 0, r: 0.088, r2: 0.072, h: 0.1, seg: 12, mat: 'reflective_white', caps: false });
      this.cyl({ x: 0, y: 0.47, z: 0, r: 0.064, r2: 0.05, h: 0.07, seg: 12, mat: 'reflective_white', caps: false });
    });
  },

  // ------------------------------------------------------------------------------------------ lights & poles
  /**
   * Cobra-head street light: pole at [x, z], arm pointing towards rot (local -z... arm along local +x), h (8),
   * arm (2.2), on (true): emissive head + baked light (realtime: true to make it a runtime point light).
   * Returns the light record.
   */
  streetLight(s) {
    const h = s.h ?? 8, arm = s.arm ?? 2.2;
    let light = null;
    this.at({ x: s.at[0], y: s.y || 0, z: s.at[1], rot: s.rot || 0 }, () => {
      this.cyl({ x: 0, y: 0, z: 0, r: 0.16, r2: 0.15, h: 0.5, seg: 10, mat: 'trim_concrete', tint: '#9c978d' }); // base
      this.cyl({ x: 0, y: 0.5, z: 0, r: 0.1, r2: 0.065, h: h - 0.5, seg: 10, mat: 'steel', tint: s.tint || '#8a8d8f', collide: true });
      this.sweep(circle(0.045, 8), [[0, h - 0.6, 0], [arm * 0.4, h - 0.15, 0], [arm, h, 0]], 'steel', { smooth: true, tint: s.tint || '#8a8d8f', up: [0, 0, 1] });
      // head
      this.bbox({ x: arm + 0.25, y: h - 0.12, z: 0, w: 0.75, h: 0.2, d: 0.34, bevel: 0.06, mat: 'steel', tint: '#6f7275', taper: { top: [0.8, 0.85] } });
      this.face([[arm - 0.05, h - 0.121, 0.13], [arm + 0.55, h - 0.121, 0.13], [arm + 0.55, h - 0.121, -0.13], [arm - 0.05, h - 0.121, -0.13]].reverse(), s.on === false ? 'lamp_off' : (s.lamp || 'lamp_warm'));
      if (s.on !== false) light = this.light({ pos: [arm + 0.25, h - 0.35, 0], color: s.color || '#ffc27a', intensity: s.intensity ?? 60, range: s.range ?? 22, radius: 0.12, realtime: !!s.realtime, flicker: s.flicker, name: s.name });
    });
    return light;
  },

  /** Wooden utility pole with cross-arm(s) + insulators; returns wire attachment points (world). */
  utilityPole(p) {
    const h = p.h ?? 9.5;
    const pts = [];
    this.at({ x: p.at[0], y: p.y || 0, z: p.at[1], rot: p.rot || 0, rz: p.lean || 0 }, () => {
      this.cyl({ x: 0, y: -0.2, z: 0, r: 0.15, r2: 0.12, h: h + 0.2, seg: 10, mat: 'pole_wood', collide: true });
      const arms = p.arms ?? 1;
      for (let k = 0; k < arms; k++) {
        const ay = h - 0.45 - k * 0.9;
        this.box({ x: 0, y: ay, z: 0, w: 2.2, h: 0.1, d: 0.1, mat: 'pole_wood', tint: '#8a7660' });
        for (const xx of [-0.95, -0.35, 0.35, 0.95]) {
          this.cyl({ x: xx, y: ay + 0.1, z: 0, r: 0.035, r2: 0.03, h: 0.14, seg: 6, mat: 'car_light', tint: '#6d7a6a' });
          pts.push(this.W([xx, ay + 0.22, 0]));
        }
      }
      if (p.transformer) {
        this.cyl({ x: 0, y: h - 3.2, z: 0.36, r: 0.24, h: 0.85, seg: 12, mat: 'steel', tint: '#8f9493' });
        this.cyl({ x: 0, y: h - 2.35, z: 0.36, r: 0.25, r2: 0.2, h: 0.08, seg: 12, mat: 'steel', tint: '#7d8281' });
      }
      if (p.lamp) this.streetLight({ at: [0, 0], h: h - 2.2, arm: 1.6, rot: 0, color: p.lampColor, on: p.lamp !== 'off' });
    });
    return pts;
  },

  /** Hanging wires (catenaries) between two lists of attachment points (pairs by index). */
  wires(fromPts, toPts, o = {}) {
    const n = Math.min(fromPts.length, toPts.length);
    for (let i = 0; i < n; i++) this.wire(fromPts[i], toPts[i], o);
  },
  wire(a, b, o = {}) {
    const L = V.len(V.sub(b, a));
    const sag = o.sag ?? Math.min(1.2, L * 0.035);
    const segs = Math.max(4, Math.round(L / 2.5));
    const pts = [];
    for (let i = 0; i <= segs; i++) { const t = i / segs; const p = V.lerp(a, b, t); p[1] -= sag * 4 * t * (1 - t); pts.push(p); }
    // world points: undo the current frame
    const inv = this.matrix.clone().invert();
    const loc = pts.map((p) => { const v = new THREE.Vector3(...p).applyMatrix4(inv); return [v.x, v.y, v.z]; });
    this.sweep(circle(o.r ?? 0.012, 4), loc, 'wire', { smooth: true });
  },

  /** Traffic signal on a mast arm: base at [x, z], rot = direction the arm extends (local +x), heads face local +z. */
  trafficLight(t) {
    const h = t.h ?? 5.8, arm = t.arm ?? 5.5;
    this.at({ x: t.at[0], y: t.y || 0, z: t.at[1], rot: t.rot || 0 }, () => {
      this.cyl({ x: 0, y: 0, z: 0, r: 0.14, r2: 0.11, h: h + 0.6, seg: 10, mat: 'steel', tint: t.tint || '#7d8083', collide: true });
      this.sweep(circle(0.07, 8), [[0, h, 0], [arm, h + 0.25, 0]], 'steel', { smooth: true, tint: t.tint || '#7d8083', up: [0, 0, 1] });
      const states = t.state ? [t.state] : ['red', 'amber', 'green', 'off'];
      for (const [hx, k] of [[arm * 0.55, 0], [arm - 0.3, 1]]) {
        const st = t.state || this.pick(states);
        this.at({ x: hx, y: h + 0.15 - 1.05, z: 0 }, () => {
          this.bbox({ x: 0, y: 0, z: 0, w: 0.34, h: 1.05, d: 0.28, bevel: 0.03, mat: 'car_plastic', tint: '#2a2b1f' });
          for (const [i, c] of [[0, 'red'], [1, 'amber'], [2, 'green']]) {
            const yy = 0.85 - i * 0.32;
            const m = st === c ? (c === 'red' ? 'lamp_red' : c === 'amber' ? 'lamp_amber' : 'lamp_green') : 'lamp_off';
            this.cyl({ x: 0, y: yy, z: 0.14, r: 0.1, h: 0.02, seg: 10, mat: m, rx: Math.PI / 2 });
            this.box({ x: 0, y: yy + 0.1, z: 0.2, w: 0.24, h: 0.02, d: 0.14, mat: 'car_plastic', tint: '#2a2b1f' });
          }
        });
        void k;
      }
    });
  },

  /** Post-mounted road sign: at [x, z], rot (face direction = local +z), shape 'rect'|'octagon'|'diamond'|'round'. */
  roadSign(s) {
    const h = s.h ?? 2.3;
    this.at({ x: s.at[0], y: s.y || 0, z: s.at[1], rot: s.rot || 0, rz: s.lean || 0 }, () => {
      this.box({ x: 0, y: 0, z: -0.03, w: 0.06, h: h + 0.3, d: 0.06, mat: 'steel', tint: '#9a9c9e' });
      const shape = s.shape || 'rect', size = s.size ?? 0.75;
      const mat = s.mat || (shape === 'octagon' ? 'sign_red' : shape === 'diamond' ? 'sign_yellow' : 'sign_white');
      const n = shape === 'octagon' ? 8 : shape === 'diamond' ? 4 : shape === 'round' ? 16 : 4;
      const off = shape === 'octagon' ? Math.PI / 8 : shape === 'diamond' ? 0 : Math.PI / 4;
      const r = shape === 'rect' ? size * 0.7 : size / 2;
      const ring = [];
      for (let i = 0; i < n; i++) { const a = off + (i / n) * Math.PI * 2; ring.push([Math.cos(a) * r * (shape === 'rect' ? (s.aspect ?? 1.4) : 1), h + Math.sin(a) * r, 0.005]); }
      this.face(ring, mat, { tint: s.tint });
      this.face(ring.map((p) => [p[0], p[1], -0.004]).reverse(), 'steel', { tint: '#8d8f91' });
      if (s.collide !== false) this.colBox({ x: 0, y: 0, z: -0.03, w: 0.1, h: h, d: 0.1 }, 'metal');
    });
  },

  /** Billboard on steel legs: at [x, z], rot (face = local +z), w (6), h (3), elev (4), lit. */
  billboard(b) {
    const w = b.w ?? 6, h = b.h ?? 3, elev = b.elev ?? 4;
    this.at({ x: b.at[0], y: b.y || 0, z: b.at[1], rot: b.rot || 0 }, () => {
      for (const s of [-w * 0.3, w * 0.3]) this.box({ x: s, y: 0, z: -0.3, w: 0.3, h: elev + h, d: 0.3, mat: 'steel_dark', tint: '#5b5955', collide: true });
      this.box({ x: 0, y: elev, z: -0.12, w: w + 0.2, h: h + 0.2, d: 0.14, mat: 'steel_dark', tint: '#4d4b47' });
      this.face([[-w / 2, elev + 0.1, -0.04], [w / 2, elev + 0.1, -0.04], [w / 2, elev + 0.1 + h, -0.04], [-w / 2, elev + 0.1 + h, -0.04]], b.mat || 'billboard', { tint: b.tint });
      // torn poster panels
      for (let i = 0; i < 3; i++) if (this.chance(0.7)) {
        const px = this.rnd(-w / 2 + 0.6, w / 2 - 1.5), py = elev + this.rnd(0.4, h - 1.0);
        this.face([[px, py, -0.035], [px + this.rnd(0.8, 1.6), py, -0.035], [px + this.rnd(0.8, 1.6), py + this.rnd(0.5, 0.9), -0.035], [px, py + this.rnd(0.5, 0.9), -0.035]], this.pick(['sign_blue', 'sign_red', 'sign_yellow', 'sign_white']), { shade: 0.85 });
      }
      // catwalk
      this.box({ x: 0, y: elev - 0.1, z: 0.45, w: w, h: 0.05, d: 0.7, mat: 'steel_dark', tint: '#4a4642' });
      if (b.lit) for (const s of [-w / 3, 0, w / 3]) {
        this.sweep(circle(0.025, 6), [[s, elev - 0.05, 0.6], [s, elev + 0.3, 1.0]], 'steel_dark', { smooth: true });
        this.bbox({ x: s, y: elev + 0.25, z: 1.0, w: 0.3, h: 0.15, d: 0.2, mat: 'steel_dark' });
        this.light({ type: 'spot', pos: [s, elev + 0.35, 1.0], dir: [0, 0.6, -1], color: '#ffe2b0', intensity: 30, range: 10, angle: 0.7, penumbra: 0.6 });
      }
    });
  },

  /** Elevated water tower: at [x, z], h (legs, 14), r (tank radius 4). */
  waterTower(t) {
    const h = t.h ?? 14, r = t.r ?? 4, th = t.tankH ?? 5;
    this.at({ x: t.at[0], y: t.y || 0, z: t.at[1], rot: t.rot || 0 }, () => {
      const legs = 4;
      for (let i = 0; i < legs; i++) {
        const a = (i / legs) * Math.PI * 2 + Math.PI / 4, lx = Math.cos(a) * r * 0.85, lz = -Math.sin(a) * r * 0.85;
        const fx = Math.cos(a) * r * 1.05, fz = -Math.sin(a) * r * 1.05;
        this.sweep(circle(0.16, 8), [[fx, 0, fz], [lx, h, lz]], 'steel_dark', { smooth: true, tint: '#6b6560' });
        this.box({ x: fx, y: 0, z: fz, w: 0.8, h: 0.4, d: 0.8, mat: 'trim_concrete', collide: true });
        this.colBox({ x: (fx + lx) / 2, y: 0, z: (fz + lz) / 2, w: 0.35, h: h, d: 0.35 }, 'metal');
      }
      // bracing rings
      for (const yy of [h * 0.35, h * 0.7]) {
        const s = 1.05 - (0.2 * yy) / h;
        const ring = [];
        for (let i = 0; i <= legs; i++) { const a = (i / legs) * Math.PI * 2 + Math.PI / 4; ring.push([Math.cos(a) * r * s, yy, -Math.sin(a) * r * s]); }
        this.sweep(circle(0.07, 6), ring, 'steel_dark', { smooth: true, tint: '#6b6560' });
      }
      this.cyl({ x: 0, y: h, z: 0, r, h: th, seg: 24, mat: t.mat || 'metal_worn', tint: t.tint || '#b8b4a8', top: false });
      this.cyl({ x: 0, y: h - 0.6, z: 0, r: r * 0.6, r2: r, h: 0.6, seg: 24, mat: t.mat || 'metal_worn', tint: t.tint || '#a9a598', caps: false });
      this.cyl({ x: 0, y: h + th, z: 0, r: r + 0.15, r2: 0.3, h: 1.6, seg: 24, mat: 'metal_rusty', tint: '#8d847a' });
      // catwalk ring
      const ring = [];
      for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; ring.push([Math.cos(a) * (r + 0.6), h + 0.95, -Math.sin(a) * (r + 0.6)]); }
      this.sweep(circle(0.03, 6), ring, 'steel_dark', { smooth: true });
      this.sweep([[-0.35, -0.03], [0.35, -0.03], [0.35, 0.03], [-0.35, 0.03]], ring.map((p) => [p[0] * (r + 0.3) / (r + 0.6), h + 0.02, p[2] * (r + 0.3) / (r + 0.6)]), 'steel_dark', {});
      // ladder
      this.at({ x: r * 0.85 + 0.25, y: 0, z: 0 }, () => {
        for (const s of [-0.22, 0.22]) this.box({ x: 0, y: 0, z: s, w: 0.05, h: h + th, d: 0.05, mat: 'steel_dark' });
      });
      if (t.collideTank !== false) this.colPrism(circle(r, 12).map(([x, z]) => [x, z]), h, h + th + 1.6, 'metal');
    });
  },

  /**
   * ISO shipping container: at [x, z], rot, size 20|40, y (stacking), tint, doors 'closed'|'open'|'ajar'.
   * Corrugated sides (metal_container texture), corner posts, top/bottom rails, door bars.
   */
  container(c) {
    const L = c.size === 20 ? 6.06 : 12.19, W = 2.44, H = 2.59;
    const tint = c.tint || this.pick(['#ffffff', '#c45a3c', '#3c6e8f', '#c9a23f', '#8c8c86', '#7a3a2a']);
    this.at({ x: c.at[0], y: c.y || 0, z: c.at[1], rot: c.rot || 0 }, () => {
      const m = 'metal_container';
      const side = (z, flip) => {
        const pts = [[-L / 2 + 0.12, 0.12, z], [L / 2 - 0.12, 0.12, z], [L / 2 - 0.12, H - 0.12, z], [-L / 2 + 0.12, H - 0.12, z]];
        this.face(flip ? pts.reverse() : pts, m, { tint, uvRot: Math.PI / 2, grime: { y: 0, h: 0.8, k: 0.25 } });
      };
      side(W / 2 - 0.03, false); side(-W / 2 + 0.03, true);
      // front end (closed) and roof
      this.face([[-L / 2 + 0.06, 0.12, -W / 2 + 0.12], [-L / 2 + 0.06, 0.12, W / 2 - 0.12], [-L / 2 + 0.06, H - 0.12, W / 2 - 0.12], [-L / 2 + 0.06, H - 0.12, -W / 2 + 0.12]], m, { tint, uvRot: Math.PI / 2 });
      this.face([[-L / 2, H - 0.02, W / 2], [L / 2, H - 0.02, W / 2], [L / 2, H - 0.02, -W / 2], [-L / 2, H - 0.02, -W / 2]], 'metal_painted', { tint });
      // frame: corner posts + rails
      const fr = 'steel_dark', ft = '#3e3b38';
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box({ x: (sx * (L - 0.16)) / 2, y: 0, z: (sz * (W - 0.16)) / 2, w: 0.16, h: H, d: 0.16, mat: fr, tint: ft });
      for (const yy of [0, H - 0.14]) for (const sz of [-1, 1]) this.box({ x: 0, y: yy, z: (sz * (W - 0.12)) / 2, w: L - 0.3, h: 0.14, d: 0.12, mat: fr, tint: ft });
      for (const yy of [0, H - 0.14]) for (const sx of [-1, 1]) this.box({ x: (sx * (L - 0.12)) / 2, y: yy, z: 0, w: 0.12, h: 0.14, d: W - 0.3, mat: fr, tint: ft });
      // doors at +x
      const doors = c.doors || 'closed';
      for (const sz of [-1, 1]) {
        const ang = doors === 'open' ? sz * 1.9 : doors === 'ajar' && sz > 0 ? 0.5 : 0;
        this.at({ x: L / 2 - 0.05, y: 0.12, z: sz * (W / 2 - 0.1), rot: ang }, () => {
          const dw = W / 2 - 0.1;
          const pts = [[0, 0, 0], [0, 0, -sz * dw], [0, H - 0.26, -sz * dw], [0, H - 0.26, 0]];
          this.face(sz > 0 ? pts : pts.slice().reverse(), m, { tint, uvRot: Math.PI / 2 });
          this.face(sz > 0 ? pts.slice().reverse().map((p) => [p[0] - 0.02, p[1], p[2]]) : pts.map((p) => [p[0] - 0.02, p[1], p[2]]), 'metal_painted', { tint, shade: 0.8 });
          for (const bz of [0.3, 0.8]) this.box({ x: 0.04, y: 0, z: -sz * bz * dw, w: 0.04, h: H - 0.26, d: 0.04, mat: 'steel', tint: '#8f8f8a' });
        });
      }
      if (doors !== 'closed') this.face([[L / 2 - 0.3, 0.13, -W / 2 + 0.1], [L / 2 - 0.3, 0.13, W / 2 - 0.1], [-L / 2 + 0.2, 0.13, W / 2 - 0.1], [-L / 2 + 0.2, 0.13, -W / 2 + 0.1]].reverse(), 'wood_planks', { tint: '#7d6a55' });
      if (c.collide !== false) {
        if (doors === 'closed') this.colBox({ x: 0, y: 0, z: 0, w: L, h: H, d: W }, 'metal');
        else {
          this.colBox({ x: 0, y: 0, z: W / 2 - 0.05, w: L, h: H, d: 0.1 }, 'metal');
          this.colBox({ x: 0, y: 0, z: -W / 2 + 0.05, w: L, h: H, d: 0.1 }, 'metal');
          this.colBox({ x: -L / 2 + 0.05, y: 0, z: 0, w: 0.1, h: H, d: W }, 'metal');
          this.colBox({ x: 0, y: H - 0.1, z: 0, w: L, h: 0.1, d: W }, 'metal');
          this.colBox({ x: 0, y: 0, z: 0, w: L, h: 0.13, d: W }, 'metal');
        }
      }
    });
  },

  // ------------------------------------------------------------------------------------------ dressing
  /** Scattered debris (bricks, chunks, planks, paper) in a radius around [x, z]. */
  debris(at, o = {}) {
    const n = o.count ?? 14, r = o.r ?? 1.5;
    for (let i = 0; i < n; i++) {
      const a = this.rnd(0, 6.28), d = Math.sqrt(this.rand()) * r;
      const x = at[0] + Math.cos(a) * d, z = at[1] + Math.sin(a) * d;
      const kind = this.pick(o.kinds || ['brick', 'brick', 'chunk', 'plank', 'paper']);
      const rot = this.rnd(0, 6.28);
      if (kind === 'brick') this.box({ x, y: o.y || 0, z, rot, w: 0.21, h: 0.065, d: 0.1, mat: 'brick_red', tint: this.pick(['#ffffff', '#c9b8a8']), rz: this.rnd(-0.3, 0.3) });
      else if (kind === 'chunk') this.bbox({ x, y: (o.y || 0) - 0.03, z, rot, w: this.rnd(0.15, 0.5), h: this.rnd(0.08, 0.25), d: this.rnd(0.15, 0.4), bevel: 0.03, mat: 'concrete_wall', tint: '#b9b3a8' });
      else if (kind === 'plank') this.box({ x, y: (o.y || 0) + 0.01, z, rot, w: this.rnd(0.6, 1.6), h: 0.025, d: 0.12, mat: 'wood_planks', tint: '#b8a990', rz: this.rnd(-0.05, 0.05) });
      else this.upFace([[x - 0.15, (o.y || 0) + 0.004, z - 0.11], [x + 0.15, (o.y || 0) + 0.004, z - 0.11], [x + 0.15, (o.y || 0) + 0.004, z + 0.11], [x - 0.15, (o.y || 0) + 0.004, z + 0.11]], 'sign_white', null, { tint: '#d8d2c4', shade: this.rnd(0.6, 1) });
    }
  },

  /** Rubble pile (mound of chunks) at [x, z], r. */
  rubblePile(at, o = {}) {
    const r = o.r ?? 1.6, h = o.h ?? 0.7;
    const ring = [];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const rr = r * this.rnd(0.75, 1.1); ring.push([at[0] + Math.cos(a) * rr, (o.y || 0), at[1] - Math.sin(a) * rr]); }
    const top = [at[0] + this.rnd(-0.2, 0.2), (o.y || 0) + h, at[1] + this.rnd(-0.2, 0.2)];
    const mid = ring.map((p) => [p[0] + (top[0] - p[0]) * 0.5 + this.rnd(-0.1, 0.1), (o.y || 0) + h * this.rnd(0.45, 0.7), p[2] + (top[2] - p[2]) * 0.5 + this.rnd(-0.1, 0.1)]);
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      this.face([ring[i], ring[j], mid[j], mid[i]].reverse(), 'rubble', {});
      this.face([mid[i], mid[j], top].reverse(), 'rubble', {});
    }
    this.colPoly(mid.map((p) => [p[0], p[1] * 0.9, p[2]]), 'concrete');
    this.debris(at, { r: r * 1.2, count: o.count ?? 10, y: o.y });
  },

  /** Trash pile: bags (prop if available), boxes, papers. */
  trash(at, o = {}) {
    const n = o.count ?? 5;
    for (let i = 0; i < n; i++) {
      const p = [at[0] + this.rnd(-0.8, 0.8), at[1] + this.rnd(-0.6, 0.6)];
      if (this.hasProp('trashbag') && this.chance(0.6)) this.prop('trashbag', { at: p, rot: this.rnd(0, 6.28), y: o.y, scale: this.rnd(0.85, 1.15), collide: false });
      else if (this.hasProp('cardboard_box_01') && this.chance(0.5)) this.prop('cardboard_box_01', { at: p, rot: this.rnd(0, 6.28), y: o.y, collide: false });
      else this.bbox({ x: p[0], y: o.y || 0, z: p[1], rot: this.rnd(0, 6.28), w: this.rnd(0.3, 0.6), h: this.rnd(0.2, 0.4), d: this.rnd(0.3, 0.5), bevel: 0.08, mat: 'car_plastic', tint: '#1d1e1c' });
    }
    this.debris(at, { r: 1.2, count: 6, kinds: ['paper', 'paper', 'plank'], y: o.y });
  },

  /** Wall lamp (wall-local frame: x, y, outward +z) with a baked light. */
  wallLamp(l) {
    this.at({ x: l.x, y: l.y, z: 0 }, () => {
      this.box({ x: 0, y: -0.06, z: 0.02, w: 0.14, h: 0.12, d: 0.04, mat: 'steel_dark' });
      this.sweep(circle(0.018, 6), [[0, 0, 0.02], [0, 0.05, 0.3]], 'steel_dark', { smooth: true, up: [0, 0, 1] });
      this.cyl({ x: 0, y: -0.06, z: 0.32, r: 0.2, r2: 0.05, h: 0.12, seg: 12, mat: 'steel_dark', tint: '#3b4a3f' });
      this.cyl({ x: 0, y: -0.08, z: 0.32, r: 0.06, h: 0.03, seg: 10, mat: l.on === false ? 'lamp_off' : 'lamp_warm' });
      if (l.on !== false) this.light({ pos: [0, -0.25, 0.45], color: l.color || '#ffbf7a', intensity: l.intensity ?? 8, range: l.range ?? 8, radius: 0.05, flicker: l.flicker, realtime: l.realtime });
    });
  },

  /** Bare hanging bulb / caged light (for interiors), at a local point. */
  bulb(at, o = {}) {
    this.sweep(circle(0.006, 4), [[at[0], at[1] + (o.cord ?? 0.6), at[2]], [at[0], at[1] + 0.08, at[2]]], 'wire', { smooth: true, up: [1, 0, 0] });
    this.cyl({ x: at[0], y: at[1], z: at[2], r: 0.05, r2: 0.035, h: 0.09, seg: 8, mat: o.on === false ? 'lamp_off' : 'lamp_warm' });
    if (o.on !== false) this.light({ pos: [at[0], at[1] - 0.1, at[2]], color: o.color || '#ffb76b', intensity: o.intensity ?? 5, range: o.range ?? 7, radius: 0.04, flicker: o.flicker, realtime: o.realtime });
  },

  // ------------------------------------------------------------------------------------------ props
  hasProp(id) { return !!(this.propLib && this.propLib[id] && this.loadProp); },
  /**
   * Places a processed Poly Haven prop (game/assets/maps/common/props.json): at [x, z], y, rot, scale,
   * collide: true (manifest default: 'box' | 'cyl' | 'pole' | 'none') | false | surf name.
   * Merged into the static map like any kit geometry (each prop material = its own kit material).
   */
  prop(id, p = {}) {
    const def = this.propLib[id];
    if (!def || !this.loadProp) { this.log(`  ! prop '${id}' not available (run tools/map/fetch.mjs --props)`); return null; }
    const data = this.loadProp(id);
    const at = p.at || [p.x || 0, p.z || 0];
    const s = p.scale ?? 1;
    this.at({ x: at[0], y: p.y || 0, z: at[1], rot: p.rot || 0, rx: p.rx || 0, rz: p.rz || 0, scale: s }, () => {
      data.parts.forEach((part) => {
        const mat = part.kitMaterial;
        const P = [], N = [], UV = [], C = [];
        const pos = part.position, nrm = part.normal, uv = part.uv;
        for (let i = 0; i < pos.length / 3; i++) {
          const wp = this.W([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
          P.push(...wp); N.push(...this.WD([nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]]));
          UV.push(uv[i * 2], uv[i * 2 + 1]);
          C.push(...this._color(p, wp));
        }
        this.emit(mat, P, N, UV, C, part.index);
      });
      const kind = p.collide === undefined || p.collide === true ? def.collide : p.collide;
      if (kind && kind !== 'none' && kind !== false) {
        const [mn, mx] = def.bbox;
        const surf = typeof kind === 'string' && SURF[kind] !== undefined ? kind : def.surf || 'metal';
        const shape = SURF[kind] !== undefined ? def.collide : kind;
        if (shape === 'pole') this.colBox({ x: 0, y: mn[1], z: 0, w: 0.2, h: mx[1] - mn[1], d: 0.2 }, surf);
        else if (shape === 'cyl') this.colBox({ x: (mn[0] + mx[0]) / 2, y: mn[1], z: (mn[2] + mx[2]) / 2, w: (mx[0] - mn[0]) * 0.85, h: mx[1] - mn[1], d: (mx[2] - mn[2]) * 0.85 }, surf);
        else this.colBox({ x: (mn[0] + mx[0]) / 2, y: mn[1], z: (mn[2] + mx[2]) / 2, w: mx[0] - mn[0], h: mx[1] - mn[1], d: mx[2] - mn[2] }, surf);
      }
    });
    this.propInstances.push({ id, at: this.W([at[0], p.y || 0, at[1]]), rot: (p.rot || 0) + this.yaw });
    return def;
  },
});
void rectProf;
