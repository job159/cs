// Procedural PBR stand-in texture sets (original work, CC0). Used for every texture slot until the CC0
// photoscans are downloaded by tools/map/fetch.mjs (fetched sets replace these, same ids / file names).
// Each generator returns tileable planes for one tile of `tile` metres:
//   { albedo: RGB (sRGB 0..1), height (metres), rough, metal?, ao?, alpha? }
// writeSet() turns them into <id>_diff.jpg|png, <id>_nor.jpg (OpenGL), <id>_arm.jpg (R=AO G=rough B=metal).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { encodeJPEG } from './jpeg.mjs';
import {
  hash, mulberry, fbm, perlin, worley, warp, blur, cavityAO, heightToNormal, hex, mix3, RGB, plane,
  smoothstep, clamp01, lerp, sample,
} from './texsynth.mjs';

// ---------------------------------------------------------------- shared building blocks

function asphaltBase(N, tile, seed, { light = 0 } = {}) {
  const albedo = new RGB(N), height = plane(N), rough = plane(N, 0.9);
  const wear = fbm(N, 3, 4, seed, { gain: 0.55 });
  const fine = fbm(N, 96, 2, seed + 1);
  const stonesPerTile = Math.round(tile / 0.013);
  const W = worley(N, stonesPerTile, seed + 2, { jitter: 1 });
  const W2 = worley(N, Math.round(tile / 0.03), seed + 3, { jitter: 1 });
  const oil = fbm(N, 3, 4, seed + 5);
  const dark = hex('#262627'), lightc = hex('#4b4a47');
  const stoneCols = [hex('#8d8a83'), hex('#6c6964'), hex('#4e4c49'), hex('#3a3938'), hex('#a39f97')];
  for (let i = 0; i < N * N; i++) {
    let c = mix3(dark, lightc, Math.pow(wear[i], 1.4) * (0.55 + light));
    const m1 = smoothstep(0.45, 0.28, W.f1[i]);
    const m2 = smoothstep(0.32, 0.2, W2.f1[i]) * (W2.id[i] < 0.35 ? 1 : 0);
    const sid = W.id[i];
    const sc = stoneCols[Math.floor(sid * stoneCols.length)];
    const exposed = 0.35 + 0.6 * wear[i];
    c = mix3(c, sc, m1 * exposed * (sid < 0.6 ? 0.9 : 0.35));
    c = mix3(c, stoneCols[Math.floor(W2.id[i] * 5) % 5], m2 * 0.8);
    const f = 0.92 + fine[i] * 0.16;
    c = [c[0] * f, c[1] * f, c[2] * f];
    const o = smoothstep(0.62, 0.82, oil[i]);
    c = mix3(c, hex('#141414'), o * 0.45);
    albedo.set(i, c);
    height[i] = m1 * 0.0018 * (0.5 + sid) + m2 * 0.0025 + fine[i] * 0.0004;
    rough[i] = 0.9 + (fine[i] - 0.5) * 0.08 - m1 * 0.08 - o * 0.3;
  }
  return { albedo, height, rough };
}

/** Thin crack network mask (0..1) from warped Worley cell edges. */
function cracks(N, cells, seed, widthPx, { warpPx = 30, density = 0.55, fineCells = 0 } = {}) {
  const W = worley(N, cells, seed, { jitter: 1 });
  const e = new Float32Array(N * N);
  for (let i = 0; i < e.length; i++) e[i] = W.f2[i] - W.f1[i];
  const dx = fbm(N, 6, 3, seed + 1), dy = fbm(N, 6, 3, seed + 2);
  const ew = warp(e, N, dx, dy, warpPx);
  const keep = fbm(N, 5, 3, seed + 3);
  const jag = fbm(N, 64, 2, seed + 4);
  const w = (widthPx * cells) / N;
  const out = new Float32Array(N * N);
  for (let i = 0; i < out.length; i++) {
    const ww = w * (0.6 + jag[i] * 0.9);
    out[i] = smoothstep(ww, ww * 0.25, ew[i]) * smoothstep(1 - density - 0.05, 1 - density + 0.1, keep[i]);
  }
  if (fineCells) {
    const f = cracks(N, fineCells, seed + 50, widthPx * 0.6, { warpPx: warpPx * 0.6, density: density * 0.6 });
    for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], f[i] * 0.8);
  }
  return out;
}

/** Vertical run-off streaks below a source mask (wraps vertically). */
function runoff(N, src, decay = 0.985, gain = 0.25) {
  const out = new Float32Array(N * N);
  for (let x = 0; x < N; x++) {
    let s = 0;
    for (let pass = 0; pass < 2; pass++) for (let y = 0; y < N; y++) {
      const i = y * N + x;
      s = s * decay + src[i] * gain;
      if (pass) out[i] = Math.min(1, s);
    }
  }
  return out;
}

function bricks(N, cols, rows, mortarPx, seed) {
  // running bond layout; returns per-pixel { inset (px to brick edge, <0 = mortar), id, col, row }
  const colP = N / cols, rowP = N / rows;
  const inset = new Float32Array(N * N), id = new Float32Array(N * N);
  const jag = fbm(N, 48, 3, seed + 9);
  for (let y = 0; y < N; y++) {
    const r = Math.floor(y / rowP), fy = y - r * rowP;
    for (let x = 0; x < N; x++) {
      const xo = x + (r % 2) * colP * 0.5;
      const c = Math.floor(xo / colP), fx = xo - c * colP;
      const dx = Math.min(fx, colP - fx), dy = Math.min(fy, rowP - fy);
      const i = y * N + x;
      inset[i] = Math.min(dx, dy) - mortarPx * 0.5 + (jag[i] - 0.5) * mortarPx * 0.9;
      id[i] = hash(((c % cols) + cols) % cols, r % rows, seed);
    }
  }
  return { inset, id };
}

// ---------------------------------------------------------------- generators

