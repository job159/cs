// SIGIL magic circles + PILLAR light columns + RING (PREMIUM_WEAPONS §1.7.3 beats ② and ③, 05b §8.9).
//
// Atlas: ORIGINAL designs drawn procedurally with Canvas 2D at load (nothing traced or copied): cloud scrolls,
// seal script (pseudo-glyphs generated from stroke grammar, not real characters), weather isobars,
// mountains-and-sea, eight-direction array, paper-cut 年, censer clouds, water vortex, thunder meander,
// flame clouds, wind, square seal court. Each design is a white mask stored in ONE channel of a 1024² RGBA
// texture (4 designs per texture, built lazily per group: 4 MB each, 512² on low quality). Every design is
// laid out in three concentric bands (inner r < .355, middle .375–.625, outer > .645, gaps between) so the
// shader can spin the bands independently (05b: inner +35°/s, outer −20°/s) from a single texture fetch,
// and a mip-biased second fetch gives the soft glow halo for free.
//   const s = fx.sigils.sigil(pos, { design: 'clouds', radius: 8, color: [3, 1.6, 0.5], color1: [4, 0.6, 0.2], life: 2.6 })
//   fx.sigils.pillar(pos, { radius: 1.2, height: 14, color: [4, 2.2, 0.8], life: 0.8 })
//   fx.sigils.ring(pos, { r1: 6, color: [3, 2, 1] })                      // = fx.shockwave flat on the ground
import * as THREE from 'three';
import { rng, hdr, easeOutBack, GLSL_NOISE } from './kitutil.js';
import { FRAME } from './atlas.js';

// ------------------------------------------------------------------ design table
// group / channel, band speeds (deg/s, inner middle outer), default colours
export const SIGIL = {
  clouds:      { g: 0, ch: 0, spin: [35, -8, -20] },
  seal:        { g: 0, ch: 1, spin: [0, 14, -20] },
  bagua:       { g: 0, ch: 2, spin: [30, -12, -16] },
  censer:      { g: 0, ch: 3, spin: [0, 18, -20] },
  isobar:      { g: 1, ch: 0, spin: [-60, 10, -14] },
  mountainSea: { g: 1, ch: 1, spin: [20, -10, 16] },
  nian:        { g: 1, ch: 2, spin: [0, -14, 20], gain: 0.45 },   // filled paper-cut: much more lit area
  vortex:      { g: 1, ch: 3, spin: [-90, -45, -25] },
  thunder:     { g: 2, ch: 0, spin: [40, -16, 22] },
  flame:       { g: 2, ch: 1, spin: [35, -12, -24] },
  wind:        { g: 2, ch: 2, spin: [80, 30, -18] },
  square:      { g: 2, ch: 3, spin: [0, 0, 0] },
  starmap:     { g: 3, ch: 0, spin: [14, -9, 5] },                // 星圖: 28 mansion ring + constellation glyphs + 北斗 (X02 天劍)
  leiwen:      { g: 3, ch: 1, spin: [0, 12, -16] },               // 雲雷紋戰陣: thunder spirals, eyes + axe blades, 亞-framed dancer (X05 猛志)
  lotus:       { g: 3, ch: 2, spin: [-22, 10, -14] },             // 千刃蓮華: twelve sabre petals, a seven-band rainbow ring, the seed pod (X06)
};

