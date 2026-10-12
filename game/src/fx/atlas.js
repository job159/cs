// Procedural effect textures, generated ONCE on the GPU at startup (a fragment shader per cell rendered
// into render targets; nothing is loaded from disk, everything here is our own procedural art):
//
//   FX atlas     8x8 cells (256 px on medium+, 128 px on low). Cells 0..15 keep the legacy numbering that
//                code all over the game uses as plain numbers (frame: 7 = blood drop, 10 = flame, ...).
//                "Volumetric" cells (muzzle clouds, fire, lit smoke) pack RG = normal xy, B = temperature /
//                thickness, A = density; every other cell is a white RGBA mask tinted by the particle colour.
//   Decal atlas  4x4 cells, left half = modulate colour (0.5 = no change, see decals.js) + coverage,
//                right half = normal xy + gloss, so bullet holes and blood react to the scene light.
//   Ramps        8 rows of HDR temperature -> colour gradients (gunfire, explosion, flames, energy colours).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const COLS = 8;
export const FRAME = {
  // ---- legacy cells (numeric frames 0..15 are used directly by other modules)
  glow: 0, smoke: 1, smoke2: 2, spark: 3, drop: 7, flame: 10, ring: 11, dust: 12,
  // unused legacy cells re-used for CS2 looks
  flick: [4, 5, 6, 8],   // 4 wispy fire fragments (ramp; rising along +x, draw with mode 'align', dir up): the
                         // turbulent, fibrous burning-gas pieces CS2's molotov sheet is made of
  mist: [9, 13],         // 2 streaky blood mist clouds (directional, +x = bullet, wound at u = 0.12)
  hole: 14, splat: 15,
  // ---- CS2-style cells
  muzzle: 16,   // 4 shapes x 4 frames (16 + shape * 4 + frame); front view of the flash cloud, core at u = 0.29
  cone: 32,     // 4 side flames / tongues: +x forward, base at u = 0.04 (0, 1 cones, 2 thin prong, 3 split)
  star4: 36,    // sharp 4-prong star (third person, from the front)
  prongs: 37,   // birdcage side view: 4 thin prongs fanning forward (+x)
  fire: 38,     // 8-frame flame flipbook (ramp), rising along +x from u = 0.06 (draw with mode 'align', dir up)
  spray: 46,    // 4-frame directional blood spray, +x = bullet direction, base at u = 0.05
  puff: 50,     // 4 lit smoke puffs (normal + thickness + density)
  dusty: 54,    // 2 lit dust puffs (denser, grainier)
  splinter: 56, shard: 57, rock: 58, clod: 59,
  splash: 60,   // water crown rising along +x (align, dir up)
  wisp: 61,     // thin curly barrel-smoke strand along +x (align, dir up)
  thinRing: 62, glint: 63,
};

// Decal cells (decals.js)
export const DECAL = {
  concrete: 0, plaster: 1, metal: 2, wood: 3, glass: 4, sand: 5, metalExit: 6,
  blood: 7, blood2: 8, blood3: 9, scorch: 10, pool: 11, tile: 12, slash: 13, splat: 14, acid: 15,
};