export const SETS = {
  asphalt: { tile: 3, N: 1024, gen(N, tile) {
    const s = asphaltBase(N, tile, 11, { light: 0.15 });
    return { ...s, normalStrength: 1.4 };
  } },

  asphalt_cracked: { tile: 4, N: 1024, gen(N, tile) {
    const s = asphaltBase(N, tile, 23, { light: 0.35 });
    const cr = cracks(N, 6, 77, 3.2, { warpPx: 60, density: 0.7, fineCells: 15 });
    const crW = blur(cr, N, 4, 2);
    const patch = fbm(N, 2, 3, 91);
    for (let i = 0; i < N * N; i++) {
      const p = smoothstep(0.7, 0.72, patch[i]);
      s.albedo.blend(i, hex('#1d1d1e'), p * 0.85);
      s.rough[i] = lerp(s.rough[i], 0.7, p);
      s.albedo.blend(i, hex('#5a5853'), crW[i] * 0.35 * (1 - p)); // lighter crumbled crack shoulders
      s.albedo.blend(i, hex('#0d0d0d'), cr[i] * 0.95 * (1 - p));
      s.height[i] += -cr[i] * 0.007 - crW[i] * 0.0015 + p * 0.0015;
    }
    return { ...s, normalStrength: 1.4 };
  } },

  concrete_wall: { tile: 3, N: 1024, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N, 0.9);
    const mottle = fbm(N, 3, 5, 31, { gain: 0.55 });
    const fine = fbm(N, 80, 3, 32);
    const streak = fbm(N, 28, 3, 33, { stretch: [1, 0.08] });
    const P = worley(N, 170, 34, { jitter: 1 });
    // form-tie holes on a 0.6 x 0.6 m grid, panel seam at the tile border
    const holes = plane(N), ppm = N / tile;
    const nh = Math.round(tile / 0.6);
    for (let j = 0; j < nh; j++) for (let k = 0; k < nh; k++) {
      const cx = ((k + 0.5) / nh) * N, cy = ((j + 0.5) / nh) * N, r = 0.014 * ppm;
      for (let y = Math.floor(cy - r * 2); y < cy + r * 2; y++) for (let x = Math.floor(cx - r * 2); x < cx + r * 2; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const i = ((y + N) % N) * N + ((x + N) % N);
        holes[i] = Math.max(holes[i], smoothstep(r * 1.2, r * 0.7, d));
      }
    }
    const holeRun = runoff(N, holes, 0.993, 0.08);
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      let c = mix3(hex('#7f7d77'), hex('#aaa8a0'), mottle[i]);
      const f = 0.94 + fine[i] * 0.12;
      c = [c[0] * f, c[1] * f, c[2] * f];
      const st = smoothstep(0.55, 0.9, streak[i]);
      c = mix3(c, hex('#4f4d48'), st * 0.3);
      c = mix3(c, hex('#6a5a48'), holeRun[i] * 0.4);
      const pore = smoothstep(0.11, 0.04, P.f1[i]) * (P.id[i] < 0.3 ? 1 : 0);
      c = mix3(c, hex('#3d3c39'), pore * 0.7 + holes[i] * 0.85);
      const seam = Math.max(smoothstep(2.5, 0.5, Math.min(x, N - x)), smoothstep(2.5, 0.5, Math.min(y, N - y)));
      c = mix3(c, hex('#4a4944'), seam * 0.6);
      albedo.set(i, c);
      height[i] = fine[i] * 0.0006 + mottle[i] * 0.0015 - pore * 0.0015 - holes[i] * 0.01 - seam * 0.002;
      rough[i] = 0.88 + fine[i] * 0.08 - st * 0.05;
    }
    return { albedo, height, rough, normalStrength: 1.2 };
  } },

  concrete_floor: { tile: 3, N: 1024, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N);
    const mottle = fbm(N, 4, 5, 41, { gain: 0.6 });
    const fine = fbm(N, 96, 2, 42);
    const stain = fbm(N, 3, 4, 43);
    const cr = cracks(N, 4, 44, 1.8, { warpPx: 70, density: 0.45 });
    const pits = worley(N, 120, 45, { jitter: 1 });
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      let c = mix3(hex('#6e6c66'), hex('#8f8c84'), mottle[i]);
      const f = 0.95 + fine[i] * 0.1;
      c = [c[0] * f, c[1] * f, c[2] * f];
      const s = smoothstep(0.6, 0.85, stain[i]);
      c = mix3(c, hex('#3f3b35'), s * 0.45);
      const pit = smoothstep(0.1, 0.03, pits.f1[i]) * (pits.id[i] < 0.25 ? 1 : 0);
      c = mix3(c, hex('#3c3a36'), pit * 0.6 + cr[i] * 0.8);
      const joint = Math.max(smoothstep(3, 1, Math.min(x, N - x)), smoothstep(3, 1, Math.min(y, N - y)));
      c = mix3(c, hex('#2e2d2a'), joint * 0.8);
      albedo.set(i, c);
      height[i] = fine[i] * 0.0004 - pit * 0.0015 - cr[i] * 0.003 - joint * 0.005;
      rough[i] = 0.82 + fine[i] * 0.1 - s * 0.2;
    }
    return { albedo, height, rough, normalStrength: 1.2 };
  } },

  brick_red: { tile: 1.35, N: 1024, gen(N, tile) {
    const ppm = N / tile, mortarPx = 0.011 * ppm;
    const B = bricks(N, 6, 18, mortarPx, 51);
    const albedo = new RGB(N), height = plane(N), rough = plane(N);
    const fine = fbm(N, 64, 3, 52), grime = fbm(N, 3, 4, 53), speck = worley(N, 220, 54, { jitter: 1 });
    const pal = ['#86402a', '#93482f', '#7a3524', '#a0583a', '#6a2c21', '#8e5038', '#5c3a30', '#9c4d33'].map(hex);
    for (let i = 0; i < N * N; i++) {
      const ins = B.inset[i], id = B.id[i];
      const isBrick = smoothstep(-0.5, 1.2, ins);
      let bc = pal[Math.floor(id * pal.length)];
      const v = 0.85 + hash(Math.floor(id * 9999), 3, 1) * 0.3;
      bc = [bc[0] * v, bc[1] * v, bc[2] * v];
      const f = 0.9 + fine[i] * 0.2;
      bc = [bc[0] * f, bc[1] * f, bc[2] * f];
      const sp = smoothstep(0.12, 0.05, speck.f1[i]);
      bc = mix3(bc, hex('#3a2219'), sp * 0.5);
      let mc = mix3(hex('#8e877b'), hex('#a39d90'), fine[i]);
      let c = mix3(mc, bc, isBrick);
      c = mix3(c, hex('#2f2a25'), smoothstep(0.55, 0.95, grime[i]) * 0.35);
      albedo.set(i, c);
      const edge = smoothstep(0, 3.5, ins);
      height[i] = isBrick * (0.006 * edge + fine[i] * 0.0008) + (1 - isBrick) * fine[i] * 0.0005;
      rough[i] = lerp(0.95, 0.82 + fine[i] * 0.1, isBrick);
    }
    return { albedo, height, rough, normalStrength: 1.1, aoDepth: 70 };
  } },

  brick_painted: { tile: 1.35, N: 1024, gen(N, tile) {
    const ppm = N / tile, mortarPx = 0.011 * ppm;
    const B = bricks(N, 6, 18, mortarPx, 61);
    const albedo = new RGB(N), height = plane(N), rough = plane(N);
    const fine = fbm(N, 64, 3, 62), peel = fbm(N, 5, 5, 63, { gain: 0.6 }), grime = fbm(N, 3, 4, 64);
    const dirtRun = fbm(N, 24, 3, 65, { stretch: [1, 0.1] });
    const paint = hex('#bdb8a8');
    for (let i = 0; i < N * N; i++) {
      const ins = B.inset[i], id = B.id[i];
      const isBrick = smoothstep(-0.5, 1.2, ins);
      const bc = mix3(hex('#7e3d2a'), hex('#9a5236'), id);
      const mc = hex('#8e877b');
      const under = mix3(mc, bc, isBrick);
      const p = smoothstep(0.66, 0.6, peel[i]); // 1 = painted
      let pc = mix3(paint, hex('#d2cec2'), fine[i]);
      pc = mix3(pc, hex('#6d665b'), smoothstep(0.5, 0.95, dirtRun[i]) * 0.35 + smoothstep(0.6, 0.95, grime[i]) * 0.25);
      pc = mix3(pc, mix3(pc, hex('#8c8678'), 0.5), (1 - isBrick) * 0.5);
      const c = mix3(under, pc, p);
      albedo.set(i, c);
      const edge = smoothstep(0, 3.5, ins);
      height[i] = isBrick * 0.005 * edge + p * 0.0004 + fine[i] * 0.0005;
      rough[i] = lerp(0.88, 0.62 + fine[i] * 0.12, p);
    }
    return { albedo, height, rough, normalStrength: 1.0, aoDepth: 60 };
  } },

  plaster: { tile: 2.5, N: 1024, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N);
    const mottle = fbm(N, 3, 5, 71, { gain: 0.55 }), fine = fbm(N, 140, 2, 72), bumps = fbm(N, 40, 3, 73);
    const stain = fbm(N, 4, 4, 74), spall = fbm(N, 4, 5, 75, { gain: 0.6 });
    const run = fbm(N, 30, 3, 76, { stretch: [1, 0.09] });
    const cr = cracks(N, 4, 77, 1.6, { warpPx: 50, density: 0.4 });
    for (let i = 0; i < N * N; i++) {
      let c = mix3(hex('#a99d86'), hex('#c4b9a3'), mottle[i]);
      const f = 0.95 + fine[i] * 0.1;
      c = [c[0] * f, c[1] * f, c[2] * f];
      c = mix3(c, hex('#6f6656'), smoothstep(0.58, 0.9, stain[i]) * 0.4 + smoothstep(0.6, 0.95, run[i]) * 0.25);
      const sp = smoothstep(0.74, 0.76, spall[i]);
      c = mix3(c, hex('#7c786f'), sp);
      c = mix3(c, hex('#4b453c'), cr[i] * 0.7);
      albedo.set(i, c);
      height[i] = bumps[i] * 0.0012 + fine[i] * 0.0006 - sp * 0.006 - cr[i] * 0.002;
      rough[i] = 0.9 + fine[i] * 0.06 - sp * 0.04;
    }
    return { albedo, height, rough, normalStrength: 1.0 };
  } },

  roof_tiles: { tile: 2, N: 1024, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N);
    const rows = 8, cols = 10, rowP = N / rows, colP = N / cols;
    const fine = fbm(N, 64, 3, 81), moss = fbm(N, 6, 4, 82), dirt = fbm(N, 3, 3, 83);
    for (let y = 0; y < N; y++) {
      const r = Math.floor(y / rowP);
      const t = (y - r * rowP) / rowP; // 0 at the top (upslope) .. 1 at the lower lip of this row
      for (let x = 0; x < N; x++) {
        const xo = x + (r % 2) * colP * 0.5;
        const c = Math.floor(xo / colP), u = (xo - c * colP) / colP;
        const i = y * N + x;
        const id = hash(((c % cols) + cols) % cols, r, 84);
        const prof = Math.pow(Math.sin(Math.PI * u), 0.6);
        const gap = smoothstep(0.03, 0.0, Math.min(u, 1 - u));
        height[i] = 0.014 * prof + 0.018 * t - gap * 0.01 + fine[i] * 0.0005;
        let col = mix3(hex('#8a4029'), hex('#ad6040'), id);
        if (id > 0.85) col = mix3(col, hex('#5d2c1f'), 0.6);
        const f = 0.9 + fine[i] * 0.2;
        col = [col[0] * f, col[1] * f, col[2] * f];
        const shade = smoothstep(0.35, 0.0, t); // shadowed band just below the row above
        col = mix3(col, hex('#3a3326'), shade * 0.5 * (0.5 + moss[i]));
        col = mix3(col, hex('#4c5230'), smoothstep(0.6, 0.85, moss[i]) * (0.3 + shade * 0.5));
        col = mix3(col, hex('#3b342c'), smoothstep(0.55, 0.9, dirt[i]) * 0.3 + gap * 0.6);
        albedo.set(i, col);
        rough[i] = 0.78 + fine[i] * 0.1;
      }
    }
    return { albedo, height, rough, normalStrength: 1.0, aoDepth: 50 };
  } },

  corrugated: { tile: 2, N: 1024, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N), metal = plane(N);
    const ridges = 26;
    const rust = fbm(N, 4, 5, 91, { gain: 0.6 }), fine = fbm(N, 80, 2, 92);
    const streak = fbm(N, 20, 3, 93, { stretch: [1, 0.07] });
    const span = worley(N, 50, 94, { jitter: 1 });
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      const ph = (x / N) * ridges * Math.PI * 2;
      height[i] = 0.009 * (0.5 + 0.5 * Math.cos(ph)) + fine[i] * 0.0003;
      const r = smoothstep(0.55, 0.75, rust[i] * 0.75 + streak[i] * 0.35);
      let c = mix3(hex('#7d8281'), hex('#9da19f'), span.id[i] * 0.6 + fine[i] * 0.4);
      const rc = mix3(hex('#5b2f1a'), hex('#8e4c25'), fine[i]);
      c = mix3(c, rc, r);
      c = mix3(c, hex('#4a3a2e'), smoothstep(0.6, 0.9, streak[i]) * 0.3);
      // screw line near the top edge
      const sy = Math.abs(y - N * 0.04), sx = Math.abs(((x / N) * ridges * 0.5) % 1 - 0.5) * (N / ridges) * 2;
      const screw = smoothstep(5, 3, Math.hypot(sx, sy));
      c = mix3(c, hex('#3c3a37'), screw * 0.8);
      albedo.set(i, c);
      height[i] += screw * 0.002;
      metal[i] = lerp(0.75, 0.0, r);
      rough[i] = lerp(0.42 + fine[i] * 0.12, 0.88, r);
    }
    return { albedo, height, rough, metal, normalStrength: 1.0, aoDepth: 25 };
  } },

  metal_painted: { tile: 2, N: 1024, gen(N, tile) {
    // neutral light paint (tinted per object with vertex colours), chips, scratches, rust run-off
    const albedo = new RGB(N), height = plane(N), rough = plane(N), metal = plane(N);
    const mottle = fbm(N, 4, 4, 101), fine = fbm(N, 100, 2, 102), dent = fbm(N, 5, 3, 103);
    const chipN = fbm(N, 10, 5, 104, { gain: 0.65 });
    const W = worley(N, 28, 105, { jitter: 1 });
    const chip = plane(N);
    for (let i = 0; i < N * N; i++) {
      const edge = (W.f2[i] - W.f1[i]);
      chip[i] = smoothstep(0.7, 0.74, chipN[i] + (1 - Math.min(1, edge * 4)) * 0.12);
    }
    const scratch = plane(N);
    const rnd = mulberry(106);
    for (let k = 0; k < 260; k++) {
      let x = rnd() * N, y = rnd() * N;
      const a = (rnd() - 0.5) * 0.6 + (rnd() < 0.3 ? Math.PI / 2 : 0), len = 20 + rnd() * 120;
      for (let s = 0; s < len; s++) {
        x += Math.cos(a); y += Math.sin(a);
        const i = ((Math.floor(y) % N + N) % N) * N + ((Math.floor(x) % N + N) % N);
        scratch[i] = Math.max(scratch[i], 0.5 + rnd() * 0.5);
      }
    }
    const rustRun = runoff(N, chip, 0.985, 0.05);
    for (let i = 0; i < N * N; i++) {
      let c = mix3(hex('#b3b2ac'), hex('#c4c3bd'), mottle[i]);
      c = mix3(c, hex('#6e4a33'), rustRun[i] * 0.55);
      const rc = mix3(hex('#4f2a17'), hex('#86461f'), fine[i]);
      c = mix3(c, rc, chip[i]);
      c = mix3(c, hex('#77736c'), scratch[i] * (1 - chip[i]) * 0.8);
      albedo.set(i, c);
      height[i] = dent[i] * 0.002 + fine[i] * 0.0002 - chip[i] * 0.0005 - scratch[i] * 0.0002;
      metal[i] = scratch[i] * (1 - chip[i]) * 0.8;
      rough[i] = 0.52 + mottle[i] * 0.1 + rustRun[i] * 0.2 + chip[i] * 0.35 - scratch[i] * 0.15;
    }
    return { albedo, height, rough, metal, normalStrength: 1.0 };
  } },

  metal_rusty: { tile: 3, N: 1024, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N), metal = plane(N);
    const rust = fbm(N, 5, 6, 111, { gain: 0.6 }), fine = fbm(N, 120, 2, 112), flake = fbm(N, 30, 3, 113);
    const streak = fbm(N, 22, 3, 114, { stretch: [1, 0.08] });
    for (let i = 0; i < N * N; i++) {
      const paint = smoothstep(0.52, 0.48, rust[i] + (streak[i] - 0.5) * 0.3);
      const rc = mix3(mix3(hex('#4a2614'), hex('#7c3f1c'), fine[i]), hex('#9b5a2a'), smoothstep(0.6, 0.9, flake[i]) * 0.5);
      let pc = mix3(hex('#3e4a47'), hex('#55605b'), fine[i]);
      pc = mix3(pc, hex('#5a3a28'), smoothstep(0.5, 0.9, streak[i]) * 0.5);
      albedo.set(i, mix3(rc, pc, paint));
      height[i] = (1 - paint) * (flake[i] * 0.0015 + fine[i] * 0.0005) + paint * 0.0008;
      rough[i] = lerp(0.9, 0.6, paint);
      metal[i] = 0;
    }
    return { albedo, height, rough, metal, normalStrength: 1.3 };
  } },

  wood_planks: { tile: 2.4, N: 1024, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N);
    const planks = 16, pP = N / planks;
    const grain = fbm(N, 6, 4, 121, { stretch: [0.15, 6] });
    const grainF = perlin(N, 6, 122, [0.5, 40]);
    const weather = fbm(N, 4, 4, 123), fine = fbm(N, 90, 2, 124);
    for (let y = 0; y < N; y++) {
      const p = Math.floor(y / pP), fy = (y - p * pP) / pP;
      const nJ = 1 + Math.floor(hash(p, 0, 125) * 2);
      const off = hash(p, 1, 125);
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const u = ((x / N) * nJ + off) % 1;
        const seg = Math.floor(((x / N) * nJ + off));
        const id = hash(p, seg, 126);
        const endD = Math.min(u, 1 - u) * (N / nJ);
        const gap = Math.max(smoothstep(2.6, 0.8, Math.min(fy, 1 - fy) * pP), smoothstep(2.0, 0.6, endD));
        const rings = 0.5 + 0.5 * Math.sin((grain[i] * 18 + id * 10) * Math.PI + grainF[i] * 2);
        let c = mix3(hex('#6b5a47'), hex('#8a7a66'), rings * 0.6 + fine[i] * 0.4);
        c = mix3(c, mix3(hex('#4d3826'), hex('#7d5c3c'), id), 0.45 * (1 - weather[i]));
        c = mix3(c, hex('#8d887f'), smoothstep(0.4, 0.8, weather[i]) * 0.45);
        const nail = Math.min(
          Math.hypot(endD - 10, (fy - 0.3) * pP), Math.hypot(endD - 10, (fy - 0.7) * pP));
        const nm = smoothstep(3.2, 2.0, nail);
        c = mix3(c, hex('#2a2420'), nm * 0.85);
        c = mix3(c, hex('#1d1814'), gap * 0.9);
        albedo.set(i, c);
        height[i] = -gap * 0.005 + rings * 0.0006 + fine[i] * 0.0004 - nm * 0.0005;
        rough[i] = 0.82 + fine[i] * 0.1;
      }
    }
    return { albedo, height, rough, normalStrength: 1.2 };
  } },

  tiles: { tile: 1.2, N: 1024, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N);
    const n = 4, tp = N / n, grout = (0.004 * N) / tile;
    const fine = fbm(N, 64, 2, 131), dirt = fbm(N, 4, 4, 132);
    const cr = cracks(N, 6, 133, 1.2, { warpPx: 25, density: 0.3 });
    const gm = plane(N);
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      const fx = x % tp, fy = y % tp;
      const d = Math.min(fx, tp - fx, fy, tp - fy);
      gm[i] = smoothstep(grout * 0.5 + 1, grout * 0.5 - 0.5, d);
    }
    const gb = blur(gm, N, 6, 2);
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      const id = hash(Math.floor(x / tp), Math.floor(y / tp), 134);
      let c = mix3(hex('#c9c3b4'), hex('#d8d3c6'), id);
      c = mix3(c, hex('#a59f90'), fine[i] * 0.2);
      c = mix3(c, hex('#5f574b'), smoothstep(0.55, 0.9, dirt[i]) * 0.35 + gb[i] * 0.25);
      c = mix3(c, hex('#6a655b'), gm[i]);
      c = mix3(c, hex('#4a453d'), cr[i] * (1 - gm[i]) * 0.8);
      albedo.set(i, c);
      height[i] = -gm[i] * 0.002 - cr[i] * 0.0006 + fine[i] * 0.0002;
      rough[i] = lerp(0.22 + dirt[i] * 0.3, 0.92, gm[i]);
    }
    return { albedo, height, rough, normalStrength: 1.0 };
  } },

  gravel: { tile: 2, N: 1024, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N);
    const A = worley(N, 64, 141, { jitter: 1 }), B = worley(N, 150, 142, { jitter: 1 });
    const dirt = fbm(N, 6, 4, 143), fine = fbm(N, 120, 2, 144);
    const pal = ['#8b857c', '#6f6a62', '#9a9184', '#5d5953', '#a39a8c', '#7a6e60'].map(hex);
    for (let i = 0; i < N * N; i++) {
      const a = smoothstep(0.5, 0.25, A.f1[i]), b = smoothstep(0.42, 0.2, B.f1[i]);
      let c = mix3(hex('#4f463c'), hex('#62584b'), dirt[i]);
      c = mix3(c, pal[Math.floor(B.id[i] * 6)], b * 0.85);
      const ca = pal[Math.floor(A.id[i] * 6)];
      c = mix3(c, ca, a * 0.9);
      const f = 0.9 + fine[i] * 0.2;
      albedo.set(i, [c[0] * f, c[1] * f, c[2] * f]);
      height[i] = Math.max(a * 0.012 * (1 - A.f1[i]), b * 0.006 * (1 - B.f1[i])) + fine[i] * 0.0005;
      rough[i] = 0.88 + fine[i] * 0.08;
    }
    return { albedo, height, rough, normalStrength: 0.9, aoDepth: 40 };
  } },

  dirt: { tile: 3, N: 1024, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N);
    const base = fbm(N, 4, 6, 151, { gain: 0.55 }), fine = fbm(N, 110, 2, 152);
    const S = worley(N, 110, 153, { jitter: 1 });
    const cr = cracks(N, 14, 154, 1.6, { warpPx: 18, density: 0.35 });
    const wet = fbm(N, 3, 3, 155);
    for (let i = 0; i < N * N; i++) {
      let c = mix3(hex('#4b3d30'), hex('#76644f'), base[i]);
      const st = smoothstep(0.3, 0.15, S.f1[i]) * (S.id[i] < 0.18 ? 1 : 0);
      c = mix3(c, hex('#857c70'), st * 0.8);
      c = mix3(c, hex('#2c241c'), cr[i] * 0.6 + smoothstep(0.65, 0.9, wet[i]) * 0.3);
      const f = 0.92 + fine[i] * 0.16;
      albedo.set(i, [c[0] * f, c[1] * f, c[2] * f]);
      height[i] = base[i] * 0.006 + st * 0.004 - cr[i] * 0.002 + fine[i] * 0.0006;
      rough[i] = 0.93 - smoothstep(0.65, 0.9, wet[i]) * 0.25;
    }
    return { albedo, height, rough, normalStrength: 1.0 };
  } },

  sand: { tile: 3, N: 1024, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N);
    const base = fbm(N, 3, 5, 161), fine = fbm(N, 200, 2, 162), wx = fbm(N, 4, 3, 163);
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      const rip = 0.5 + 0.5 * Math.sin(((y / N) * 18 + (wx[i] - 0.5) * 2.2) * Math.PI * 2);
      let c = mix3(hex('#a8977a'), hex('#c3b393'), base[i] * 0.7 + rip * 0.3);
      const f = 0.93 + fine[i] * 0.14;
      albedo.set(i, [c[0] * f, c[1] * f, c[2] * f]);
      height[i] = rip * 0.003 + base[i] * 0.004 + fine[i] * 0.0004;
      rough[i] = 0.95;
    }
    return { albedo, height, rough, normalStrength: 0.8 };
  } },

  grass: { tile: 2, N: 1024, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N, 0.95);
    const cover = fbm(N, 5, 5, 171), dry = fbm(N, 7, 4, 172);
    const blades = fbm(N, 180, 2, 173), clump = worley(N, 90, 174, { jitter: 1 });
    for (let i = 0; i < N * N; i++) {
      const g = smoothstep(0.25, 0.55, cover[i]);
      let c = mix3(hex('#45392b'), hex('#5a4a38'), blades[i]);
      let gc = mix3(hex('#3c4a24'), hex('#5f6e33'), blades[i]);
      gc = mix3(gc, hex('#8b8547'), smoothstep(0.5, 0.85, dry[i]) * 0.7);
      gc = mix3(gc, hex('#2a3418'), smoothstep(0.3, 0.6, clump.f1[i]) * 0.4);
      c = mix3(c, gc, g * (0.6 + blades[i] * 0.4));
      albedo.set(i, c);
      height[i] = g * blades[i] * 0.006 + (1 - clump.f1[i]) * 0.003 * g;
    }
    return { albedo, height, rough, normalStrength: 1.0 };
  } },

  chainlink: { tile: 0.8, N: 512, alpha: true, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N, 0.5), metal = plane(N, 0.8), alpha = plane(N);
    const p = N / 16, hw = 1.7;
    const rust = fbm(N, 6, 4, 181);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const a = ((x + y) % p + p) % p, b = ((x - y) % p + p) % p;
      const da = Math.min(a, p - a), db = Math.min(b, p - b);
      const d = Math.min(da, db);
      const w = smoothstep(hw + 0.8, hw - 0.4, d);
      alpha[i] = w;
      height[i] = Math.sqrt(Math.max(0, 1 - (d / (hw + 0.5)) ** 2)) * 0.0015;
      const r = smoothstep(0.6, 0.8, rust[i]);
      albedo.set(i, mix3(hex('#8e9291'), hex('#6b3e22'), r));
      rough[i] = lerp(0.45, 0.85, r);
      metal[i] = lerp(0.85, 0.1, r);
    }
    return { albedo, height, rough, metal, alpha, normalStrength: 1.0, noAO: true };
  } },

  tread_plate: { tile: 0.6, N: 512, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N), metal = plane(N, 0.9);
    const cells = 20, cp = N / cells;
    const dirt = fbm(N, 4, 4, 191), fine = fbm(N, 80, 2, 192);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const ci = Math.floor(x / cp), cj = Math.floor(y / cp);
      const lx = (x - ci * cp) / cp - 0.5, ly = (y - cj * cp) / cp - 0.5;
      const s = (ci + cj) % 2 ? 1 : -1;
      const ax = (lx + s * ly) * Math.SQRT1_2, ay = (-s * lx + ly) * Math.SQRT1_2;
      const len = 0.36, wid = 0.075;
      const dx = Math.max(0, Math.abs(ax) - len), d = Math.hypot(dx, ay) / wid;
      const bar = smoothstep(1.2, 0.6, d);
      height[i] = bar * 0.0016 * Math.sqrt(Math.max(0, 1 - d * d * 0.5)) + fine[i] * 0.0001;
      let c = mix3(hex('#6d7073'), hex('#8c8f92'), fine[i]);
      c = mix3(c, hex('#a6a8aa'), bar * 0.4);
      c = mix3(c, hex('#3d362e'), smoothstep(0.5, 0.85, dirt[i]) * (1 - bar) * 0.6);
      albedo.set(i, c);
      rough[i] = lerp(0.6, 0.35, bar) + dirt[i] * 0.1;
    }
    return { albedo, height, rough, metal, normalStrength: 1.0 };
  } },

  grate: { tile: 1, N: 512, alpha: true, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N, 0.6), metal = plane(N, 0.7), alpha = plane(N);
    const bearing = N / 33, cross = N / 10, bw = 0.006 * N / tile, cw = 0.008 * N / tile;
    const rust = fbm(N, 5, 4, 201);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const dx = Math.min(x % bearing, bearing - (x % bearing)), dy = Math.min(y % cross, cross - (y % cross));
      const b = smoothstep(bw * 0.5 + 0.7, bw * 0.5 - 0.3, dx), c = smoothstep(cw * 0.5 + 0.7, cw * 0.5 - 0.3, dy);
      const m = Math.max(b, c);
      alpha[i] = m;
      height[i] = m * 0.002;
      const r = smoothstep(0.55, 0.8, rust[i]);
      albedo.set(i, mix3(hex('#5f6264'), hex('#6a3a1f'), r));
      rough[i] = lerp(0.55, 0.9, r); metal[i] = lerp(0.8, 0.1, r);
    }
    return { albedo, height, rough, metal, alpha, normalStrength: 1.0, noAO: true };
  } },

  canvas: { tile: 1, N: 512, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N, 0.95);
    const stain = fbm(N, 4, 4, 211), fine = fbm(N, 64, 2, 212);
    const th = 4;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const cx = Math.floor(x / th), cy = Math.floor(y / th);
      const over = (cx + cy) % 2;
      const u = (x % th) / th, v = (y % th) / th;
      const hW = Math.sin(Math.PI * v), hF = Math.sin(Math.PI * u);
      height[i] = (over ? hW : hF) * 0.0006 + fine[i] * 0.0002;
      let c = mix3(hex('#9e9274'), hex('#b2a684'), (over ? hW : hF) * 0.5 + fine[i] * 0.5);
      c = mix3(c, hex('#5b5240'), smoothstep(0.55, 0.9, stain[i]) * 0.45);
      albedo.set(i, c);
    }
    return { albedo, height, rough, normalStrength: 1.0, noAO: true };
  } },

  road_paint: { tile: 2, N: 512, alpha: true, gen(N, tile) {
    const albedo = new RGB(N), height = plane(N), rough = plane(N, 0.65), alpha = plane(N);
    const wear = fbm(N, 6, 5, 221, { gain: 0.6 }), chips = worley(N, 60, 222, { jitter: 1 }), fine = fbm(N, 90, 2, 223);
    for (let i = 0; i < N * N; i++) {
      const w = wear[i] + (chips.id[i] < 0.25 ? smoothstep(0.45, 0.2, chips.f1[i]) * 0.3 : 0);
      alpha[i] = smoothstep(0.66, 0.6, w);
      albedo.set(i, mix3(hex('#d9d6cc'), hex('#a39f94'), fine[i] * 0.5 + smoothstep(0.4, 0.66, w) * 0.5));
      height[i] = alpha[i] * 0.0004;
    }
    return { albedo, height, rough, alpha, normalStrength: 0.6, noAO: true };
  } },

  water: { tile: 8, N: 512, gen(N, tile) {
    const albedo = new RGB(N, hex('#0c1a1e')), height = plane(N), rough = plane(N, 0.06);
    const rnd = mulberry(231);
    const waves = [];
    for (let k = 0; k < 14; k++) {
      const kx = Math.round((rnd() - 0.5) * 24), ky = Math.round((rnd() - 0.5) * 24) || 1;
      waves.push([kx, ky, rnd() * Math.PI * 2, 1 / Math.hypot(kx, ky)]);
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let h = 0;
      for (const [kx, ky, ph, a] of waves) h += Math.sin(((kx * x + ky * y) / N) * Math.PI * 2 + ph) * a;
      height[y * N + x] = h * 0.03;
    }
    return { albedo, height, rough, normalStrength: 1.0, noAO: true };
  } },
};