// ------------------------------------------------------------------ procedural drawing (Canvas 2D, white on black)
const TAU = Math.PI * 2;
function pen(ctx, S) {
  const C = S / 2, R = S * 0.49;
  const P = (r, a) => [C + Math.sin(a) * r * R, C - Math.cos(a) * r * R];   // polar, a = 0 at the top, clockwise
  const lw = (w) => { ctx.lineWidth = Math.max(1, w * R); };
  const circle = (r, w, dash) => { lw(w); ctx.setLineDash(dash ? dash.map((d) => d * R) : []); ctx.beginPath(); ctx.arc(C, C, r * R, 0, TAU); ctx.stroke(); ctx.setLineDash([]); };
  const disc = (r, x = 0, y = 0) => { ctx.beginPath(); ctx.arc(C + x * R, C + y * R, r * R, 0, TAU); ctx.fill(); };
  // polyline in polar coordinates (ang, r) pairs
  const polar = (pts, w, close = false) => { lw(w); ctx.beginPath(); pts.forEach(([a, r], i) => { const [x, y] = P(r, a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (close) ctx.closePath(); ctx.stroke(); };
  // local frame at polar (r, a): +y points outwards (canvas y runs down, hence the half turn), units = R
  const at = (r, a, fn, scale = 1) => { ctx.save(); const [x, y] = P(r, a); ctx.translate(x, y); ctx.rotate(a + Math.PI); ctx.scale(R * scale, R * scale); fn(); ctx.restore(); };
  return { C, R, P, lw, circle, disc, polar, at };
}

// spiral curl (cloud / wave head): starts at radius r0 and winds `turns` times inwards
function curl(ctx, x, y, r0, turns, dir = 1, a0 = 0) {
  ctx.beginPath();
  const n = Math.ceil(28 * turns);
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + dir * t * turns * TAU, r = r0 * (1 - 0.82 * t);
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();
}
// ruyi-style cloud scroll: two opposing curls joined by an S tail (local units, ~0.16 wide)
function cloudScroll(ctx, s = 1, w = 0.012) {
  ctx.lineWidth = w;
  curl(ctx, -0.05 * s, 0, 0.035 * s, 1.25, 1, Math.PI);
  curl(ctx, 0.05 * s, 0, 0.035 * s, 1.25, -1, 0);
  ctx.beginPath(); ctx.moveTo(-0.05 * s, 0.035 * s); ctx.bezierCurveTo(-0.01 * s, 0.07 * s, 0.01 * s, 0.07 * s, 0.05 * s, 0.035 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.0, 0.06 * s); ctx.bezierCurveTo(0.0, 0.09 * s, -0.04 * s, 0.1 * s, -0.08 * s, 0.11 * s); ctx.stroke();
}
// three-lobed cloud cluster with a trailing tail
function cloudCluster(ctx, s = 1, w = 0.012) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(-0.05 * s, 0.0, 0.035 * s, Math.PI * 0.95, Math.PI * 1.95);
  ctx.arc(0.0, -0.025 * s, 0.04 * s, Math.PI * 1.1, Math.PI * 1.9);
  ctx.arc(0.05 * s, 0.0, 0.035 * s, Math.PI * 1.05, Math.PI * 2.05);
  ctx.stroke();
  curl(ctx, -0.035 * s, 0.0, 0.022 * s, 1.0, 1, 0);
  ctx.beginPath(); ctx.moveTo(-0.085 * s, 0.01 * s); ctx.bezierCurveTo(-0.04 * s, 0.04 * s, 0.06 * s, 0.03 * s, 0.13 * s, 0.05 * s); ctx.stroke();
}
// pseudo seal-script glyph: uniform strokes on a 4x4 lattice with rounded bends, mirrored for balance.
// Generated from a seed; deliberately not a real character.
function sealGlyph(ctx, rand, size, w) {
  const g = (i) => (i / 3 - 0.5) * size;
  ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'square';
  const strokes = [];
  const sym = rand() < 0.6;
  const n = 3 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const t = rand();
    if (t < 0.35) { const y = Math.floor(rand() * 4), x0 = Math.floor(rand() * 2), x1 = x0 + 1 + Math.floor(rand() * (3 - x0)); strokes.push([[x0, y], [x1, y]]); }
    else if (t < 0.6) { const x = Math.floor(rand() * 4), y0 = Math.floor(rand() * 2), y1 = y0 + 1 + Math.floor(rand() * (3 - y0)); strokes.push([[x, y0], [x, y1]]); }
    else if (t < 0.85) { const x0 = Math.floor(rand() * 2), y0 = Math.floor(rand() * 2); strokes.push([[x0, y0], [x0, y0 + 2], [x0 + 2, y0 + 2]]); }
    else { const x0 = Math.floor(rand() * 2); strokes.push([[x0, 0], [x0, 2], [x0 + 2, 2], [x0 + 2, 0]]); }
  }
  strokes.push([[0, 0], [3, 0]]);
  if (rand() < 0.7) strokes.push([[1.5, 0], [1.5, 3]]);
  const draw = (pts, mx) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => { const px = g(mx ? 3 - x : x), py = g(y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke();
  };
  for (const s of strokes) { draw(s, false); if (sym) draw(s, true); }
}
// thunder meander (雷紋 / key pattern) along a ring between r0 and r1, n repeats
function meander(ctx, p, r0, r1, n, w) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, da = TAU / n;
    const A = (u) => a0 + u * da, Rr = (v) => r0 + v * (r1 - r0);
    for (const [u, v] of [[0, 0], [0, 1], [0.75, 1], [0.75, 0.25], [0.25, 0.25], [0.25, 0.75], [0.5, 0.75], [0.5, 0.5]]) pts.push([A(u), Rr(v)]);
    pts.push([A(0.5), Rr(0.5)], [A(1.0), Rr(0.0)]);
  }
  p.polar(pts, w);
}
// paper-cut 年 with blocky flared strokes (drawn from its stroke order, own geometry)
function nianGlyph(ctx, s) {
  const bar = (x0, y0, x1, y1, w) => { ctx.lineWidth = w * s; ctx.beginPath(); ctx.moveTo(x0 * s, y0 * s); ctx.lineTo(x1 * s, y1 * s); ctx.stroke(); };
  ctx.lineCap = 'square';
  bar(-0.26, -0.52, -0.5, -0.2, 0.12);     // 丿 top-left sweep
  bar(-0.3, -0.36, 0.5, -0.36, 0.11);      // top horizontal
  bar(-0.22, -0.08, 0.38, -0.08, 0.11);    // middle horizontal
  bar(-0.26, -0.08, -0.26, 0.2, 0.11);     // short left vertical
  bar(-0.62, 0.2, 0.62, 0.2, 0.12);        // long horizontal
  bar(0.06, -0.36, 0.06, 0.62, 0.12);      // central vertical
  // paper-cut nicks along the long strokes (cut-out crescents read as hand-cut paper)
  ctx.globalCompositeOperation = 'destination-out';
  for (const [x, y] of [[-0.45, 0.2], [0.38, 0.2], [0.3, -0.36], [0.06, 0.45]]) { ctx.beginPath(); ctx.arc(x * s, y * s, 0.028 * s, 0, TAU); ctx.fill(); }
  ctx.globalCompositeOperation = 'source-over';
}
function mountain(ctx, w) {
  ctx.lineWidth = w; ctx.lineJoin = 'round';
  for (let k = 0; k < 3; k++) {
    const s = 1 - k * 0.28;
    ctx.beginPath(); ctx.moveTo(-0.075 * s, 0); ctx.lineTo(-0.02 * s, 0.09 * s); ctx.lineTo(0.0, 0.07 * s); ctx.lineTo(0.03 * s, 0.11 * s); ctx.lineTo(0.08 * s, 0); ctx.stroke();
  }
}
function waveCrest(ctx, w) {
  ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(-0.06, 0); ctx.bezierCurveTo(-0.04, 0.05, 0.03, 0.07, 0.05, 0.03); ctx.stroke();
  curl(ctx, 0.032, 0.022, 0.022, 1.1, -1, 0.3);
}
function trigram(ctx, bits, w) {
  ctx.lineWidth = w; ctx.lineCap = 'butt';
  for (let k = 0; k < 3; k++) {
    const y = k * 0.034;
    if (bits & (1 << k)) { ctx.beginPath(); ctx.moveTo(-0.06, y); ctx.lineTo(0.06, y); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(-0.06, y); ctx.lineTo(-0.012, y); ctx.moveTo(0.012, y); ctx.lineTo(0.06, y); ctx.stroke(); }
  }
}
function flameTongue(ctx, s, w) {
  ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(-0.04 * s, 0); ctx.bezierCurveTo(-0.05 * s, 0.06 * s, 0.02 * s, 0.07 * s, 0.0, 0.13 * s);
  ctx.bezierCurveTo(0.04 * s, 0.08 * s, 0.05 * s, 0.04 * s, 0.04 * s, 0); ctx.stroke();
  curl(ctx, 0.0, 0.03 * s, 0.018 * s, 1.0, 1, Math.PI);
}