// Ramp rows (particles `ramp` option)
export const RAMP = { gunfire: 0, explosion: 1, flame: 2, blue: 3, green: 4, purple: 5, red: 6, gold: 7 };

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */`
precision highp float;
uniform int uType;
uniform float uSeed;
uniform float uFrame;
uniform float uPass;   // decals: 0 colour, 1 normal
uniform float uTexel;  // one texel in cell units (-1..1 space)
uniform int uOne;      // = 1; multiplies loop bounds so shader compilers keep loops (no huge unrolls)
varying vec2 vUv;
#define PI 3.14159265
#define DYN(n) ((n) * uOne)

float h11(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float gnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(h22(i) * 2.0 - 1.0, f);
  float b = dot(h22(i + vec2(1.0, 0.0)) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(h22(i + vec2(0.0, 1.0)) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(h22(i + vec2(1.0, 1.0)) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.5;
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < DYN(5); i++) { s += a * gnoise(p); p = ROT * p + 3.1; a *= 0.5; } return s; }
float fbm3(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < DYN(3); i++) { s += a * gnoise(p); p = ROT * p + 3.1; a *= 0.5; } return s; }
float worley(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d = 8.0;
  for (int y = -1; y <= DYN(1); y++) for (int x = -1; x <= DYN(1); x++) { vec2 g = vec2(float(x), float(y)); d = min(d, length(g + h22(i + g) - f)); }
  return d;
}
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float segT(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); }
float angDiff(float a, float b) { return mod(a - b + PI, 2.0 * PI) - PI; }
float edgeFade(vec2 p) { vec2 q = abs(p); return smoothstep(1.0, 0.86, max(q.x, q.y)); }
vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

// ------------------------------------------------------------------ volumetric fields
#if defined(G_MUZZLE) || defined(G_FLICK)
// ridged turbulence (1 on the ridges): flame filaments
float ridge(vec2 p) { float s = 0.0, a = 0.55; for (int i = 0; i < DYN(4); i++) { s += a * (1.0 - abs(gnoise(p))); p = ROT * p + 1.7; a *= 0.5; } return s / 1.03; }
#endif
#if defined(G_FLICK)
// Fire fragment (CS2 molotov): a lumpy burning-gas body low in the cell with 2-4 licking tongues, domain-warped,
// full of vertical ridged filaments (bright fibres with see-through gaps) and wispy torn edges. p.y = up.
float flickD(vec2 p, float sd, out float temp) {
  float yy = (p.y + 0.92) / 1.84;                       // 0 base .. 1 top
  vec2 w = vec2(fbm3(p * 1.7 + sd), fbm3(p * 1.7 + sd + 5.3));
  vec2 q = p + w * vec2(0.34, 0.18) * (0.4 + yy);
  float env = 1.0 - length((q - vec2(0.0, -0.3)) * vec2(1.4, 2.3));
  for (int k = 0; k < DYN(4); k++) {
    float fk = float(k);
    float xk = (h11(fk * 3.1 + sd) - 0.5) * 0.9;
    float hk = 0.3 + 0.6 * h11(fk * 7.3 + sd);
    float wk = 0.12 + 0.13 * h11(fk * 5.9 + sd);
    float bend = (h11(fk * 2.3 + sd) - 0.5) * 0.55;
    float t = (q.y + 0.5) / (hk + 0.5);
    float cx = xk * (1.0 - 0.5 * t) + bend * t * t;
    float tg = (1.0 - abs(q.x - cx) / (wk * pow(max(0.0, 1.0 - t), 0.75) + 0.01)) * step(0.0, t) * step(t, 1.0);
    env = max(env, tg * (1.0 - 0.4 * t));
  }
  float st = ridge(vec2(q.x * 4.2, q.y * 1.5 - sd * 0.3) + sd);
  float n = fbm(q * 3.4 + sd * 1.7);
  float d = smoothstep(0.0, 0.55, env + (st - 0.62) * 0.6 + n * 0.25);
  d *= 0.22 + 0.85 * smoothstep(0.42, 0.9, st);
  d *= smoothstep(0.02, 0.3, yy) * smoothstep(1.0, 0.8, yy);
  temp = clamp(env * 0.7 + (st - 0.55) * 0.5 + 0.2 - yy * 0.3 + n * 0.12, 0.0, 1.0) * smoothstep(0.0, 0.15, d);
  return clamp(d, 0.0, 1.0) * edgeFade(p);
}
#endif
#if defined(G_MUZZLE)
// Muzzle flash cloud, seen from behind/oblique: hot core at (-0.42, 0), licking tongues, boiling turbulent body
// (bright filaments with darker gaps), breaking up into wisps over the 4 frames.
float muzzleD(vec2 p, int set, float fr, out float temp) {
  float sd = float(set) * 17.0 + 3.0;
  vec2 q = p - vec2(-0.42, 0.0);
  vec2 w = vec2(fbm3(q * 2.1 + sd + vec2(0.0, fr * 0.5)), fbm3(q * 2.1 + sd + 9.2 + vec2(fr * 0.5, 0.0)));
  vec2 qw = q + w * (0.1 + 0.05 * fr);
  float r = length(qw), a = atan(qw.y, qw.x);
  float lob = 0.0;
  for (int k = 0; k < DYN(7); k++) {
    float fk = float(k);
    float hk = h11(fk * 3.7 + sd), hl = h11(fk * 9.1 + sd), hw = h11(fk * 5.3 + sd);
    float ak, lk, wk;
    if (set == 0) {        // fluffy (AK): big lobes forward / up / down + a few licks
      ak = (hk - 0.5) * 2.6 + (k == 4 ? 1.7 : 0.0) + (k == 5 ? -1.8 : 0.0) + (k == 6 ? PI * 0.75 : 0.0);
      lk = (0.16 + hl * 0.22) * (k == 6 ? 0.5 : 1.0); wk = 0.5 + hw * 0.35;
    } else if (set == 1) { // tight and round (pistols / M4 from behind), short licks all around
      ak = fk * 0.8976 + hk * 0.6; lk = 0.05 + hl * 0.12; wk = 0.45;
    } else if (set == 2) { // soft star: 5 even tongues
      ak = fk * 1.2566 + (hk - 0.5) * 0.7; lk = k < 5 ? (0.1 + hl * 0.26) * (hk > 0.55 ? 0.4 : 1.0) : 0.03; wk = 0.32 + hw * 0.2;
    } else {               // long forward tongue + side puffs
      ak = k == 0 ? 0.0 : k == 1 ? 0.5 : k == 2 ? -0.45 : k == 3 ? 1.8 : k == 4 ? -1.8 : k == 5 ? PI : 0.15;
      lk = k == 0 ? 0.52 : k < 3 ? 0.28 : k < 5 ? 0.16 : k == 5 ? 0.05 : 0.4; wk = k == 0 || k == 6 ? 0.22 : 0.45;
      ak += (hk - 0.5) * 0.3;
    }
    float da = abs(angDiff(a, ak)) / wk;
    lob = max(lob, lk * pow(max(0.0, 1.0 - da * 0.7), 1.7) * exp(-da * da * 0.3));
  }
  float R = (0.2 + 0.1 * max(cos(a), 0.0)) * (1.0 + fr * 0.13) + lob * (1.0 + fr * 0.22);
  R *= 1.0 + 0.18 * fbm3(vec2(a * 2.2, fr * 0.35) + sd);
  float t = ridge(qw * 3.4 + sd + vec2(-fr * 0.55, fr * 0.2));
  float n = fbm(qw * 4.0 + sd * 1.3 + vec2(-fr * 0.9, fr * 0.3));
  float rr = r / R + (0.55 - t) * 0.2;
  float d = smoothstep(1.0, 0.3, rr);
  d *= mix(1.0, 0.3 + 0.85 * t, smoothstep(0.2, 0.85, r / R));
  float ero = fr * 0.2;
  d = clamp((d - ero * (1.45 - t)) / (1.0 - ero * 0.6), 0.0, 1.0);
  temp = clamp(1.3 - (r / R) * 1.3 + (t - 0.55) * 0.6 + n * 0.25, 0.0, 1.0) * (1.0 - fr * 0.15);
  temp *= smoothstep(0.0, 0.25, d);
  return d * edgeFade(p);
}

#endif
#if defined(G_CONE) || defined(G_LA)
// Flame tongue / jet along +x from x = -0.92 (cone flames, side jets, long tongues)
float coneD(vec2 p, int v, out float temp) {
  float sd = float(v) * 13.0 + 1.0;
  vec2 q = p + 0.1 * vec2(fbm3(p * 3.0 + sd), fbm3(p * 3.0 + sd + 7.0));
  float x = (q.x + 0.92) / 1.84;
  float n = fbm(vec2(q.x * 3.0 - sd, q.y * 6.0));
  float halfW;
  float y = q.y;
  if (v == 2) halfW = 0.06 * pow(max(0.0, 1.0 - x), 0.6) + 0.015;
  else if (v == 3) { y = abs(q.y) - 0.13 * x; halfW = (0.05 + 0.1 * smoothstep(0.0, 0.4, x)) * (1.0 - smoothstep(0.5, 1.0, x) * 0.85); }
  else halfW = mix(0.08, v == 0 ? 0.32 : 0.24, smoothstep(0.0, 0.45, x)) * (1.0 - smoothstep(0.5, 1.0, x) * 0.85);
  float d = smoothstep(halfW, halfW * 0.3, abs(y)) * smoothstep(-0.02, 0.05, x) * smoothstep(1.0, 0.62, x + n * 0.18);
  d *= 0.75 + 0.25 * n;
  temp = clamp((1.05 - x * 0.95) * (1.0 - abs(y) / max(halfW, 1e-3) * 0.55) + n * 0.15, 0.0, 1.0) * smoothstep(0.0, 0.12, d);
  return d * edgeFade(p);
}

#endif
#if defined(G_FIRE) || defined(G_LA)
// Flame flipbook (8 frames, seamless loop): a wide burning base breaking into licking tongues that detach at
// the top. Noise scrolls upwards; the loop blends two time samples with a variance-preserving weight.
float fireN(vec2 P, float ph, float L) {
  float n0 = fbm(P - vec2(0.0, ph * L)), n1 = fbm(P - vec2(0.0, (ph - 1.0) * L));
  return (n0 * (1.0 - ph) + n1 * ph) / sqrt((1.0 - ph) * (1.0 - ph) + ph * ph);
}
float fireD(vec2 p, float fr, out float temp) {
  float ph = fr / 8.0;
  float yy = (p.y + 0.86) / 1.76;                       // 0 base .. 1 tip
  float n1 = fireN(vec2(p.x * 1.6, p.y * 1.1) + 11.0, ph, 2.6);
  float n2 = fireN(vec2(p.x * 4.2, p.y * 1.8) + 23.0, ph, 4.4);
  float n3 = fireN(vec2(p.x * 7.0, p.y * 4.0) + 37.0, ph, 8.0);
  float x = p.x + yy * (0.5 * n1 + 0.04 * sin(6.2832 * ph + p.y * 3.0));
  float w = 0.4 * sqrt(clamp(yy * 7.0, 0.0, 1.0)) * pow(max(0.0, 1.0 - yy), 0.6) + 0.01;
  float edge = 1.0 - abs(x) / w;
  float tear = clamp(n2 * 2.6 + 0.45, 0.0, 1.0) * pow(yy, 0.5);
  float f = edge * 0.9 - tear * 1.1 + 0.25 + n3 * 0.45 * (0.3 + yy);
  float d = smoothstep(0.0, 0.28, f) * smoothstep(-0.02, 0.24, yy);   // soft root: floor intersections never show a hard cut
  temp = clamp((1.0 - yy) * 0.75 + edge * 0.35 - tear * 0.35 + n3 * 0.08, 0.0, 1.0) * smoothstep(0.0, 0.2, d);
  return clamp(d, 0.0, 1.0) * edgeFade(p);
}

#endif
#if defined(G_PUFF) || defined(G_LA)
// Cauliflower smoke puff: metaballs + Worley bumps + fbm erosion (returns the raw field)
float puffF(vec2 p, float sd, float grain) {
  float f = 0.0;
  for (int k = 0; k < DYN(9); k++) {
    float fk = float(k);
    vec2 c = (h22(vec2(fk * 1.7, sd)) - 0.5) * vec2(0.85, 0.7) * (0.45 + 0.55 * fk / 8.0);
    float rad = mix(0.44, 0.2, fk / 8.0) * (0.85 + 0.3 * h11(fk + sd * 3.0));
    float dd = dot(p - c, p - c) / (rad * rad);
    float b = max(0.0, 1.0 - dd);
    f += b * b;
  }
  f += 0.14 * (1.0 - worley(p * 5.0 + sd)) * smoothstep(0.0, 0.3, f);
  f *= 0.82 + 0.34 * fbm3(p * 3.0 + sd);
  if (grain > 0.0) f *= 1.0 - grain + grain * (0.55 + 0.9 * fbm3(p * 14.0 + sd));
  return f;
}
#if defined(G_PUFF)
// Big billowy smoke body for the lit puff cells: fills the cell, the relief (cauliflower billows from two Worley
// scales) only shapes the lighting, the rim is feathered by the caller.
float billowF(vec2 p, float sd) {
  float f = 0.0;
  for (int k = 0; k < DYN(7); k++) {
    float fk = float(k);
    vec2 c = (h22(vec2(fk * 1.7, sd)) - 0.5) * vec2(0.95, 0.8) * (0.25 + 0.75 * fk / 6.0);
    float rad = mix(0.66, 0.3, fk / 6.0) * (0.85 + 0.3 * h11(fk + sd * 3.0));
    float dd = dot(p - c, p - c) / (rad * rad);
    float b = max(0.0, 1.0 - dd);
    f += b * b * (1.0 - 0.3 * fk / 6.0);
  }
  return f;
}
#endif

#endif
#if defined(G_LA) || defined(G_LB)
// ------------------------------------------------------------------ shapes
float star(vec2 p, float n, float len, float w, float sd) {
  float r = length(p), a = atan(p.y, p.x);
  float s = 0.0;
  for (int k = 0; k < DYN(8); k++) {
    if (float(k) >= n) break;
    float ak = float(k) / n * 2.0 * PI + (h11(float(k) + sd) - 0.5) * 0.4;
    float lk = len * (0.6 + 0.4 * h11(float(k) * 3.3 + sd));
    vec2 d = rot2(p, -ak);
    float t = clamp(d.x / lk, 0.0, 1.0);
    float ww = w * (1.0 - t) + 0.004;
    s = max(s, exp(-pow(d.y / ww, 2.0)) * (1.0 - t) * step(0.0, d.x));
  }
  return s;
}
float polyRock(vec2 p, float sd, float r0) {
  float a = atan(p.y, p.x), r = length(p);
  float R = r0 * (0.75 + 0.35 * fbm3(vec2(cos(a), sin(a)) * 1.3 + sd));
  float facet = floor((a + PI) / (2.0 * PI) * 7.0);
  R *= 0.9 + 0.2 * h11(facet + sd);
  return smoothstep(R, R - 0.03, r);
}

#endif
#if defined(G_SPRAY)
// ------------------------------------------------------------------ blood mist (CS2: an irregular, splattery,
// see-through cloud leaving the wound with radial streaks and fine specks; +x = bullet, wound at x = -0.76)
float bloodMist(vec2 p, float sd, out float thin) {
  vec2 o = vec2(-0.76, 0.0);
  vec2 w = vec2(fbm3(p * 2.0 + sd), fbm3(p * 2.0 + sd + 4.1));
  vec2 q = p - o + w * 0.14;
  float r = length(q), a = atan(q.y, q.x);
  // spray cone opening along +x, densest 0.2-0.7 from the wound, lumpy
  float cone = smoothstep(0.95, 0.3, abs(a)) * smoothstep(0.0, 0.18, r) * smoothstep(1.6, 0.55, r);
  float lump = 0.0;
  for (int k = 0; k < DYN(7); k++) {
    float fk = float(k);
    float dk = 0.2 + 0.9 * h11(fk * 3.7 + sd);
    float ak = (h11(fk * 5.1 + sd) - 0.5) * 1.1;
    vec2 c = vec2(cos(ak), sin(ak)) * dk;
    float rad = 0.2 + 0.2 * h11(fk * 9.3 + sd);
    float b = max(0.0, 1.0 - dot(q - c, q - c) / (rad * rad));
    lump += b * b;
  }
  float n = fbm(q * 4.0 + sd);
  float env = cone * (0.6 + 0.4 * n) + lump * 0.45;
  // fine radial streaks (liquid thrown out of the wound), low contrast
  float rays = gnoise(vec2(a * 18.0 + sd, r * 1.5 - sd)) * 0.6 + gnoise(vec2(a * 41.0 - sd, r * 3.0)) * 0.4;
  float d = smoothstep(0.12, 0.75, env + n * 0.15) * (0.62 + 0.38 * smoothstep(-0.35, 0.4, rays));
  // fine specks around the cloud
  float sp = 0.0;
  for (int k = 0; k < DYN(22); k++) {
    float fk = float(k);
    float ak = (h11(fk * 1.37 + sd) - 0.5) * 1.5;
    float dk = 0.3 + h11(fk * 4.21 + sd) * 1.1;
    vec2 dv = rot2(q - vec2(cos(ak), sin(ak)) * dk, -ak); dv.x *= 0.5;
    float rr = 0.008 + 0.014 * h11(fk * 7.7 + sd);
    sp = max(sp, smoothstep(rr, rr * 0.4, length(dv)));
  }
  d = max(d, sp * 0.85);
  thin = 1.0 - clamp(env, 0.0, 1.0);
  return clamp(d, 0.0, 1.0) * edgeFade(p);
}
// ------------------------------------------------------------------ blood spray (directional, +x)
float bloodSpray(vec2 p, float sd, float fr) {
  float s = 1.0 + fr * 0.14;
  vec2 q = vec2((p.x + 0.9) / s - 0.9, p.y / s);
  vec2 base = vec2(-0.86, 0.0);
  float x = q.x - base.x;
  float n = fbm(q * 5.0 + sd);
  float body = smoothstep(0.34, 0.05, length((q - vec2(-0.6, 0.0)) * vec2(0.85, 1.45)) + n * 0.12);
  float ang = atan(q.y, max(x, 1e-3));
  float sheet = smoothstep(0.55, 0.2, abs(ang)) * smoothstep(1.25, 0.25, x) * smoothstep(0.0, 0.08, x) * (0.45 + 0.55 * fbm(q * vec2(3.0, 9.0) + sd));
  float tend = 0.0;
  for (int k = 0; k < DYN(11); k++) {
    float fk = float(k);
    float ak = (h11(fk * 7.13 + sd) - 0.5) * 1.15;
    float len = 0.55 + h11(fk * 3.1 + sd) * 0.95;
    float curv = (h11(fk * 5.7 + sd) - 0.5) * 0.6;
    vec2 prev = base + vec2(0.08, 0.0);
    for (int j = 1; j <= DYN(5); j++) {
      float t = float(j) / 5.0;
      vec2 cur = base + vec2(0.08, 0.0) + vec2(cos(ak + curv * t), sin(ak + curv * t)) * len * t;
      float dist = sdSeg(q, prev, cur);
      float tt = (float(j) - 1.0 + segT(q, prev, cur)) / 5.0;
      float ww = 0.038 * pow(1.0 - tt, 0.8) + 0.004;
      tend = max(tend, smoothstep(ww, ww * 0.35, dist) * (1.0 - smoothstep(0.75, 1.0, tt) * 0.6));
      prev = cur;
    }
    vec2 tip = base + vec2(0.08, 0.0) + vec2(cos(ak + curv), sin(ak + curv)) * (len + 0.06 + fr * 0.05);
    tend = max(tend, smoothstep(0.022, 0.01, length(q - tip)));
  }
  float drops = 0.0;
  for (int k = 0; k < DYN(34); k++) {
    float fk = float(k);
    float ak = (h11(fk * 1.91 + sd * 2.0) - 0.5) * 1.3;
    float dist = 0.35 + h11(fk * 4.37 + sd) * 1.35 + fr * 0.12;
    float rr = 0.006 + h11(fk * 8.11 + sd) * 0.022;
    vec2 c = base + vec2(cos(ak), sin(ak)) * dist;
    vec2 dv = (q - c);
    dv = rot2(dv, -ak); dv.x *= 0.6;
    drops = max(drops, smoothstep(rr, rr * 0.5, length(dv)));
  }
  float a = max(max(body, sheet * 0.75), max(tend, drops));
  a *= mix(1.0, smoothstep(0.15, 0.65, n * 0.5 + 0.5 + 0.3 - fr * 0.18), fr / 3.0);
  return clamp(a, 0.0, 1.0) * edgeFade(p);
}

#endif
#if defined(G_DA) || defined(G_DB)
// ------------------------------------------------------------------ decals
// Returns colour in "half ratio" space (0.5 = surface unchanged, 0 = black, 1 = twice as bright) + coverage.
vec4 decal(int t, vec2 p, out float h, out float gl) {
  h = 0.0; gl = 0.0;
  float sd = float(t) * 11.0 + 5.0;
  float r = length(p), a = atan(p.y, p.x);
  vec2 ca = vec2(cos(a), sin(a));
  vec3 c = vec3(0.5);
  float cov = 0.0;
#if defined(G_DA)
  if (t == 0 || t == 1 || t == 12) { // concrete / plaster / tile: jagged chipped crater, dark irregular pit,
    // fresh (brighter) fractured facets, hairline radial cracks and a dusty powder stain around it (CS2)
    float big = t == 1 ? 1.25 : 1.0;
    float n1 = fbm(p * 6.0 + sd), n2 = fbm(p * 22.0 + sd * 2.0), n3 = fbm(p * 11.0 + sd * 3.1);
    float jag = fbm3(ca * 1.6 + sd) * 0.55 + fbm3(ca * 4.8 + sd * 1.7) * 0.4 + fbm3(ca * 11.0 + sd * 2.3) * 0.2;
    float pitR = 0.12 * big * (1.0 + 0.5 * fbm3(ca * 2.4 + sd * 0.7));
    float chipR = 0.4 * big * (1.0 + jag);
    float pit = smoothstep(pitR, pitR * 0.6, r + n2 * 0.03);
    float chip = smoothstep(chipR, chipR * 0.86, r + n2 * 0.05) * (1.0 - pit);
    // fracture lines between the chipped facets
    float fl = smoothstep(0.06, 0.0, abs(n3)) * chip * smoothstep(pitR, chipR, r) * 0.8;
    float cr = 0.0;
    for (int k = 0; k < DYN(6); k++) {
      float fk = float(k);
      float ak = fk * 1.047 + h11(fk + sd) * 0.9;
      vec2 d = rot2(p, -ak);
      float wob = fbm3(vec2(d.x * 7.0, fk * 3.0 + sd)) * 0.05;
      float len = (0.5 + 0.45 * h11(fk * 2.7 + sd)) * big;
      cr = max(cr, smoothstep(0.011, 0.0, abs(d.y + wob) - 0.004 * (1.0 - d.x / len)) * step(pitR * 0.8, d.x) * smoothstep(len, len * 0.45, d.x));
    }
    float halo = smoothstep(0.95, 0.2, r + n1 * 0.25) * (1.0 - chip) * (1.0 - pit);
    vec3 chipC = t == 1 ? vec3(0.9, 0.89, 0.86) : t == 12 ? vec3(0.82, 0.82, 0.8) : vec3(0.76, 0.75, 0.72);
    c = mix(c, chipC * (0.86 + 0.28 * (n3 * 0.5 + 0.5)) + n2 * 0.04, chip);
    c = mix(c, t == 1 ? vec3(0.56) : vec3(0.36), halo * 0.7);
    c = mix(c, vec3(0.3), max(fl, cr * (t == 12 ? 1.0 : 0.75)) * (1.0 - pit));
    c = mix(c, vec3(0.04 + 0.04 * n2), pit);
    cov = max(max(pit, chip), max(halo * 0.7, cr));
    h = -pit * 0.7 - chip * (0.28 + 0.14 * n3) - halo * 0.03 - cr * 0.05 - fl * 0.06;
  }
  if (t == 2 || t == 6) { // metal dent / exit petals
    float n2 = fbm(p * 18.0 + sd);
    float pit = smoothstep(0.14, 0.09, r);
    float ring = smoothstep(0.3, 0.23, r) * (1.0 - pit);
    float paint = smoothstep(0.45, 0.37, r + fbm3(ca * 3.0 + sd) * 0.1) * (1.0 - ring) * (1.0 - pit);
    c = mix(c, vec3(0.68), paint);
    c = mix(c, vec3(0.86, 0.85, 0.84) + n2 * 0.06, ring);
    c = mix(c, vec3(0.06), pit);
    if (t == 6) {
      float pet = 0.0;
      for (int k = 0; k < DYN(6); k++) {
        float ak = float(k) * 1.047 + h11(float(k) + sd) * 0.5;
        vec2 d = rot2(p, -ak);
        pet = max(pet, smoothstep(0.08, 0.02, abs(d.y) + d.x * 0.15) * step(0.06, d.x) * smoothstep(0.42, 0.3, d.x));
      }
      c = mix(c, vec3(0.92), pet);
      ring = max(ring, pet);
    }
    cov = max(max(pit, ring), paint);
    h = -0.5 * pow(max(0.0, 1.0 - r / 0.3), 2.0) + 0.08 * smoothstep(0.3, 0.25, r) * smoothstep(0.18, 0.25, r);
    gl = ring * 0.7;
  }
  if (t == 3) { // wood: hole + torn fibres along x
    vec2 q = p * vec2(0.62, 1.0);
    float rq = length(q);
    float n2 = fbm(vec2(p.x * 3.0, p.y * 40.0) + sd);
    float pit = smoothstep(0.15, 0.09, rq + fbm3(p * 12.0) * 0.025);
    float fib = smoothstep(0.5, 0.2, length(p * vec2(0.55, 2.4)) + n2 * 0.12) * (1.0 - pit);
    float streak = smoothstep(0.2, 0.7, sin(p.y * 140.0 + n2 * 6.0) * 0.5 + 0.5);
    c = mix(c, vec3(0.66, 0.62, 0.55) * (0.85 + 0.25 * streak), fib);
    c = mix(c, vec3(0.05), pit);
    cov = max(pit, fib);
    h = -pit * 0.6 - fib * 0.2 * streak;
  }
  if (t == 4) { // glass: hole, radial + concentric cracks
    float cr = 0.0;
    for (int k = 0; k < DYN(12); k++) {
      float ak = float(k) * 0.5236 + (h11(float(k) + sd) - 0.5) * 0.4;
      vec2 d = rot2(p, -ak);
      float wob = fbm3(vec2(d.x * 5.0, float(k) * 3.0)) * 0.06 * d.x;
      float len = 0.55 + 0.4 * h11(float(k) * 2.3 + sd);
      cr = max(cr, smoothstep(0.009, 0.002, abs(d.y + wob)) * step(0.0, d.x) * smoothstep(len, len * 0.6, d.x));
    }
    for (int k = 0; k < DYN(3); k++) {
      float rk = 0.22 + float(k) * 0.2 + fbm3(ca * 2.0 + float(k)) * 0.05;
      float arc = step(0.35, fbm3(ca * 1.7 + float(k) * 5.0 + sd) * 0.5 + 0.5);
      cr = max(cr, smoothstep(0.008, 0.002, abs(r - rk)) * arc * 0.8);
    }
    float pit = smoothstep(0.05, 0.03, r);
    float frost = smoothstep(0.16, 0.05, r) * 0.6;
    c = mix(c, vec3(0.9), max(cr, frost));
    c = mix(c, vec3(0.15), pit);
    cov = max(max(cr, frost), pit);
    h = -pit * 0.2 + cr * 0.05;
    gl = cr * 0.6;
  }
  if (t == 5) { // sand / dirt: soft crater, light rim (sand reads white), dark centre
    float n2 = fbm(p * 14.0 + sd);
    float crater = smoothstep(0.42, 0.1, r + n2 * 0.08);
    float rim = smoothstep(0.55, 0.38, r + n2 * 0.06) * smoothstep(0.18, 0.36, r);
    c = mix(c, vec3(0.62, 0.6, 0.56) + n2 * 0.05, rim);
    c = mix(c, vec3(0.36), crater * smoothstep(0.32, 0.0, r));
    cov = max(crater, rim);
    h = -crater * 0.35 + rim * 0.08 + n2 * 0.04 * cov;
  }
#endif
#if defined(G_DB)
  if (t >= 7 && t <= 9 || t == 14) { // directional blood splatter (+x = travel) / generic splat (CS2: a dense,
    // lumpy wet mass with many radiating fingers that end in bulbs, satellite droplets thrown further out and a
    // glossy raised relief)
    float n = fbm(p * 5.0 + sd), n2 = fbm(p * 14.0 + sd * 1.7);
    bool dirx = t != 14;
    float lng = t == 8 ? 1.35 : 1.0;                       // 8: long streaky spray, 9: short heavy splash
    vec2 bc = dirx ? vec2(-0.36 * lng, 0.0) : vec2(0.0);
    vec2 wq = p + 0.05 * vec2(fbm3(p * 6.0 + sd), fbm3(p * 6.0 + sd + 3.0));
    float m = 0.0;
    for (int k = 0; k < DYN(10); k++) {
      float fk = float(k);
      float hd = h11(fk * 3.3 + sd), ha = h11(fk * 5.7 + sd), hr = h11(fk * 8.9 + sd);
      float dk = dirx ? pow(hd, 1.4) * 0.42 * lng : pow(hd, 1.2) * 0.22;
      float ak = dirx ? (ha - 0.5) * (t == 8 ? 0.7 : 1.3) : ha * 2.0 * PI;
      vec2 c = bc + vec2(cos(ak) * dk, sin(ak) * dk * (dirx ? 0.8 : 1.0));
      float rad = (k == 0 ? 0.3 : 0.1 + 0.14 * hr) * (t == 9 ? 1.15 : 1.0) * (1.0 - dk * 0.5);
      float b = max(0.0, 1.0 - dot(wq - c, wq - c) / (rad * rad));
      m += b * b;
    }
    float blob = smoothstep(0.22, 0.42, m + n * 0.22);
    float fing = 0.0, tips = 0.0;
    int count = t == 9 ? 16 : 26;
    for (int k = 0; k < DYN(count); k++) {
      float fk = float(k);
      float spread = dirx ? (t == 8 ? 0.42 : 0.95) : PI;
      float ak = (h11(fk * 3.9 + sd) - 0.5) * 2.0 * spread;
      float len = (t == 8 ? 0.95 : t == 9 ? 0.45 : 0.62) * (0.35 + h11(fk * 7.7 + sd) * 0.75);
      float st = 0.12 + 0.1 * h11(fk * 2.1 + sd);               // starts inside the mass
      vec2 d = rot2(p - bc, -ak);
      float tt = clamp((d.x - st) / len, 0.0, 1.0);
      float ww = (t == 8 ? 0.034 : 0.045) * pow(1.0 - tt, 0.85) * (0.6 + 0.8 * h11(fk * 4.4 + sd)) + 0.005;
      float wob = fbm3(vec2(d.x * 5.0, fk * 1.7 + sd)) * 0.05 * tt;
      fing = max(fing, smoothstep(ww, ww * 0.35, abs(d.y + wob)) * step(st, d.x) * step(d.x, st + len));
      vec2 tip = bc + rot2(vec2(st + len + 0.02, -wob), ak);
      float tr = 0.016 + 0.018 * h11(fk * 6.1 + sd);
      tips = max(tips, smoothstep(tr, tr * 0.5, length(p - tip)));
    }
    float drops = 0.0;
    for (int k = 0; k < DYN(40); k++) {
      float fk = float(k);
      float ak = dirx ? (h11(fk * 1.3 + sd) - 0.5) * (t == 8 ? 0.9 : 1.9) : h11(fk * 1.3 + sd) * 2.0 * PI;
      float dist = (0.32 + h11(fk * 4.1 + sd) * 0.6) * (t == 9 ? 0.85 : 1.0) * lng;
      float rr = 0.006 + pow(h11(fk * 6.7 + sd), 2.0) * 0.03;
      vec2 dv = rot2(p - bc - vec2(cos(ak), sin(ak)) * dist, -ak);
      dv.x *= 0.5;
      drops = max(drops, smoothstep(rr, rr * 0.55, length(dv)));
    }
    float liquid = max(blob, max(fing, tips));
    cov = max(liquid, drops);
    // thick pooled centre darker, thin streaks lighter; wet relief with bulging rims
    float thick = blob * (0.75 + 0.25 * n2) + max(fing * 0.55, tips * 0.75);
    c = vec3(0.45 - 0.2 * thick);
    h = liquid * (0.18 + 0.08 * n2) + drops * 0.12 + blob * smoothstep(0.32, 0.8, m) * 0.1;
    gl = max(liquid, drops) * 0.95;
  }
  if (t == 10) { // scorch
    float rays = fbm3(vec2(a * 3.0, r * 2.0) + sd) * 0.5 + 0.5;
    float s = smoothstep(1.0, 0.0, r + (rays - 0.5) * 0.45 + fbm(p * 4.0 + sd) * 0.15);
    c = vec3(mix(0.5, 0.05, pow(s, 0.8)));
    cov = smoothstep(0.0, 0.25, s);
    h = -s * 0.05;
  }
  if (t == 11 || t == 15) { // pool / acid splotch
    float n = fbm(p * 3.0 + sd);
    float pool = smoothstep(0.6 + n * 0.25, 0.45 + n * 0.2, r);
    float bub = t == 15 ? smoothstep(0.35, 0.2, worley(p * 9.0 + sd)) * pool : 0.0;
    c = vec3(0.3 + bub * 0.2);
    cov = pool;
    h = pool * 0.2;
    gl = pool;
  }
#endif
#if defined(G_DA)
  if (t == 13) { // knife slash: parallel scratches along x
    float s = 0.0;
    for (int k = 0; k < DYN(3); k++) {
      float y0 = (float(k) - 1.0) * 0.07 + (h11(float(k) + sd) - 0.5) * 0.03;
      float wob = fbm3(vec2(p.x * 3.0, float(k) * 4.0)) * 0.02;
      float len = 0.8 - abs(float(k) - 1.0) * 0.2;
      s = max(s, smoothstep(0.012, 0.003, abs(p.y - y0 - wob)) * smoothstep(len, len - 0.2, abs(p.x)));
    }
    c = mix(c, vec3(0.72), s);
    cov = s;
    h = -s * 0.3;
    gl = s * 0.5;
  }
#endif
  float ef = edgeFade(p);
  return vec4(c, cov * ef);
}
#endif

vec4 fxCell(int t, vec2 p) {
  float r = length(p);
  float sd = uSeed;
#if defined(G_FLICK)
  if (t == 4 || t == 5 || t == 6 || t == 8) { float tp; float d = flickD(vec2(p.y, p.x), float(t) * 2.3 + 1.0, tp); return vec4(0.5, 0.5, tp, d); }  // rises along +x
#endif
#if defined(G_LA)
  if (t == 0) { // soft glow
    float a = pow(max(0.0, 1.0 - r), 2.4) * 0.62 + exp(-r * r * 22.0) * 0.38;
    return vec4(1.0, 1.0, 1.0, a);
  }
  if (t == 1 || t == 2 || t == 12) { // legacy puffs (plain, softly shaded)
    float f = puffF(p, float(t) * 7.0, t == 12 ? 0.6 : 0.0);
    float d = smoothstep(0.1, 0.75, f) * edgeFade(p);
    float shade = 0.82 + 0.18 * clamp(p.y + 0.3 * fbm3(p * 4.0), -1.0, 1.0);
    float v = t == 2 || t == 12 ? 0.8 : 1.0;
    return vec4(vec3(shade * v), d * 0.9);
  }
  if (t == 3) { // spark / tracer streak: head (right) bright, tail fades
    float u = p.x * 0.5 + 0.5;
    float w = mix(0.75, 1.0, u);
    float a = exp(-pow(p.y / (w * 0.5), 2.0)) * mix(0.12, 1.0, pow(u, 1.6)) * smoothstep(1.0, 0.9, p.x) * smoothstep(-1.0, -0.85, p.x);
    a = max(a, exp(-dot(p - vec2(0.84, 0.0), p - vec2(0.84, 0.0)) * 140.0));
    return vec4(1.0, 1.0, 1.0, a);
  }
  if (t == 7) { // drop
    float a = smoothstep(0.62, 0.42, r);
    float hl = 1.0 - smoothstep(0.0, 0.25, length(p - vec2(-0.18, 0.2))) * 0.3;
    return vec4(vec3(hl), a);
  }
  if (t == 10) { float tp; float d = fireD(p, 2.0, tp); return vec4(1.0, 1.0, 1.0, clamp(d * (0.4 + tp * 0.9), 0.0, 1.0)); }
  if (t == 11 || t == 62) { // shock rings
    float rr = t == 11 ? 0.78 : 0.86, w = t == 11 ? 0.16 : 0.05;
    float a = exp(-pow((r - rr) / w, 2.0)) + (t == 11 ? smoothstep(rr, 0.0, r) * 0.15 : 0.0);
    return vec4(1.0, 1.0, 1.0, clamp(a, 0.0, 1.0) * edgeFade(p));
  }
  if (t == 14) { // legacy hole
    float a = smoothstep(0.5, 0.15, r);
    return vec4(vec3(0.08 + 0.2 * smoothstep(0.1, 0.4, r)), a);
  }
  if (t == 15) { // legacy splat mask
    float n = fbm(p * 4.0 + sd);
    float a = smoothstep(0.55 + n * 0.2, 0.42, r);
    for (int k = 0; k < DYN(18); k++) { vec2 c = rot2(vec2(0.55 + h11(float(k)) * 0.35, 0.0), h11(float(k) * 3.1) * 6.283); a = max(a, smoothstep(0.06, 0.03, length(p - c))); }
    return vec4(1.0, 1.0, 1.0, a * edgeFade(p));
  }
#endif
#if defined(G_MUZZLE)
  if (t >= 16 && t < 32) { // muzzle cloud: 4 shapes x 4 frames
    int set = (t - 16) / 4; float fr = float((t - 16) - set * 4);
    float tp; float d = muzzleD(p * 0.6 - vec2(0.168, 0.0), set, fr, tp);   // zoomed: the cloud fills the cell, core stays at u = 0.29
    return vec4(0.5, 0.5, tp, d);
  }
#endif
#if defined(G_CONE)
  if (t >= 32 && t < 36) { float tp; float d = coneD(p, t - 32, tp); return vec4(0.5, 0.5, tp, d); }
#endif
#if defined(G_LB)
  if (t == 36) { // sharp 4-prong star
    float s = 0.0;
    for (int k = 0; k < DYN(4); k++) {
      vec2 d = rot2(p, -(float(k) * 1.5708 + 0.25 + (h11(float(k) + 3.0) - 0.5) * 0.3));
      float len = 0.75 + 0.2 * h11(float(k) * 2.0 + 1.0);
      float tt = clamp(d.x / len, 0.0, 1.0);
      s = max(s, exp(-pow(d.y / (0.09 * (1.0 - tt) + 0.005), 2.0)) * (1.0 - tt) * step(0.0, d.x));
    }
    float core = exp(-r * r * 28.0) + exp(-r * r * 5.0) * 0.3;
    return vec4(1.0, 1.0, 1.0, clamp(max(s, core), 0.0, 1.0) * edgeFade(p));
  }
  if (t == 37) { // birdcage prongs from the side
    vec2 b = vec2(-0.85, 0.0);
    float s = 0.0;
    for (int k = 0; k < DYN(4); k++) {
      float ak = (float(k) - 1.5) * 0.2 + (h11(float(k) + 9.0) - 0.5) * 0.08;
      vec2 d = rot2(p - b, -ak);
      float len = 1.45 + 0.25 * h11(float(k) * 2.0);
      float tt = clamp(d.x / len, 0.0, 1.0);
      s = max(s, exp(-pow(d.y / (0.05 * (1.0 - tt) + 0.006), 2.0)) * (1.0 - tt * tt) * step(0.0, d.x));
    }
    float core = exp(-dot(p - b, p - b) * 18.0);
    return vec4(1.0, 1.0, 1.0, clamp(max(s, core), 0.0, 1.0) * edgeFade(p));
  }
#endif
#if defined(G_FIRE)
  if (t >= 38 && t < 46) { float tp; float d = fireD(vec2(p.y, p.x), float(t - 38), tp); return vec4(0.5, 0.5, tp, d); }  // rises along +x
#endif
#if defined(G_SPRAY)
  if (t == 9 || t == 13) { // blood mist: RGB = thinness (thin = lighter / pinker), A = mask
    float th; float a = bloodMist(p, t == 9 ? 3.0 : 8.0, th);
    return vec4(vec3(0.7 + 0.3 * th), a);
  }
  if (t >= 46 && t < 50) { // blood spray: RGB = thinness shading, A = mask
    float a = bloodSpray(p, 7.0, float(t - 46));
    return vec4(vec3(0.75 + 0.25 * smoothstep(0.2, 1.0, (p.x + 0.9) / 1.8)), a);
  }
#endif
#if defined(G_PUFF)
  if (t >= 50 && t < 56) { // lit puffs: normal from the field gradient (screen derivatives = texel differences)
    float s = float(t) * 3.7;
    bool dusty = t >= 54;
    float f0, H0;
    if (dusty) { f0 = puffF(p * 0.8, s, 0.45); H0 = sqrt(max(f0, 0.0)); }
    else {
      f0 = billowF(p * 0.86, s);
      float bumps = fbm3(p * 2.6 + s) + 0.45 * fbm3(p * 5.5 + s * 1.3);
      H0 = sqrt(max(f0, 0.0)) * (0.85 + 0.35 * bumps);
    }
    vec2 g = vec2(dFdx(H0), dFdy(H0)) / uTexel;
    vec3 N = normalize(vec3(-g * (dusty ? 0.2 : 0.2), 1.0));
    // feathered, wispy rim: fbm erodes / extends the silhouette, the core stays dense
    float e = fbm(p * 2.8 + s) + 0.5 * fbm(p * 8.0 + s * 2.0);
    float fe = f0 + e * (dusty ? 0.38 : 0.62) * (1.0 - smoothstep(0.15, 0.9, f0));
    float d = smoothstep(0.03, dusty ? 0.6 : 0.75, fe);
    d = d * d * (3.0 - 2.0 * d) * edgeFade(p);
    // B: thickness / temperature, broken up by noise so fireball cores never read as round glowing balls
    float tn = clamp(fbm(p * 3.0 + s * 1.7) * 0.9 + 0.5, 0.0, 1.0);
    float th = dusty ? f0 * 0.7 : (0.25 + 0.6 * sqrt(clamp(f0, 0.0, 1.0))) * (0.4 + 1.0 * tn);
    return vec4(N.xy * 0.5 + 0.5, clamp(th, 0.0, 1.0), d);
  }
#endif
#if defined(G_LB)
  if (t == 58) { // rock chunk with shaded facets
    float a = polyRock(p, sd + 58.0, 0.62);
    float w = worley(p * 3.0 + sd);
    float shade = 0.6 + 0.4 * clamp(dot(normalize(vec2(p.x + 0.2, p.y + 0.4) + 0.001), vec2(0.4, 0.9)) * 0.5 + 0.5 - w * 0.3, 0.0, 1.0);
    return vec4(vec3(shade), a);
  }
  if (t == 62) { float a = exp(-pow((r - 0.86) / 0.05, 2.0)); return vec4(1.0, 1.0, 1.0, clamp(a, 0.0, 1.0) * edgeFade(p)); }
  if (t == 56) { // wood splinter (long, jagged)
    float x = p.x / 0.9;
    float w = 0.09 * (1.0 - pow(abs(x), 1.6)) + fbm3(vec2(p.x * 9.0, 2.0)) * 0.025;
    float a = smoothstep(w, w - 0.02, abs(p.y + fbm3(vec2(p.x * 3.0, 7.0)) * 0.04)) * step(abs(x), 1.0);
    float grain = 0.8 + 0.2 * sin(p.y * 90.0 + fbm3(p * 6.0) * 4.0);
    return vec4(vec3(grain), a);
  }
  if (t == 57) { // glass shard: bright edges
    vec2 A = vec2(-0.6, -0.45), B = vec2(0.65, -0.2), C = vec2(-0.1, 0.7);
    float e1 = sdSeg(p, A, B), e2 = sdSeg(p, B, C), e3 = sdSeg(p, C, A);
    float edge = min(e1, min(e2, e3));
    vec2 v0 = B - A, v1 = C - A, v2 = p - A;
    float d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1);
    float den = d00 * d11 - d01 * d01;
    float vv = (d11 * d20 - d01 * d21) / den, ww = (d00 * d21 - d01 * d20) / den;
    float inside = step(0.0, vv) * step(0.0, ww) * step(vv + ww, 1.0);
    float a = max(inside * 0.45, smoothstep(0.05, 0.0, edge));
    return vec4(vec3(0.6 + 0.4 * smoothstep(0.06, 0.0, edge)), a);
  }
  if (t == 59) { // dirt clod
    float a = polyRock(p * 1.1, sd + 3.0, 0.6);
    float shade = 0.75 + 0.25 * fbm3(p * 6.0) + 0.15 * p.y;
    return vec4(vec3(shade), a);
  }
  if (t == 60) { // water crown: column + spray fan + droplets, rising along +x (base at the left)
    p = vec2(p.y, p.x);
    float y = (p.y + 0.9) / 1.8;
    float col = smoothstep(0.12 * (1.0 - y) + 0.03, 0.02, abs(p.x + fbm3(vec2(p.y * 3.0, 1.0)) * 0.06)) * smoothstep(1.0, 0.55, y);
    float fan = 0.0;
    for (int k = 0; k < DYN(9); k++) {
      float ak = (float(k) - 4.0) * 0.17 + (h11(float(k)) - 0.5) * 0.1;
      vec2 d = rot2(p - vec2(0.0, -0.85), -(1.5708 + ak));
      float len = 1.2 + h11(float(k) * 3.0) * 0.4;
      float tt = clamp(d.x / len, 0.0, 1.0);
      fan = max(fan, smoothstep(0.04 * (1.0 - tt) + 0.008, 0.0, abs(d.y)) * step(0.0, d.x) * step(d.x, len) * (1.0 - tt * 0.6));
    }
    float drops = 0.0;
    for (int k = 0; k < DYN(20); k++) { vec2 c = vec2((h11(float(k) * 1.7) - 0.5) * 1.2, h11(float(k) * 2.9) * 1.4 - 0.4); drops = max(drops, smoothstep(0.035, 0.015, length(p - c))); }
    float a = clamp(max(max(col, fan * 0.8), drops), 0.0, 1.0) * edgeFade(p);
    return vec4(1.0, 1.0, 1.0, a);
  }
  if (t == 61) { // barrel smoke wisp: thin curly strand rising along +x
    p = vec2(p.y, p.x);
    float y = p.y;
    float x = 0.12 * sin(y * 3.2 + 1.3) + fbm3(vec2(1.7, y * 1.5)) * 0.22;
    float w = 0.05 + 0.06 * (y * 0.5 + 0.5);
    float a = smoothstep(w, 0.0, abs(p.x - x)) * smoothstep(-1.0, -0.6, y) * smoothstep(1.0, 0.4, y);
    a *= 0.7 + 0.3 * fbm3(vec2(p.x * 8.0, y * 4.0));
    return vec4(1.0, 1.0, 1.0, clamp(a, 0.0, 1.0));
  }
  if (t == 63) { // 4-point glint star
    vec2 q = abs(p);
    float a = exp(-q.y * 55.0) * exp(-q.x * 2.6) + exp(-q.x * 55.0) * exp(-q.y * 2.6);
    vec2 d = abs(rot2(p, 0.7854));
    a += (exp(-d.y * 70.0) * exp(-d.x * 6.0) + exp(-d.x * 70.0) * exp(-d.y * 6.0)) * 0.35;
    a += exp(-r * r * 40.0);
    return vec4(1.0, 1.0, 1.0, clamp(a, 0.0, 1.0) * edgeFade(p));
  }
#endif
  return vec4(0.0);
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
#if defined(G_DA) || defined(G_DB)
  float h, gl;
  vec4 c = decal(uType - 100, p, h, gl);
  vec2 g = vec2(dFdx(h), dFdy(h)) / uTexel;
  vec3 N = normalize(vec3(-g * 0.06, 1.0));
  gl_FragColor = uPass < 0.5 ? c : vec4(N.xy * 0.5 + 0.5, gl, 1.0);
#else
  gl_FragColor = fxCell(uType, p);
#endif
}`;