// Tintable clean painted metal (vehicles, signs, truck boxes, frames): light neutral paint, soft mottling,
// fine scratches, a few small chips (primer / rust) and faint grime. Tinted per object with vertex colours.
SETS.paint_metal = { tile: 2, N: 1024, gen(N) {
  const albedo = new RGB(N), height = plane(N), rough = plane(N), metal = plane(N);
  const mottle = fbm(N, 3, 4, 301), fine = fbm(N, 120, 2, 302), grime = fbm(N, 6, 4, 303), dent = fbm(N, 4, 3, 304);
  const chipN = fbm(N, 14, 4, 305, { gain: 0.6 });
  const scratch = plane(N);
  const rnd = mulberry(306);
  for (let k = 0; k < 140; k++) {
    let x = rnd() * N, y = rnd() * N;
    const a = (rnd() - 0.5) * 0.5 + (rnd() < 0.5 ? 0 : Math.PI / 2), len = 15 + rnd() * 90;
    for (let s = 0; s < len; s++) {
      x += Math.cos(a); y += Math.sin(a);
      const i = ((Math.floor(y) % N + N) % N) * N + ((Math.floor(x) % N + N) % N);
      scratch[i] = Math.max(scratch[i], 0.4 + rnd() * 0.6);
    }
  }
  for (let i = 0; i < N * N; i++) {
    const chip = smoothstep(0.78, 0.8, chipN[i]);
    const g = smoothstep(0.55, 0.85, grime[i]);
    let c = mix3(hex('#c9c8c2'), hex('#d8d7d1'), mottle[i] * 0.7 + fine[i] * 0.3);
    c = mix3(c, hex('#8d887d'), g * 0.35);
    c = mix3(c, hex('#e4e3de'), scratch[i] * (1 - chip) * 0.5);
    c = mix3(c, mix3(hex('#5a5149'), hex('#7a4528'), fine[i]), chip);
    albedo.set(i, c);
    height[i] = dent[i] * 0.0012 + fine[i] * 0.00015 - chip * 0.0004 - scratch[i] * 0.00012;
    rough[i] = 0.42 + g * 0.3 + chip * 0.35 + scratch[i] * 0.08 + fine[i] * 0.05;
    metal[i] = chip * 0.3;
  }
  return { albedo, height, rough, metal, normalStrength: 0.8 };
} };