const DESIGNS = {
  clouds(ctx, p, r) {
    p.circle(0.665, 0.01); p.circle(0.98, 0.012); p.circle(0.955, 0.004);
    for (let i = 0; i < 12; i++) p.at(0.81, (i / 12) * TAU, () => cloudScroll(ctx, 1.45, 0.012));
    for (let i = 0; i < 48; i++) { const [x, y] = p.P(0.93, (i / 48) * TAU + 0.065); ctx.beginPath(); ctx.arc(x, y, 0.007 * p.R, 0, TAU); ctx.fill(); }
    p.circle(0.39, 0.008); p.circle(0.61, 0.008, [0.03, 0.02]);
    for (let i = 0; i < 8; i++) p.at(0.5, (i / 8) * TAU, () => cloudCluster(ctx, 1.05, 0.011));
    p.circle(0.34, 0.012);
    ctx.lineWidth = 0.014 * p.R;
    for (let k = 0; k < 3; k++) curl(ctx, p.C + Math.cos(k * TAU / 3) * 0.13 * p.R, p.C + Math.sin(k * TAU / 3) * 0.13 * p.R, 0.12 * p.R, 1.35, 1, k * TAU / 3 + Math.PI);
    p.disc(0.035);
  },
  seal(ctx, p, r) {
    p.circle(0.66, 0.012); p.circle(0.685, 0.005); p.circle(0.965, 0.005); p.circle(0.99, 0.012);
    for (let i = 0; i < 20; i++) p.at(0.825, (i / 20) * TAU, () => sealGlyph(ctx, r, 0.12, 0.014));
    meander(ctx, p, 0.415, 0.585, 18, 0.011);
    p.circle(0.395, 0.006); p.circle(0.605, 0.006);
    // inner square seal with a 2x2 glyph block
    const s = 0.22 * p.R;
    ctx.lineWidth = 0.028 * p.R; ctx.lineJoin = 'round';
    ctx.strokeRect(p.C - s, p.C - s, s * 2, s * 2);
    ctx.lineWidth = 0.008 * p.R; ctx.strokeRect(p.C - s * 0.86, p.C - s * 0.86, s * 1.72, s * 1.72);
    for (let k = 0; k < 4; k++) { ctx.save(); ctx.translate(p.C + ((k & 1) ? 0.5 : -0.5) * s * 0.86, p.C + ((k & 2) ? 0.5 : -0.5) * s * 0.86); ctx.scale(p.R, p.R); sealGlyph(ctx, r, 0.15, 0.022); ctx.restore(); }
  },
  bagua(ctx, p, r) {
    const oct = (rad, w, rot = Math.PI / 8) => p.polar(Array.from({ length: 9 }, (_, i) => [rot + (i / 8) * TAU, rad]), w);
    oct(0.985, 0.012); oct(0.955, 0.004); oct(0.675, 0.01);
    const bits = [7, 0, 1, 6, 2, 5, 4, 3];
    for (let i = 0; i < 8; i++) {
      p.at(0.79, (i / 8) * TAU, () => trigram(ctx, bits[i], 0.016));
      const [x, y] = p.P(0.985 / Math.cos(Math.PI / 8) * 0.93, (i / 8) * TAU + Math.PI / 8); ctx.beginPath(); ctx.arc(x, y, 0.02 * p.R, 0, TAU); ctx.fill();
    }
    p.circle(0.39, 0.008); p.circle(0.61, 0.008);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      p.polar([[a, 0.41], [a, 0.59]], 0.01);
      p.polar([[a - 0.05, 0.53], [a, 0.59], [a + 0.05, 0.53]], 0.01);
      const b = a + TAU / 16;
      p.polar([[b, 0.46], [b + 0.03, 0.5], [b, 0.54], [b - 0.03, 0.5], [b, 0.46]], 0.007);
    }
    // eight-pointed star of two squares + hub
    const sq = (rot) => p.polar(Array.from({ length: 5 }, (_, i) => [rot + (i / 4) * TAU, 0.33]), 0.012);
    sq(0); sq(Math.PI / 4);
    p.circle(0.14, 0.01); p.disc(0.04);
  },
  censer(ctx, p, r) {
    // outer: running cloud scroll band
    p.circle(0.665, 0.01); p.circle(0.985, 0.01);
    const n = 16;
    for (let i = 0; i < n; i++) p.at(0.8, (i / n) * TAU, () => { ctx.lineWidth = 0.012; curl(ctx, 0, 0, 0.06, 1.3, 1, Math.PI); ctx.beginPath(); ctx.moveTo(0.06, 0); ctx.bezierCurveTo(0.09, -0.06, 0.15, -0.06, 0.19, 0.0); ctx.stroke(); });
    for (let i = 0; i < 32; i++) p.at(0.94, (i / 32) * TAU, () => { ctx.lineWidth = 0.008; ctx.beginPath(); ctx.moveTo(-0.012, -0.01); ctx.quadraticCurveTo(0, 0.03, 0.012, -0.01); ctx.stroke(); });
    // middle: incense smoke ribbons
    p.circle(0.39, 0.007); p.circle(0.61, 0.007);
    for (let i = 0; i < 10; i++) p.at(0.5, (i / 10) * TAU, () => { ctx.lineWidth = 0.011; ctx.beginPath(); ctx.moveTo(0, -0.09); ctx.bezierCurveTo(0.05, -0.05, -0.05, 0.0, 0.0, 0.04); ctx.stroke(); curl(ctx, 0.0, 0.06, 0.025, 1.2, 1, Math.PI * 0.5); });
    // inner: three-legged censer (ding) with smoke rising
    ctx.save(); ctx.translate(p.C, p.C); ctx.scale(p.R, p.R);
    ctx.lineWidth = 0.016; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-0.17, -0.02); ctx.lineTo(0.17, -0.02); ctx.bezierCurveTo(0.17, 0.12, 0.1, 0.17, 0, 0.17); ctx.bezierCurveTo(-0.1, 0.17, -0.17, 0.12, -0.17, -0.02); ctx.stroke();
    for (const x of [-0.12, 0.0, 0.12]) { ctx.beginPath(); ctx.moveTo(x, 0.15); ctx.lineTo(x * 1.25, 0.26); ctx.stroke(); }
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * 0.13, -0.07, 0.04, 0, TAU); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-0.2, -0.02); ctx.lineTo(0.2, -0.02); ctx.stroke();
    ctx.lineWidth = 0.01;
    ctx.beginPath(); ctx.moveTo(-0.12, 0.06); ctx.lineTo(0.12, 0.06); ctx.stroke();
    for (const [x, d] of [[-0.06, 1], [0.0, -1], [0.06, 1]]) { ctx.beginPath(); ctx.moveTo(x, -0.04); ctx.bezierCurveTo(x + d * 0.04, -0.1, x - d * 0.04, -0.15, x, -0.21); ctx.stroke(); curl(ctx, x, -0.25, 0.04, 1.2, d, Math.PI / 2); }
    ctx.restore();
    p.circle(0.345, 0.008);
  },
  isobar(ctx, p, r) {
    // inner: low-pressure spiral eye
    const sp = [];
    for (let i = 0; i <= 140; i++) { const t = i / 140; sp.push([t * 3.2 * TAU, 0.035 + t * 0.3]); }
    p.polar(sp, 0.012);
    p.disc(0.025);
    // middle: wobbly closed isobars with ticks
    for (let k = 0; k < 4; k++) {
      const r0 = 0.415 + k * 0.058, ph = r() * TAU, ph2 = r() * TAU;
      p.polar(Array.from({ length: 181 }, (_, i) => { const a = (i / 180) * TAU; return [a, r0 + 0.012 * Math.sin(3 * a + ph) + 0.007 * Math.sin(5 * a + ph2)]; }), 0.008);
    }
    p.circle(0.383, 0.004); p.circle(0.617, 0.004);
    // outer: weather front with cold-front triangles and warm-front semicircles, dashed graticule
    p.circle(0.665, 0.01);
    const front = Array.from({ length: 241 }, (_, i) => { const a = (i / 240) * TAU; return [a, 0.8 + 0.03 * Math.sin(4 * a)]; });
    p.polar(front, 0.012);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU + 0.07, rr = 0.8 + 0.03 * Math.sin(4 * a);
      p.at(rr, a, () => {
        if (i % 2 === 0) { ctx.beginPath(); ctx.moveTo(-0.035, 0); ctx.lineTo(0, 0.06); ctx.lineTo(0.035, 0); ctx.closePath(); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(0, 0, 0.033, Math.PI, 0, false); ctx.closePath(); ctx.fill(); }
      });
    }
    p.circle(0.985, 0.008, [0.02, 0.015]);
    for (let i = 0; i < 72; i++) { const a = (i / 72) * TAU; p.polar([[a, i % 6 ? 0.95 : 0.92], [a, 0.975]], 0.006); }
  },
  mountainSea(ctx, p, r) {
    // outer: sea cliffs and waves (crests ring + slanted standing-water strokes)
    p.circle(0.665, 0.01); p.circle(0.99, 0.01);
    for (let i = 0; i < 18; i++) p.at(0.74, (i / 18) * TAU, () => waveCrest(ctx, 0.012), 1.6);
    for (let i = 0; i < 90; i++) { const a = (i / 90) * TAU; p.polar([[a, 0.86], [a + 0.035, 0.975]], 0.007); }
    // middle: ring of layered peaks pointing outwards
    p.circle(0.395, 0.008);
    for (let i = 0; i < 10; i++) p.at(0.405, (i / 10) * TAU, () => mountain(ctx, 0.01), 1.5);
    p.circle(0.615, 0.005, [0.015, 0.02]);
    // inner: sun disc with rays and cloud bars
    p.disc(0.11);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; p.polar([[a, 0.15], [a, i % 2 ? 0.22 : 0.27]], 0.014); }
    p.circle(0.33, 0.01);
    ctx.lineWidth = 0.012 * p.R;
    for (const [y, x0, x1] of [[-0.05, -0.3, -0.13], [0.05, 0.13, 0.3]]) { ctx.beginPath(); ctx.moveTo(p.C + x0 * p.R, p.C + y * p.R); ctx.lineTo(p.C + x1 * p.R, p.C + y * p.R); ctx.stroke(); }
  },
  nian(ctx, p, r) {
    // paper-cut: solid paper bands with cut-outs (scallops, sawtooth, crescents) and the character 年
    ctx.fillStyle = '#d0d0d0';
    ctx.beginPath(); ctx.arc(p.C, p.C, 0.985 * p.R, 0, TAU); ctx.arc(p.C, p.C, 0.66 * p.R, 0, TAU, true); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 40; i++) { const [x, y] = p.P(0.985, (i / 40) * TAU); ctx.beginPath(); ctx.arc(x, y, 0.035 * p.R, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 64; i++) p.at(0.7, (i / 64) * TAU, () => { ctx.beginPath(); ctx.moveTo(-0.025, 0); ctx.lineTo(0, 0.035); ctx.lineTo(0.025, 0); ctx.closePath(); ctx.fill(); });
    for (let i = 0; i < 12; i++) p.at(0.83, (i / 12) * TAU, () => { ctx.beginPath(); ctx.arc(0, 0, 0.06, 0, TAU); ctx.arc(0, -0.025, 0.055, 0, TAU, true); ctx.fill(); ctx.beginPath(); ctx.arc(0, 0.06, 0.012, 0, TAU); ctx.fill(); });
    for (let i = 0; i < 12; i++) p.at(0.83, ((i + 0.5) / 12) * TAU, () => { for (const d of [-0.03, 0, 0.03]) { ctx.beginPath(); ctx.arc(d, 0, 0.009, 0, TAU); ctx.fill(); } });
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#d0d0d0';
    ctx.beginPath(); ctx.arc(p.C, p.C, 0.6 * p.R, 0, TAU); ctx.arc(p.C, p.C, 0.4 * p.R, 0, TAU, true); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 8; i++) p.at(0.5, (i / 8) * TAU, () => { for (let k = 0; k < 4; k++) { ctx.save(); ctx.rotate(k * Math.PI / 2 + Math.PI / 4); ctx.beginPath(); ctx.ellipse(0, 0.035, 0.016, 0.034, 0, 0, TAU); ctx.fill(); ctx.restore(); } ctx.beginPath(); ctx.arc(0, 0, 0.012, 0, TAU); ctx.fill(); });
    for (let i = 0; i < 8; i++) p.at(0.5, ((i + 0.5) / 8) * TAU, () => { ctx.beginPath(); ctx.moveTo(0, -0.07); ctx.lineTo(0.02, 0); ctx.lineTo(0, 0.07); ctx.lineTo(-0.02, 0); ctx.closePath(); ctx.fill(); });
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
    p.circle(0.34, 0.016);
    ctx.save(); ctx.translate(p.C, p.C); nianGlyph(ctx, 0.38 * p.R); ctx.restore();
  },
  vortex(ctx, p, r) {
    // water whirl: log-spiral arms of parallel wave lines, foam dots, crests on the rim
    for (let arm = 0; arm < 5; arm++) for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let i = 0; i <= 120; i++) { const t = i / 120; const rr = 0.04 + t * 0.95; pts.push([arm * TAU / 5 + t * 2.6 + k * 0.07 + Math.log(rr + 0.2) * 0.4, rr]); }
      p.polar(pts.filter(([, rr]) => !(rr > 0.355 && rr < 0.375) && !(rr > 0.625 && rr < 0.645)), k ? 0.006 : 0.012);
    }
    for (let i = 0; i < 70; i++) { const a = r() * TAU, rr = 0.1 + r() * 0.85; if ((rr > 0.35 && rr < 0.38) || (rr > 0.62 && rr < 0.65)) continue; const [x, y] = p.P(rr, a); ctx.beginPath(); ctx.arc(x, y, (0.004 + r() * 0.01) * p.R, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 16; i++) p.at(0.9, (i / 16) * TAU, () => waveCrest(ctx, 0.012), 1.2);
    p.circle(0.99, 0.008);
    p.disc(0.03);
  },
  thunder(ctx, p, r) {
    p.circle(0.66, 0.01); p.circle(0.99, 0.01);
    meander(ctx, p, 0.7, 0.95, 24, 0.012);
    p.circle(0.39, 0.007); p.circle(0.61, 0.007);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; p.polar([[a, 0.41], [a + 0.12, 0.47], [a + 0.02, 0.52], [a + 0.14, 0.59]], 0.012); }
    p.circle(0.34, 0.012);
    ctx.save(); ctx.translate(p.C, p.C); ctx.scale(p.R, p.R); ctx.lineWidth = 0.022; ctx.lineJoin = 'miter'; ctx.lineCap = 'square';
    for (let q = 0; q < 4; q++) {
      ctx.save(); ctx.rotate(q * Math.PI / 2); ctx.beginPath();
      const sp = [[0.03, 0.03], [0.03, 0.2], [0.2, 0.2], [0.2, 0.08], [0.09, 0.08], [0.09, 0.14], [0.14, 0.14]];
      sp.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  },
  flame(ctx, p, r) {
    p.circle(0.665, 0.01); p.circle(0.99, 0.008);
    for (let i = 0; i < 12; i++) p.at(0.68, (i / 12) * TAU, () => flameTongue(ctx, 2.3, 0.016));
    for (let i = 0; i < 14; i++) p.at(0.8, ((i + 0.5) / 14) * TAU, () => cloudScroll(ctx, 0.8, 0.009));
    p.circle(0.39, 0.007); p.circle(0.61, 0.007);
    for (let i = 0; i < 10; i++) p.at(0.42, (i / 10) * TAU, () => flameTongue(ctx, 1.4, 0.011));
    p.circle(0.33, 0.012);
    for (let i = 0; i < 6; i++) p.at(0.05, (i / 6) * TAU, () => flameTongue(ctx, 1.7, 0.013));
  },
  wind(ctx, p, r) {
    p.circle(0.665, 0.006); p.circle(0.99, 0.01);
    for (let i = 0; i < 9; i++) { const a0 = (i / 9) * TAU; p.polar(Array.from({ length: 40 }, (_, k) => [a0 + k * 0.022, 0.72 + 0.2 * (k / 39) + 0.015 * Math.sin(k * 0.6)]), 0.011); p.at(0.92, a0 + 39 * 0.022, () => { ctx.lineWidth = 0.011; curl(ctx, 0, 0, 0.03, 1.1, 1, 0); }); }
    p.circle(0.39, 0.006, [0.03, 0.02]); p.circle(0.61, 0.006, [0.03, 0.02]);
    for (let i = 0; i < 6; i++) { const a0 = (i / 6) * TAU; p.polar(Array.from({ length: 30 }, (_, k) => [a0 + k * 0.03, 0.42 + 0.17 * (k / 29)]), 0.012); }
    for (let k = 0; k < 3; k++) { const pts = []; for (let i = 0; i <= 80; i++) { const t = i / 80; pts.push([k * TAU / 3 + t * 4.2, 0.03 + t * 0.3]); } p.polar(pts, 0.011); }
  },
  starmap(ctx, p, r) {
    // outer band: double rim, the 28 mansion ticks, a small constellation glyph (2-4 joined stars) in every sector
    p.circle(0.985, 0.012); p.circle(0.955, 0.004); p.circle(0.665, 0.008);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      p.polar([[a, 0.905], [a, 0.95]], i % 7 === 0 ? 0.012 : 0.006);
      const n = 2 + Math.floor(r() * 3), pts = [];
      for (let k = 0; k < n; k++) pts.push([a + (0.035 + r() * 0.15), 0.71 + r() * 0.17]);
      p.polar(pts, 0.004);
      for (const [b, rr] of pts) { const [x, y] = p.P(rr, b); ctx.beginPath(); ctx.arc(x, y, (0.008 + r() * 0.008) * p.R, 0, TAU); ctx.fill(); }
    }
    // middle band: twin rings, four dotted quadrant arcs, eight four-point stars
    p.circle(0.61, 0.008); p.circle(0.39, 0.008); p.circle(0.5, 0.003, [0.01, 0.025]);
    for (let i = 0; i < 8; i++) p.at(0.5, (i / 8) * TAU + TAU / 16, () => {
      ctx.beginPath(); ctx.moveTo(0, -0.05); ctx.lineTo(0.012, -0.012); ctx.lineTo(0.05, 0); ctx.lineTo(0.012, 0.012); ctx.lineTo(0, 0.05); ctx.lineTo(-0.012, 0.012); ctx.lineTo(-0.05, 0); ctx.lineTo(-0.012, -0.012); ctx.closePath(); ctx.fill();
    });
    for (let q = 0; q < 4; q++) for (let k = 0; k < 9; k++) { const [x, y] = p.P(0.44 + (k % 2) * 0.12, (q / 4) * TAU + 0.12 + k * 0.06); ctx.beginPath(); ctx.arc(x, y, 0.006 * p.R, 0, TAU); ctx.fill(); }
    // inner: the dipper, its first star (天樞) the brightest, inside a thin ring
    p.circle(0.345, 0.012);
    const D = [[-0.2, 0.06], [-0.13, -0.05], [-0.02, -0.03], [0.0, 0.08], [0.1, 0.12], [0.18, 0.19], [0.27, 0.21]];
    ctx.lineWidth = 0.008 * p.R; ctx.beginPath();
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]]) { ctx.moveTo(p.C + D[a][0] * p.R, p.C + D[a][1] * p.R); ctx.lineTo(p.C + D[b][0] * p.R, p.C + D[b][1] * p.R); }
    ctx.stroke();
    D.forEach(([x, y], i) => { ctx.beginPath(); ctx.arc(p.C + x * p.R, p.C + y * p.R, (i === 0 ? 0.03 : 0.018) * p.R, 0, TAU); ctx.fill(); });
  },
  leiwen(ctx, p, r) {
    // 雲雷紋戰陣 (X05 猛志): double rims round a band of square thunder spirals; a middle band of almond eyes and
    // crescent axe blades, alternating; in the centre an original clan emblem: a 亞-shaped frame holding a headless
    // dancer with a shield and a raised axe (pictogram drawn from strokes, no real character)
    p.circle(0.99, 0.012); p.circle(0.958, 0.004); p.circle(0.665, 0.012); p.circle(0.695, 0.004);
    meander(ctx, p, 0.72, 0.93, 28, 0.013);
    p.circle(0.61, 0.007); p.circle(0.39, 0.007);
    for (let i = 0; i < 8; i++) {
      p.at(0.5, (i / 8) * TAU, i % 2 === 0 ? () => {
        ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(-0.075, 0); ctx.quadraticCurveTo(0, 0.062, 0.075, 0); ctx.quadraticCurveTo(0, -0.062, -0.075, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 0.022, 0, TAU); ctx.fill();
      } : () => {
        ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(-0.055, -0.035); ctx.lineTo(-0.075, 0.03); ctx.quadraticCurveTo(0, 0.09, 0.075, 0.03); ctx.lineTo(0.055, -0.035); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-0.075, -0.06); ctx.lineTo(0.075, -0.06); ctx.stroke();
      });
    }
    ctx.save(); ctx.translate(p.C, p.C); ctx.scale(p.R, p.R); ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    const a = 0.2, b = 0.27, n = 0.07;
    ctx.lineWidth = 0.016; ctx.beginPath();
    [[-a + n, -b], [a - n, -b], [a - n, -b + n], [a, -b + n], [a, b - n], [a - n, b - n], [a - n, b], [-a + n, b], [-a + n, b - n], [-a, b - n], [-a, -b + n], [-a + n, -b + n]]
      .forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath(); ctx.stroke();
    ctx.lineWidth = 0.036; ctx.beginPath(); ctx.moveTo(0, -0.11); ctx.lineTo(0, 0.05); ctx.stroke();                      // torso
    ctx.lineWidth = 0.013; ctx.beginPath(); ctx.moveTo(-0.075, 0.19); ctx.lineTo(0, 0.05); ctx.lineTo(0.075, 0.19); ctx.stroke();   // legs
    ctx.beginPath(); ctx.moveTo(-0.1, -0.03); ctx.lineTo(0, -0.09); ctx.lineTo(0.085, -0.13); ctx.lineTo(0.085, -0.2); ctx.stroke(); // arms
    ctx.beginPath(); ctx.ellipse(-0.105, -0.03, 0.035, 0.055, 0, 0, TAU); ctx.stroke();                                    // 干
    ctx.beginPath(); ctx.moveTo(0.085, -0.17); ctx.lineTo(0.14, -0.185); ctx.quadraticCurveTo(0.16, -0.22, 0.14, -0.255); ctx.lineTo(0.085, -0.24); ctx.closePath(); ctx.fill();   // 戚
    ctx.globalCompositeOperation = 'destination-out';                                                                        // eyes and mouth cut into the torso
    for (const x of [-0.009, 0.009]) { ctx.beginPath(); ctx.arc(x, -0.07, 0.006, 0, TAU); ctx.fill(); }
    ctx.fillRect(-0.011, -0.03, 0.022, 0.007);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  },
  lotus(ctx, p, r) {
    // 千刃蓮華 (X06): a double rim with a running band of small crossed blades; twelve lotus petals, each holding a sabre
    // (willow-leaf blade, a dragon-head guard, a ring pommel) point outwards; seven thin rings (the rainbow) round the
    // seed pod, its seeds in two rings and a centre
    p.circle(0.99, 0.012); p.circle(0.962, 0.004); p.circle(0.68, 0.006);
    for (let i = 0; i < 36; i++) p.at(0.875, (i / 36) * TAU, () => {
      ctx.lineWidth = 0.008; ctx.beginPath(); ctx.moveTo(-0.03, -0.035); ctx.lineTo(0.03, 0.035); ctx.moveTo(0.03, -0.035); ctx.lineTo(-0.03, 0.035); ctx.stroke();
    });
    for (let i = 0; i < 12; i++) p.at(0.37, (i / 12) * TAU, () => {
      // the petal outline: a pointed leaf from the inner ring out to the band
      ctx.lineWidth = 0.011; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(0.14, 0.12, 0.12, 0.32, 0, 0.45); ctx.bezierCurveTo(-0.12, 0.32, -0.14, 0.12, 0, 0); ctx.stroke();
      // the sabre in the petal: blade (a curved stroke), guard, grip, ring
      ctx.lineWidth = 0.014; ctx.beginPath(); ctx.moveTo(0, 0.12); ctx.quadraticCurveTo(0.025, 0.27, 0.0, 0.41); ctx.stroke();
      ctx.lineWidth = 0.006; ctx.beginPath(); ctx.moveTo(-0.012, 0.15); ctx.quadraticCurveTo(0.012, 0.27, -0.006, 0.37); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0.105, 0.024, 0.014, 0, 0, TAU); ctx.fill();
      ctx.lineWidth = 0.01; ctx.beginPath(); ctx.moveTo(0, 0.09); ctx.lineTo(0, 0.045); ctx.stroke();
      ctx.lineWidth = 0.006; ctx.beginPath(); ctx.arc(0, 0.032, 0.013, 0, TAU); ctx.stroke();
    });
    for (let k = 0; k < 7; k++) p.circle(0.3 - k * 0.018, k === 0 || k === 6 ? 0.007 : 0.004);
    p.circle(0.16, 0.01);
    for (let i = 0; i < 12; i++) { const [x, y] = p.P(0.115, (i / 12) * TAU); ctx.beginPath(); ctx.arc(x, y, 0.016 * p.R, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 6; i++) { const [x, y] = p.P(0.06, (i / 6) * TAU + 0.5); ctx.beginPath(); ctx.arc(x, y, 0.013 * p.R, 0, TAU); ctx.fill(); }
    p.disc(0.02);
  },
  square(ctx, p, r) {
    // square court: nested squares, corner seals, centre glyph (bands do not spin)
    const sq = (h, w) => { ctx.lineWidth = w * p.R; ctx.strokeRect(p.C - h * p.R, p.C - h * p.R, h * 2 * p.R, h * 2 * p.R); };
    sq(0.62, 0.016); sq(0.595, 0.005); sq(0.4, 0.012); sq(0.22, 0.02);
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.save(); ctx.translate(p.C + sx * 0.62 * p.R, p.C + sy * 0.62 * p.R); ctx.scale(p.R, p.R);
      ctx.lineWidth = 0.014; ctx.strokeRect(-0.08, -0.08, 0.16, 0.16); sealGlyph(ctx, r, 0.11, 0.016); ctx.restore();
    }
    for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(p.C, p.C); ctx.rotate(i * Math.PI / 2); ctx.scale(p.R, p.R); for (let k = -3; k <= 3; k++) { ctx.save(); ctx.translate(k * 0.115, -0.5); sealGlyph(ctx, r, 0.07, 0.01); ctx.restore(); } ctx.restore(); }
    ctx.save(); ctx.translate(p.C, p.C); ctx.scale(p.R, p.R); sealGlyph(ctx, r, 0.26, 0.028); ctx.restore();
  },
};