const GROUPS = ['G_LA', 'G_LB', 'G_MUZZLE', 'G_CONE', 'G_FIRE', 'G_FLICK', 'G_SPRAY', 'G_PUFF', 'G_DA', 'G_DB'];
function groupOf(i) {
  if (i === 4 || i === 5 || i === 6 || i === 8) return 'G_FLICK';
  if (i === 9 || i === 13) return 'G_SPRAY';
  return i >= 16 && i < 32 ? 'G_MUZZLE' : i >= 32 && i < 36 ? 'G_CONE' : i >= 38 && i < 46 ? 'G_FIRE' : i >= 46 && i < 50 ? 'G_SPRAY' : i >= 50 && i < 56 ? 'G_PUFF' : i < 16 ? 'G_LA' : 'G_LB';
}
function decalGroup(t) { return (t >= 7 && t <= 11) || t === 14 || t === 15 ? 'G_DB' : 'G_DA'; }

// ------------------------------------------------------------------ ramps (HDR, linear)
const RAMPS = [
  // gunfire (06a §6)
  [[0, [0, 0, 0]], [0.2, [0.55, 0.15, 0.04]], [0.4, [1.6, 0.55, 0.14]], [0.6, [3.4, 1.5, 0.45]], [0.8, [6, 3.6, 1.4]], [1, [9, 7.4, 4.6]]],
  // explosion fireball: peach-white -> orange -> red-brown
  [[0, [0, 0, 0]], [0.18, [0.35, 0.1, 0.03]], [0.4, [1.4, 0.45, 0.12]], [0.6, [4, 1.9, 0.6]], [0.8, [8, 5, 2.4]], [1, [14, 12, 9]]],
  // molotov flames
  [[0, [0, 0, 0]], [0.22, [0.7, 0.16, 0.03]], [0.48, [2.6, 1.0, 0.2]], [0.74, [5, 3, 0.9]], [1, [8, 7, 4.5]]],
  // blue energy
  [[0, [0, 0, 0]], [0.15, [0.05, 0.15, 1.0]], [0.4, [0.3, 0.8, 4]], [0.7, [1.5, 3, 9]], [1, [6, 8, 10]]],
  // green plasma
  [[0, [0, 0, 0]], [0.15, [0.05, 0.6, 0.05]], [0.4, [0.4, 2.4, 0.2]], [0.7, [2, 6, 1]], [1, [7, 10, 6]]],
  // purple
  [[0, [0, 0, 0]], [0.15, [0.3, 0.05, 0.8]], [0.4, [1.4, 0.3, 3]], [0.7, [4, 1.5, 7]], [1, [9, 7, 10]]],
  // red (charged)
  [[0, [0, 0, 0]], [0.15, [0.6, 0.03, 0.02]], [0.4, [2.6, 0.3, 0.1]], [0.7, [7, 1.6, 0.6]], [1, [10, 7, 5]]],
  // gold
  [[0, [0, 0, 0]], [0.15, [0.5, 0.25, 0.05]], [0.4, [2.4, 1.4, 0.3]], [0.7, [6, 4.2, 1.4]], [1, [10, 9, 6]]],
];