// ---------------------------------------------------------------- decals (one blob per texture, UV 0..1, alpha)
// Placed with kit.decal(): oil / water stains, puddles (glossy), crack networks, dirt / grime patches.
function blobMask(N, seed, { edge = 0.35, wobble = 0.55, aspect = 1 } = {}) {
  const n1 = fbm(N, 3, 5, seed, { gain: 0.55 }), n2 = fbm(N, 12, 3, seed + 1);
  const m = plane(N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const dx = (x + 0.5) / N - 0.5, dy = ((y + 0.5) / N - 0.5) * aspect;
    const r = Math.hypot(dx, dy) * 2 + (n1[i] - 0.5) * wobble + (n2[i] - 0.5) * 0.12;
    m[i] = smoothstep(1.0, 1.0 - edge, r) * smoothstep(0.5, 0.42, Math.max(Math.abs(dx), Math.abs(dy))); // fade at the quad border
  }
  return m;
}
SETS.decal_stain = { tile: 2, N: 512, alpha: true, gen(N) {
  const albedo = new RGB(N), height = plane(N), rough = plane(N), alpha = plane(N);
  const m = blobMask(N, 901, { edge: 0.6, wobble: 0.7 }), tone = fbm(N, 20, 3, 903), rings = fbm(N, 6, 3, 904);
  for (let i = 0; i < N * N; i++) {
    const core = smoothstep(0.2, 0.9, m[i]);
    alpha[i] = clamp01(m[i] * (0.25 + 0.35 * tone[i]) + smoothstep(0.45, 0.5, rings[i]) * m[i] * 0.12);
    albedo.set(i, mix3(hex('#4a4338'), hex('#24211c'), core * 0.7 + tone[i] * 0.3));
    rough[i] = lerp(0.85, 0.45, core);
  }
  return { albedo, height, rough, alpha, normalStrength: 0.3, noAO: true };
} };
SETS.decal_puddle = { tile: 2, N: 512, alpha: true, gen(N) {
  const albedo = new RGB(N), height = plane(N), rough = plane(N), alpha = plane(N);
  const m = blobMask(N, 911, { edge: 0.18, wobble: 0.9, aspect: 1.3 }), grit = fbm(N, 40, 3, 913);
  for (let i = 0; i < N * N; i++) {
    const wet = smoothstep(0.0, 0.35, m[i]), deep = smoothstep(0.35, 0.9, m[i]);
    alpha[i] = clamp01(wet * 0.9);
    albedo.set(i, mix3(hex('#34312b'), hex('#1c1d1e'), deep));
    rough[i] = lerp(0.35, 0.03, deep) + grit[i] * 0.04 * (1 - deep);
    height[i] = -deep * 0.0005;
  }
  return { albedo, height, rough, alpha, normalStrength: 0.4, noAO: true };
} };
SETS.decal_cracks = { tile: 2, N: 1024, alpha: true, gen(N) {
  const albedo = new RGB(N), height = plane(N), rough = plane(N, 0.9), alpha = plane(N);
  const c = cracks(N, 5, 921, 2.6, { warpPx: 40, density: 0.75, fineCells: 11 });
  const m = blobMask(N, 922, { edge: 0.5, wobble: 0.6 });
  for (let i = 0; i < N * N; i++) {
    alpha[i] = clamp01(c[i] * m[i] * 1.2);
    albedo.set(i, hex('#141311'));
    height[i] = -c[i] * 0.002;
  }
  return { albedo, height, rough, alpha, normalStrength: 1.2, noAO: true };
} };
SETS.decal_streak = { tile: 2, N: 512, alpha: true, gen(N) {
  // two variants side by side (u 0..0.5, 0.5..1): vertical soot / rain streaks, strongest at the top (v = 1 = row 0)
  const albedo = new RGB(N), height = plane(N), rough = plane(N, 0.9), alpha = plane(N);
  const cols = fbm(N, 24, 3, 941), wob = fbm(N, 6, 3, 942), fine = fbm(N, 80, 2, 943);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const v = 1 - y / N; // 1 at the top row
    const lx = (x % (N / 2)) / (N / 2);
    const edge = smoothstep(0, 0.12, lx) * smoothstep(1, 0.88, lx);
    const k = (y * N + Math.floor((x + (wob[i] - 0.5) * 18 + N) % N));
    const streak = smoothstep(0.45, 0.75, cols[k % (N * N)]);
    const fade = Math.pow(v, 1.6) * (0.6 + 0.4 * fine[i]);
    alpha[i] = clamp01((0.25 + streak * 0.75) * fade * edge * 0.85);
    albedo.set(i, mix3(hex('#3d362d'), hex('#1d1a16'), streak));
  }
  return { albedo, height, rough, alpha, normalStrength: 0.2, noAO: true };
} };
SETS.decal_dirt = { tile: 2, N: 512, alpha: true, gen(N) {
  const albedo = new RGB(N), height = plane(N), rough = plane(N, 0.95), alpha = plane(N);
  const m = blobMask(N, 931, { edge: 0.7, wobble: 0.8 }), speck = fbm(N, 60, 2, 932), tone = fbm(N, 8, 3, 933);
  for (let i = 0; i < N * N; i++) {
    alpha[i] = clamp01(m[i] * (0.35 + 0.65 * smoothstep(0.3, 0.7, tone[i])) * (0.75 + 0.25 * speck[i]));
    albedo.set(i, mix3(hex('#5a4b38'), hex('#3b3226'), speck[i]));
    height[i] = speck[i] * 0.0008 * m[i];
  }
  return { albedo, height, rough, alpha, normalStrength: 0.8, noAO: true };
} };