// pixel data cache per (group, size): textures are rebuilt per game, the canvas work only once
const groupData = new Map();
function buildGroup(g, S) {
  const key = g + ':' + S;
  if (groupData.has(key)) return groupData.get(key);
  const t0 = performance.now();
  const out = new Uint8Array(S * S * 4);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  for (const [name, d] of Object.entries(SIGIL)) {
    if (d.g !== g) continue;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const p = pen(ctx, S);
    let seed = 0; for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    DESIGNS[name](ctx, p, rng(seed));
    const px = ctx.getImageData(0, 0, S, S).data;
    for (let i = 0, j = d.ch; i < S * S; i++, j += 4) out[j] = px[i * 4];
  }
  const res = { data: out, S, ms: performance.now() - t0 };
  groupData.set(key, res);
  return res;
}

// ------------------------------------------------------------------ shaders
const SIGIL_VERT = /* glsl */`
varying vec2 vP;
void main() { vP = position.xy * 2.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SIGIL_FRAG = /* glsl */`
uniform sampler2D tSig;
uniform vec4 uChan;
uniform vec3 uRot;          // band angles: inner, middle, outer
uniform vec3 uCore, uRim;   // HDR colours (centre -> rim)
uniform vec4 uK;            // amount, flash, glow, pulse
varying vec2 vP;
vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float a = r < 0.365 ? uRot.x : (r < 0.635 ? uRot.y : uRot.z);
  vec2 q = rot(vP, a);
  vec2 uv = vec2(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5);   // canvas rows run downwards
  float m = dot(texture2D(tSig, uv), uChan);
  float glow = dot(texture2D(tSig, uv, 3.5), uChan);
  vec3 c = mix(uCore, uRim, smoothstep(0.15, 0.95, r));
  float edge = smoothstep(1.0, 0.93, r);
  vec3 col = c * (m * 1.2 + glow * uK.z) * uK.w + c * exp(-r * r * 3.0) * 0.06;   // + faint light pool on the ground
  col += vec3(1.0, 0.95, 0.9) * (m + glow) * uK.y * 3.0;                           // appear flash
  gl_FragColor = vec4(col * uK.x * edge, 1.0);
}`;

const PILLAR_VERT = /* glsl */`
attribute float aLayer;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying float vLayer;
void main() {
  vUv = uv; vLayer = aLayer;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const PILLAR_FRAG = /* glsl */`
uniform float uTime, uAmt, uH, uSeed;
uniform vec3 uCore, uGlow;
${GLSL_NOISE}
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying float vLayer;
void main() {
  float ndv = abs(dot(normalize(vN), normalize(vV)));
  float y = vUv.y;                                       // 0 ground .. 1 top
  float vfade = smoothstep(1.0, 0.45, y) * smoothstep(0.0, 0.02, y);
  float streak = n1(vec2(vUv.x * 3.0 + uSeed, y * uH * 0.06 - uTime * 1.6));
  float streak2 = n1(vec2(vUv.x * 7.0 - uSeed, y * uH * 0.12 - uTime * 2.7));
  vec3 col;
  if (vLayer < 0.5) {   // hot core
    col = uCore * pow(ndv, 1.5) * (0.75 + 0.5 * streak);
  } else {              // soft glow sheath, brightest where we look through most of it
    col = uGlow * pow(ndv, 2.2) * (0.5 + 0.8 * streak * streak2) * 0.6;
  }
  col += uGlow * smoothstep(0.08, 0.0, y) * 1.5;        // ground contact flare
  gl_FragColor = vec4(col * vfade * uAmt, 1.0);
}`;

const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Sigils {
  constructor(kit) {
    this.kit = kit;
    this.fx = kit.fx;
    this.game = kit.game;
    this.S = kit.low ? 512 : 1024;
    this.tex = [];               // per group (lazy)
    this.list = [];
    this.pillars = [];
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.max = 6;                // L2 budget: 2 per player, 4 players (§1.7.4) + headroom
    // pillar geometry: core + glow sheath, open cylinders, base at y = 0, height 1
    const core = new THREE.CylinderGeometry(0.32, 0.32, 1, 20, 1, true).translate(0, 0.5, 0);
    const glow = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true).translate(0, 0.5, 0);
    this.pillarGeo = { round: mergeLayers(core, glow) };
    const cs = new THREE.CylinderGeometry(0.32, 0.32, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    const gs = new THREE.CylinderGeometry(1, 1, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    this.pillarGeo.square = mergeLayers(cs, gs);
    // one hidden instance of each material so the scene precompile at load covers the programs
    this._proto = this._sigilMat(); this._pproto = this._pillarMat();
    for (const [m, g] of [[this._proto, this.geo], [this._pproto, this.pillarGeo.round]]) {
      const mesh = new THREE.Mesh(g, m); mesh.visible = false; mesh.frustumCulled = false; mesh.scale.setScalar(1e-4); this.game.scene.add(mesh);
    }
  }

  _texture(g) {
    if (this.tex[g]) return this.tex[g];
    const { data, S } = buildGroup(g, this.S);
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = this.kit.low ? 1 : 4;
    t.needsUpdate = true;
    this.tex[g] = t;
    return t;
  }
  /** Builds the atlas groups of these designs now (call at weapon equip / load to avoid a first-use hitch). */
  preload(names = Object.keys(SIGIL)) { for (const n of names) if (SIGIL[n]) this._texture(SIGIL[n].g); }
  /** PNG data URL of one design (dev): fx.sigils.debugURL('clouds'). */
  debugURL(name) {
    const d = SIGIL[name]; const { data, S } = buildGroup(d.g, this.S);
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d'); const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) { const v = data[i * 4 + d.ch]; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0); return cv.toDataURL();
  }

  _sigilMat() {
    return new THREE.ShaderMaterial({
      vertexShader: SIGIL_VERT, fragmentShader: SIGIL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { tSig: { value: null }, uChan: { value: new THREE.Vector4(1, 0, 0, 0) }, uRot: { value: new THREE.Vector3() },
        uCore: { value: new THREE.Vector3(3, 2, 1) }, uRim: { value: new THREE.Vector3(3, 1, 0.5) }, uK: { value: new THREE.Vector4(1, 0, 0.5, 1) } },
    });
  }
  _pillarMat() {
    return new THREE.ShaderMaterial({
      vertexShader: PILLAR_VERT, fragmentShader: PILLAR_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.kit.time, tNoise: this.kit.noise, uAmt: { value: 1 }, uH: { value: 10 }, uSeed: { value: 0 }, uCore: { value: new THREE.Vector3(6, 5, 4) }, uGlow: { value: new THREE.Vector3(2, 1, 0.4) } },
    });
  }

  /**
   * Magic circle on the ground (or any plane). pos: Vector3 (ground point). opts: design (SIGIL key), radius (m),
   * color (centre, HDR), color1 (rim), intensity, life (s, Infinity = until stop()), grow (s, appear scale
   * .6 -> 1 with easeOutBack + 0.15 s white flash), spin (multiplier on the design's band speeds), normal
   * (Vector3, default up; 'camera' = upright facing the viewer), lift (m above the surface), seed (start angles),
   * pulse (Hz). Returns { mesh, stop(fade), set({ color, color1, intensity, spin }), alive }.
   */
  sigil(pos, opts = {}) {
    const d = SIGIL[opts.design] || SIGIL.clouds;
    const mat = this._sigilMat();
    const u = mat.uniforms;
    u.tSig.value = this._texture(d.g);
    u.uChan.value.set(d.ch === 0 ? 1 : 0, d.ch === 1 ? 1 : 0, d.ch === 2 ? 1 : 0, d.ch === 3 ? 1 : 0);
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 15;
    const n = opts.normal === 'camera' ? null : (opts.normal || UP);
    mesh.position.copy(pos);
    if (n) {
      mesh.quaternion.setFromUnitVectors(Z, _v.copy(n).normalize());
      mesh.position.addScaledVector(_v, opts.lift ?? 0.04);
      // turn the design about its normal so its top points away from the viewer (glyphs read upright)
      const eye = opts.face || this.game.camera.position;
      _q.copy(mesh.quaternion).invert();
      const lx = _w.subVectors(pos, eye).applyQuaternion(_q);
      if (Math.abs(lx.x) + Math.abs(lx.y) > 1e-3) mesh.quaternion.multiply(_q.setFromAxisAngle(Z, Math.atan2(lx.y, lx.x) - Math.PI / 2));
    }
    this.game.scene.add(mesh);
    const r = rng(opts.seed ?? (Math.random() * 1e9) | 0);
    const h = {
      mesh, d, t: 0, life: opts.life ?? 2.6, fade: opts.fadeOut ?? 0.45, grow: opts.grow ?? 0.25, radius: opts.radius ?? 6,
      spin: opts.spin ?? 1, pulse: opts.pulse ?? 1.2, intensity: (opts.intensity ?? 1) * (d.gain ?? 1), glow: opts.glow ?? 0.6, billboard: !n,
      rot: [r() * TAU, r() * TAU, r() * TAU], alive: true,
      stop: (fade) => { if (fade !== undefined) h.fade = fade; h.life = Math.min(h.life, h.t + h.fade); },
      set: (o) => { if (o.color) hdr(o.color, 1, u.uCore.value); if (o.color1) hdr(o.color1, 1, u.uRim.value); if (o.intensity !== undefined) h.intensity = o.intensity * (d.gain ?? 1); if (o.spin !== undefined) h.spin = o.spin; return h; },
    };
    hdr(opts.color || [3, 2, 0.9], 1, u.uCore.value);
    hdr(opts.color1 || opts.color || [3.5, 1.2, 0.4], 1, u.uRim.value);
    this.list.push(h);
    // budget: the oldest sigil fades out early
    const live = this.list.filter((s) => s.life > s.t + s.fade);
    if (live.length > this.max) live[0].stop(0.2);
    this._apply(h, 0);
    return h;
  }

  /**
   * Light column from the sky (or rising from the ground). opts: radius, height, color (core, HDR), color1
   * (glow), life, strike (s to reach full width), square (M06 seal court), rise (true = grows upwards from the
   * ground), motes (rising light specks, count), ring (ground ring), light (LightPool flash intensity, 0 = none).
   */
  pillar(pos, opts = {}) {
    const mat = this._pillarMat();
    const u = mat.uniforms;
    const mesh = new THREE.Mesh(opts.square ? this.pillarGeo.square : this.pillarGeo.round, mat);
    mesh.position.copy(pos);
    mesh.frustumCulled = false;
    mesh.renderOrder = 22;
    this.game.scene.add(mesh);
    hdr(opts.color || [6, 5, 3.5], 1, u.uCore.value);
    hdr(opts.color1 || [2.4, 1.2, 0.4], 1, u.uGlow.value);
    u.uSeed.value = Math.random() * 10;
    const h = { mesh, t: 0, life: opts.life ?? 0.8, radius: opts.radius ?? 1.2, height: opts.height ?? 14, strike: opts.strike ?? 0.08, rise: !!opts.rise, alive: true,
      stop: () => { h.life = Math.min(h.life, h.t + 0.3); } };
    u.uH.value = h.height;
    this.pillars.push(h);
    this._applyPillar(h);
    const P = this.fx.particles;
    const c1 = u.uGlow.value;
    if (opts.ring !== false) this.ring(pos, { r1: h.radius * 3, life: 0.45, color: [c1.x * 1.5, c1.y * 1.5, c1.z * 1.5] });
    const nm = Math.round((opts.motes ?? 14) * Math.min(1, this.fx.k + 0.2));
    for (let i = 0; i < nm; i++) {
      const a = Math.random() * TAU, rr = Math.random() * h.radius * 0.9;
      P.spawn({ additive: true, x: pos.x + Math.cos(a) * rr, y: pos.y + Math.random() * 1.5, z: pos.z + Math.sin(a) * rr, vx: 0, vy: 3 + Math.random() * 5, vz: 0,
        delay: Math.random() * h.life * 0.5, life: 0.6 + Math.random() * 0.6, size: 0.05 + Math.random() * 0.05, color: [c1.x * 2, c1.y * 2, c1.z * 2, 1], color1: [c1.x, c1.y, c1.z, 0], frame: FRAME.glint, drag: 0.5 });
    }
    if (opts.light !== 0) this.fx.lights.flash(_v.copy(pos).setY(pos.y + 1.5), new THREE.Color(Math.min(1, c1.x / 2), Math.min(1, c1.y / 2), Math.min(1, c1.z / 2)).getHex(), (opts.light ?? 60), 12, Math.min(0.5, h.life * 0.6));
    return h;
  }

  /** RING: expanding ground ring (reuses fx.shockwave flat). */
  ring(pos, opts = {}) { return this.fx.shockwave(_v.copy(pos).setY(pos.y + 0.05), { normal: UP, r0: 0.3, r1: 4, life: 0.4, color: [3, 2, 1.2], thin: false, ...opts }); }

  _apply(h, dt) {
    const u = h.mesh.material.uniforms;
    const t = h.t;
    const sp = h.d.spin;
    for (let k = 0; k < 3; k++) h.rot[k] += (sp[k] * Math.PI / 180) * h.spin * dt;
    u.uRot.value.set(h.rot[0], h.rot[1], h.rot[2]);
    const g = Math.min(1, t / h.grow);
    const fadeIn = Math.min(1, t / Math.max(0.05, h.grow * 0.5));
    const out = Number.isFinite(h.life) ? Math.min(1, Math.max(0, (h.life - t) / h.fade)) : 1;
    const s = h.radius * 2 * (0.6 + 0.4 * easeOutBack(g)) * (1 + (1 - out) * 0.06);
    h.mesh.scale.set(s, s, s);
    if (h.billboard) h.mesh.quaternion.copy(this.game.camera.quaternion);
    const flash = Math.max(0, 1 - t / 0.15);
    const pulse = 0.88 + 0.12 * Math.sin(t * TAU * h.pulse);
    u.uK.value.set(h.intensity * fadeIn * out, flash * 0.6, h.glow, pulse);
  }

  _applyPillar(h) {
    const t = h.t;
    const w = Math.min(1, t / h.strike);
    const out = Math.min(1, Math.max(0, (h.life - t) / 0.3));
    const r = h.radius * (0.25 + 0.75 * w) * (0.4 + 0.6 * out);
    const ht = h.rise ? h.height * Math.min(1, t / 0.25) : h.height;
    h.mesh.scale.set(r, ht, r);
    const flash = 1 + 1.5 * Math.max(0, 1 - t / 0.12);
    h.mesh.material.uniforms.uAmt.value = out * flash * Math.min(1, t / 0.03 + 0.3);
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      h.t += dt;
      if (h.t >= h.life) { this._remove(h.mesh); h.alive = false; this.list.splice(i, 1); continue; }
      this._apply(h, dt);
    }
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const h = this.pillars[i];
      h.t += dt;
      if (h.t >= h.life) { this._remove(h.mesh); h.alive = false; this.pillars.splice(i, 1); continue; }
      this._applyPillar(h);
    }
  }
  _remove(mesh) { mesh.removeFromParent(); mesh.material.dispose(); }
  clear() {
    for (const h of this.list) { this._remove(h.mesh); h.alive = false; }
    for (const h of this.pillars) { this._remove(h.mesh); h.alive = false; }
    this.list.length = 0; this.pillars.length = 0;
  }
}

function mergeLayers(a, b) {
  const g = new THREE.BufferGeometry();
  const cat = (n, size) => { const x = a.attributes[n].array, y = b.attributes[n].array; const o = new Float32Array(x.length + y.length); o.set(x); o.set(y, x.length); return new THREE.BufferAttribute(o, size); };
  g.setAttribute('position', cat('position', 3)); g.setAttribute('normal', cat('normal', 3)); g.setAttribute('uv', cat('uv', 2));
  const na = a.attributes.position.count, nb = b.attributes.position.count;
  const layer = new Float32Array(na + nb); layer.fill(1, na);
  g.setAttribute('aLayer', new THREE.BufferAttribute(layer, 1));
  const ia = a.index.array, ib = b.index.array;
  const idx = new Uint32Array(ia.length + ib.length); idx.set(ia); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + na;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