function buildRamp() {
  const W = 256, Hh = RAMPS.length;
  const data = new Uint16Array(W * Hh * 4);
  for (let row = 0; row < Hh; row++) {
    const keys = RAMPS[row];
    for (let i = 0; i < W; i++) {
      const t = i / (W - 1);
      let k = 0;
      while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
      const [t0, c0] = keys[k], [t1, c1] = keys[k + 1];
      const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
      const o = (row * W + i) * 4;
      for (let c = 0; c < 3; c++) data[o + c] = THREE.DataUtils.toHalfFloat(c0[c] + (c1[c] - c0[c]) * u);
      data[o + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  const tex = new THREE.DataTexture(data, W, Hh, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeRT(w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, stencilBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  rt.texture.colorSpace = THREE.NoColorSpace;
  rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  rt.texture.anisotropy = 4;
  return rt;
}


/**
 * Builds the effect textures on the GPU. gl: THREE.WebGLRenderer. size: FX atlas size (2048 or 1024).
 * The generator programs compile in parallel in the background (KHR_parallel_shader_compile through
 * renderer.compileAsync) so loading never stalls on slow shader compilers (ANGLE / D3D11); the atlases are
 * transparent until `ready` resolves (a few hundred ms on phones).
 * Returns { fx, decal, ramp, cell, decalCell, size, ready (Promise), ms, regenerate(), debugURL(), dispose() }.
 */
export function buildAtlases(gl, { size = 2048, sync = false } = {}) {
  const cell = size / COLS;
  const dSize = size >= 2048 ? 1024 : 512;           // decal atlas height; width = 2x (colour | normal)
  const dCell = dSize / 4;
  const fxRT = makeRT(size, size);
  const decalRT = makeRT(dSize * 2, dSize);
  const u = { uType: { value: 0 }, uSeed: { value: 0 }, uFrame: { value: 0 }, uPass: { value: 0 }, uTexel: { value: 2 / cell }, uOne: { value: 1 } };
  const mats = {};
  const scratch = new THREE.Scene();
  const plane = new THREE.PlaneGeometry(2, 2);
  for (const gname of GROUPS) {
    mats[gname] = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, defines: { [gname]: 1 }, depthTest: false, depthWrite: false, blending: THREE.NoBlending, uniforms: u });
    const m = new THREE.Mesh(plane, mats[gname]);
    m.frustumCulled = false;
    scratch.add(m);
  }
  const quad = new FullScreenQuad(mats.G_LA);
  const state = { ms: 0, compileMs: 0, done: false };

  const withTarget = (fn) => {
    const prevRT = gl.getRenderTarget();
    const prevAuto = gl.autoClear;
    const prevCC = gl.getClearColor(new THREE.Color()), prevCA = gl.getClearAlpha();
    gl.autoClear = false;
    try { fn(); } finally {
      gl.setRenderTarget(prevRT);
      gl.autoClear = prevAuto;
      gl.setClearColor(prevCC, prevCA);
    }
  };
  // allocate (full mip chains) and clear to transparent right away
  const init = () => withTarget(() => {
    for (const rt of [fxRT, decalRT]) {
      rt.texture.generateMipmaps = true; gl.initRenderTarget(rt);
      gl.setRenderTarget(rt); gl.setClearColor(0x000000, 0); gl.clear(true, false, false);
      rt.texture.generateMipmaps = false;
    }
  });
  const generate = () => withTarget(() => {
    const t0 = performance.now();
    for (const rt of [fxRT, decalRT]) { rt.texture.generateMipmaps = true; gl.initRenderTarget(rt); rt.texture.generateMipmaps = false; }
    gl.setRenderTarget(fxRT);
    gl.setClearColor(0x000000, 0); gl.clear(true, false, false);
    for (let i = 0; i < COLS * COLS; i++) {
      const cx = i % COLS, cy = Math.floor(i / COLS);
      quad.material = mats[groupOf(i)];
      fxRT.viewport.set(cx * cell, (COLS - 1 - cy) * cell, cell, cell);
      fxRT.scissor.copy(fxRT.viewport); fxRT.scissorTest = true;
      u.uType.value = i; u.uSeed.value = i * 1.37; u.uFrame.value = 0; u.uPass.value = 0; u.uTexel.value = 2 / cell;
      if (i === COLS * COLS - 1) fxRT.texture.generateMipmaps = true;   // mip chain built once, after the last cell
      gl.setRenderTarget(fxRT);
      quad.render(gl);
    }
    fxRT.scissorTest = false; fxRT.viewport.set(0, 0, size, size);
    gl.setRenderTarget(decalRT);
    gl.clear(true, false, false);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 16; i++) {
        const cx = i % 4, cy = Math.floor(i / 4);
        quad.material = mats[decalGroup(i)];
        decalRT.viewport.set(pass * dSize + cx * dCell, (3 - cy) * dCell, dCell, dCell);
        decalRT.scissor.copy(decalRT.viewport); decalRT.scissorTest = true;
        u.uType.value = 100 + i; u.uSeed.value = i; u.uPass.value = pass; u.uTexel.value = 2 / dCell;
        if (pass === 1 && i === 15) decalRT.texture.generateMipmaps = true;
        gl.setRenderTarget(decalRT);
        quad.render(gl);
      }
    }
    decalRT.scissorTest = false; decalRT.viewport.set(0, 0, dSize * 2, dSize);
    state.ms = performance.now() - t0;
    state.done = true;
  });

  init();
  const tc = performance.now();
  const cam = new THREE.Camera();
  const ready = sync || !gl.compileAsync
    ? Promise.resolve().then(generate)
    : gl.compileAsync(scratch, cam).catch(() => {}).then(() => { state.compileMs = performance.now() - tc; generate(); });
  if (sync) generate();

  return {
    fx: fxRT.texture, decal: decalRT.texture, ramp: buildRamp(), cell, decalCell: dCell, size, ready,
    get ms() { return state.ms; }, get compileMs() { return state.compileMs; }, get done() { return state.done; },
    regenerate: generate,
    /** Dev: PNG data URL of an atlas ('fx' | 'decal' | 'fxramp': temperature cells through the gunfire ramp)
     *  for visual QA (alpha shown over a checker). */
    debugURL(which = 'fx') {
      const rt = which === 'decal' ? decalRT : fxRT;
      const keys = RAMPS[which === 'fxramp' ? 0 : 0];
      const rampAt = (T, c) => { let k = 0; while (k < keys.length - 2 && T > keys[k + 1][0]) k++; const [t0, c0] = keys[k], [t1, c1] = keys[k + 1]; const u = Math.min(1, Math.max(0, (T - t0) / (t1 - t0))); return c0[c] + (c1[c] - c0[c]) * u; };
      const aces = (x) => Math.max(0, Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
      const volCell = (x, y) => { const i = Math.floor(x / cell) + COLS * Math.floor(y / cell); return (i >= 16 && i < 36) || (i >= 38 && i < 46) || i === 4 || i === 5 || i === 6 || i === 8; };
      const w = rt.width, h = rt.height;
      const px = new Uint8Array(w * h * 4);
      gl.readRenderTargetPixels(rt, 0, 0, w, h, px);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d');
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4;
          const a = which === 'decal' && x >= w / 2 ? 1 : px[s + 3] / 255, bg = ((x >> 4) + (y >> 4)) & 1 ? 40 : 70;
          if (which === 'fxramp' && volCell(x, y)) { for (let c = 0; c < 3; c++) img.data[d + c] = 255 * aces(rampAt(px[s + 2] / 255, c) * 0.6) * a + bg * (1 - a); }
          else for (let c = 0; c < 3; c++) img.data[d + c] = px[s + c] * a + bg * (1 - a);
          img.data[d + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return cv.toDataURL('image/png');
    },
    dispose() { fxRT.dispose(); decalRT.dispose(); for (const m of Object.values(mats)) m.dispose(); plane.dispose(); quad.dispose(); },
  };
}