// ---------------------------------------------------------------- output

export const GENERATOR_VERSION = 3;

/** Generates set `id` and writes its files into outDir. Returns the manifest entry. */
export function writeSet(id, outDir, { N: forceN } = {}) {
  const def = SETS[id];
  if (!def) throw new Error('unknown texture set ' + id);
  const N = forceN || def.N;
  const t0 = Date.now();
  const r = def.gen(N, def.tile);
  const texel = def.tile / N;
  // AO: cavity from height (+ optional explicit ao)
  const ao = r.noAO ? plane(N, 1) : cavityAO(r.height, N, Math.max(2, N / 128), r.aoDepth ?? 60);
  if (r.ao) for (let i = 0; i < ao.length; i++) ao[i] *= r.ao[i];
  const nor = heightToNormal(r.height, N, texel, r.normalStrength ?? 1);
  const arm = new Uint8Array(N * N * 3);
  for (let i = 0; i < N * N; i++) {
    arm[i * 3] = Math.round(clamp01(ao[i]) * 255);
    arm[i * 3 + 1] = Math.round(clamp01(r.rough[i]) * 255);
    arm[i * 3 + 2] = Math.round(clamp01(r.metal ? r.metal[i] : 0) * 255);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const files = {};
  if (r.alpha) {
    const png = new PNG({ width: N, height: N, colorType: 6 });
    png.data = Buffer.from(r.albedo.bytes(r.alpha));
    files.diff = `${id}_diff.png`;
    fs.writeFileSync(path.join(outDir, files.diff), PNG.sync.write(png));
  } else {
    files.diff = `${id}_diff.jpg`;
    fs.writeFileSync(path.join(outDir, files.diff), encodeJPEG({ width: N, height: N, data: r.albedo.bytes(), channels: 3 }, { quality: 86, subsample: true }));
  }
  files.nor = `${id}_nor.jpg`;
  fs.writeFileSync(path.join(outDir, files.nor), encodeJPEG({ width: N, height: N, data: nor, channels: 3 }, { quality: 90, subsample: false }));
  files.arm = `${id}_arm.jpg`;
  fs.writeFileSync(path.join(outDir, files.arm), encodeJPEG({ width: N, height: N, data: arm, channels: 3 }, { quality: 88, subsample: false }));
  return {
    id, source: 'procedural', license: 'CC0 (original, generated by tools/map/lib/proctex.mjs)', version: GENERATOR_VERSION,
    res: N, tile: def.tile, alpha: !!r.alpha, maps: files, ms: Date.now() - t0,
  };
}

/** Linear-ish average albedo of a set (for the lightmap baker / fallbacks). */
export function averageAlbedo(id) {
  const def = SETS[id];
  const r = def.gen(64, def.tile);
  const s = [0, 0, 0];
  for (let i = 0; i < 64 * 64; i++) { const c = r.albedo.get(i); s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; }
  return s.map((v) => v / (64 * 64));
}

export { sample };
