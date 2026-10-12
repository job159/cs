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
  glow: 0, smoke: 1, smoke2: 2, spark: 3, flash: 4, flash2: 5, flashSide: 6, drop: 7,
  mist: 8, chunk: 9, flame: 10, ring: 11, dust: 12, ember: 13, hole: 14, splat: 15,
  // ---- CS2-style cells
  muzzle: 16,   // 4 shapes x 4 frames (16 + shape * 4 + frame); front view of the flash cloud, core at u = 0.29
  cone: 32,     // 4 side flames / tongues: +x forward, base at u = 0.04 (0, 1 cones, 2 thin prong, 3 split)
  star4: 36,    // sharp 4-prong star (third person, from the front)
  prongs: 37,   // birdcage side view: 4 thin prongs fanning forward (+x)
  fire: 38,     // 8-frame rising flame flipbook (ramp), base at the bottom
  spray: 46,    // 4-frame directional blood spray, +x = bullet direction, base at u = 0.05
  puff: 50,     // 4 lit smoke puffs (normal + thickness + density)
  dusty: 54,    // 2 lit dust puffs (denser, grainier)
  splinter: 56, shard: 57, rock: 58, clod: 59,
  splash: 60,   // water crown, base at the bottom
  wisp: 61,     // thin curly barrel-smoke strand (vertical)
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
varying vec2 vUv;
#define PI 3.14159265

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
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * gnoise(p); p = ROT * p + 3.1; a *= 0.5; } return s; }
float fbm3(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * gnoise(p); p = ROT * p + 3.1; a *= 0.5; } return s; }
float worley(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); d = min(d, length(g + h22(i + g) - f)); }
  return d;
}
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float segT(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); }
float angDiff(float a, float b) { return mod(a - b + PI, 2.0 * PI) - PI; }
float edgeFade(vec2 p) { vec2 q = abs(p); return smoothstep(1.0, 0.86, max(q.x, q.y)); }
vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

// ------------------------------------------------------------------ volumetric fields
// Muzzle flash cloud, seen from behind/oblique: hot core at (-0.42, 0), blunt tongues, turbulent body.
float muzzleD(vec2 p, int set, float fr, out float temp) {
  float sd = float(set) * 17.0 + 3.0;
  vec2 q = p - vec2(-0.42, 0.0);
  vec2 w = vec2(fbm3(q * 2.3 + sd + vec2(0.0, fr * 0.7)), fbm3(q * 2.3 + sd + 9.2 + vec2(fr * 0.7, 0.0)));
  q += w * (0.08 + 0.04 * fr);
  float r = length(q), a = atan(q.y, q.x);
  float lob = 0.0;
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float hk = h11(fk * 3.7 + sd), hl = h11(fk * 9.1 + sd), hw = h11(fk * 5.3 + sd);
    float ak, lk, wk;
    if (set == 0) {        // fluffy (AK): big lobes forward / up / down
      ak = (hk - 0.5) * 2.4 + (k == 4 ? 1.6 : 0.0) + (k == 5 ? -1.7 : 0.0);
      lk = 0.2 + hl * 0.2; wk = 0.45 + hw * 0.2;
    } else if (set == 1) { // tight and round (pistols / M4 from behind)
      ak = fk * 1.047 + hk * 0.8; lk = 0.06 + hl * 0.1; wk = 0.55;
    } else if (set == 2) { // soft star: 5 even tongues
      ak = fk * 1.2566 + (hk - 0.5) * 0.5; lk = k < 5 ? 0.26 + hl * 0.16 : 0.0; wk = 0.2 + hw * 0.1;
    } else {               // long forward tongue + side puffs
      ak = k == 0 ? 0.0 : k == 1 ? 0.5 : k == 2 ? -0.45 : k == 3 ? 1.8 : k == 4 ? -1.8 : PI;
      lk = k == 0 ? 0.5 : k < 3 ? 0.26 : k < 5 ? 0.16 : 0.06; wk = k == 0 ? 0.3 : 0.4;
      ak += (hk - 0.5) * 0.3;
    }
    lob = max(lob, lk * exp(-pow(angDiff(a, ak) / wk, 2.0)));
  }
  float R = (0.22 + 0.12 * max(cos(a), 0.0)) * (1.0 + fr * 0.12) + lob * (1.0 + fr * 0.2);
  R *= 1.0 + 0.16 * fbm3(vec2(a * 1.7, fr * 0.4) + sd);
  float n = fbm(q * 4.2 + sd * 1.3 + vec2(-fr * 0.9, fr * 0.3));
  float rr = r / R;
  float d = smoothstep(1.0, 0.22, rr) * (0.68 + 0.32 * n);
  float ero = fr * 0.17;
  d = clamp((d - ero) / (1.0 - ero), 0.0, 1.0);
  temp = clamp(1.25 - rr * 1.1 + n * 0.25, 0.0, 1.0) * (1.0 - fr * 0.14);
  temp *= smoothstep(0.0, 0.2, d);
  return d * edgeFade(p);
}

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

// Rising flame flipbook (8 frames): base at the bottom, licks and detaches at the top
float fireD(vec2 p, float fr, out float temp) {
  float ph = fr / 8.0;
  vec2 q = p;
  float yy = (q.y + 0.88) / 1.8;
  vec2 w = vec2(fbm3(vec2(q.x * 2.2, q.y * 1.8 - ph * 3.0) + 3.0), fbm3(vec2(q.x * 2.2 + 5.0, q.y * 1.8 - ph * 3.0)));
  q.x += w.x * 0.28 * yy;
  float halfW = 0.46 * pow(max(0.0, 1.0 - yy), 0.85) * smoothstep(-0.05, 0.14, yy) + 0.02;
  float n = fbm(vec2(q.x * 3.2, q.y * 2.6 - ph * 4.5) + 11.0);
  float d = smoothstep(halfW * 1.05, halfW * 0.25, abs(q.x)) * smoothstep(-0.03, 0.04, yy);
  d *= smoothstep(1.0, 0.0, yy * 1.2 + n * 0.45 - 0.22);
  d *= 0.7 + 0.3 * n;
  temp = clamp(1.15 - yy * 1.15 - abs(q.x) / max(halfW, 0.01) * 0.45 + n * 0.22, 0.0, 1.0) * smoothstep(0.0, 0.1, d);
  return clamp(d, 0.0, 1.0) * edgeFade(p);
}

// Cauliflower smoke puff: metaballs + Worley bumps + fbm erosion (returns the raw field)
float puffF(vec2 p, float sd, float grain) {
  float f = 0.0;
  for (int k = 0; k < 9; k++) {
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

// ------------------------------------------------------------------ shapes
float star(vec2 p, float n, float len, float w, float sd) {
  float r = length(p), a = atan(p.y, p.x);
  float s = 0.0;
  for (int k = 0; k < 8; k++) {
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
  for (int k = 0; k < 11; k++) {
    float fk = float(k);
    float ak = (h11(fk * 7.13 + sd) - 0.5) * 1.15;
    float len = 0.55 + h11(fk * 3.1 + sd) * 0.95;
    float curv = (h11(fk * 5.7 + sd) - 0.5) * 0.6;
    vec2 prev = base + vec2(0.08, 0.0);
    for (int j = 1; j <= 5; j++) {
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
  for (int k = 0; k < 34; k++) {
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

// ------------------------------------------------------------------ decals
// Returns colour in "half ratio" space (0.5 = surface unchanged, 0 = black, 1 = twice as bright) + coverage.
vec4 decal(int t, vec2 p, out float h, out float gl) {
  h = 0.0; gl = 0.0;
  float sd = float(t) * 11.0 + 5.0;
  float r = length(p), a = atan(p.y, p.x);
  vec2 ca = vec2(cos(a), sin(a));
  vec3 c = vec3(0.5);
  float cov = 0.0;
  if (t == 0 || t == 1 || t == 12) { // concrete / plaster / tile
    float big = t == 1 ? 1.3 : 1.0;
    float n1 = fbm(p * 6.0 + sd), n2 = fbm(p * 22.0 + sd * 2.0);
    float pitR = 0.12 * big * (1.0 + 0.3 * fbm3(ca * 1.5 + sd));
    float chipR = 0.34 * big * (1.0 + 0.4 * fbm3(ca * 2.2 + sd * 3.0));
    float pit = smoothstep(pitR, pitR * 0.55, r + n2 * 0.02);
    float chip = smoothstep(chipR, chipR * 0.8, r + n2 * 0.05) * (1.0 - pit);
    float halo = smoothstep(0.9, 0.25, r + n1 * 0.2) * (1.0 - chip) * (1.0 - pit);
    vec3 chipC = t == 1 ? vec3(0.74, 0.73, 0.71) : t == 12 ? vec3(0.7, 0.7, 0.68) : vec3(0.63, 0.62, 0.6);
    c = mix(c, chipC + n2 * 0.05, chip);
    c = mix(c, t == 1 ? vec3(0.56) : vec3(0.42), halo * 0.65);
    c = mix(c, vec3(0.05 + 0.04 * n2), pit);
    if (t == 12) { // radial glaze cracks
      float cr = 0.0;
      for (int k = 0; k < 7; k++) {
        float ak = float(k) * 0.9 + h11(float(k) + sd) * 0.8;
        vec2 d = rot2(p, -ak);
        float wob = fbm3(vec2(d.x * 6.0, float(k))) * 0.05;
        cr = max(cr, smoothstep(0.012, 0.003, abs(d.y + wob)) * step(0.0, d.x) * smoothstep(0.85, 0.3, d.x));
      }
      c = mix(c, vec3(0.2), cr * (1.0 - pit));
      chip = max(chip, cr);
    }
    cov = max(max(pit, chip), halo * 0.7);
    h = -pit * 0.7 - chip * (0.3 + 0.12 * n2) - halo * 0.03;
  } else if (t == 2 || t == 6) { // metal dent / exit petals
    float n2 = fbm(p * 18.0 + sd);
    float pit = smoothstep(0.1, 0.06, r);
    float ring = smoothstep(0.24, 0.18, r) * (1.0 - pit);
    float paint = smoothstep(0.36, 0.3, r + fbm3(ca * 3.0 + sd) * 0.08) * (1.0 - ring) * (1.0 - pit);
    c = mix(c, vec3(0.6), paint);
    c = mix(c, vec3(0.86, 0.85, 0.84) + n2 * 0.06, ring);
    c = mix(c, vec3(0.06), pit);
    if (t == 6) {
      float pet = 0.0;
      for (int k = 0; k < 6; k++) {
        float ak = float(k) * 1.047 + h11(float(k) + sd) * 0.5;
        vec2 d = rot2(p, -ak);
        pet = max(pet, smoothstep(0.08, 0.02, abs(d.y) + d.x * 0.15) * step(0.06, d.x) * smoothstep(0.42, 0.3, d.x));
      }
      c = mix(c, vec3(0.92), pet);
      ring = max(ring, pet);
    }
    cov = max(max(pit, ring), paint);
    h = -0.5 * pow(max(0.0, 1.0 - r / 0.24), 2.0) + 0.08 * smoothstep(0.24, 0.2, r) * smoothstep(0.14, 0.2, r);
    gl = ring * 0.7;
  } else if (t == 3) { // wood: hole + torn fibres along x
    vec2 q = p * vec2(0.62, 1.0);
    float rq = length(q);
    float n2 = fbm(vec2(p.x * 3.0, p.y * 40.0) + sd);
    float pit = smoothstep(0.11, 0.06, rq + fbm3(p * 12.0) * 0.02);
    float fib = smoothstep(0.5, 0.2, length(p * vec2(0.55, 2.4)) + n2 * 0.12) * (1.0 - pit);
    float streak = smoothstep(0.2, 0.7, sin(p.y * 140.0 + n2 * 6.0) * 0.5 + 0.5);
    c = mix(c, vec3(0.66, 0.62, 0.55) * (0.85 + 0.25 * streak), fib);
    c = mix(c, vec3(0.05), pit);
    cov = max(pit, fib);
    h = -pit * 0.6 - fib * 0.2 * streak;
  } else if (t == 4) { // glass: hole, radial + concentric cracks
    float cr = 0.0;
    for (int k = 0; k < 12; k++) {
      float ak = float(k) * 0.5236 + (h11(float(k) + sd) - 0.5) * 0.4;
      vec2 d = rot2(p, -ak);
      float wob = fbm3(vec2(d.x * 5.0, float(k) * 3.0)) * 0.06 * d.x;
      float len = 0.55 + 0.4 * h11(float(k) * 2.3 + sd);
      cr = max(cr, smoothstep(0.009, 0.002, abs(d.y + wob)) * step(0.0, d.x) * smoothstep(len, len * 0.6, d.x));
    }
    for (int k = 0; k < 3; k++) {
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
  } else if (t == 5) { // sand / dirt: soft crater, light rim (sand reads white), dark centre
    float n2 = fbm(p * 14.0 + sd);
    float crater = smoothstep(0.42, 0.1, r + n2 * 0.08);
    float rim = smoothstep(0.55, 0.38, r + n2 * 0.06) * smoothstep(0.18, 0.36, r);
    c = mix(c, vec3(0.62, 0.6, 0.56) + n2 * 0.05, rim);
    c = mix(c, vec3(0.36), crater * smoothstep(0.32, 0.0, r));
    cov = max(crater, rim);
    h = -crater * 0.35 + rim * 0.08 + n2 * 0.04 * cov;
  } else if (t >= 7 && t <= 9 || t == 14) { // directional blood (+x) / generic splat
    float v = float(t - 7);
    float n = fbm(p * 5.0 + sd);
    vec2 bc = t == 14 ? vec2(0.0) : vec2(-0.38, 0.0);
    float blob = smoothstep(0.3 + n * 0.08, 0.18, length((p - bc) * vec2(t == 8 ? 0.8 : 1.0, t == 8 ? 1.6 : 1.1)));
    float fing = 0.0;
    int count = t == 9 ? 6 : 12;
    for (int k = 0; k < 12; k++) {
      if (k >= count) break;
      float fk = float(k);
      float spread = t == 14 ? PI : (t == 8 ? 0.35 : 0.75);
      float ak = (h11(fk * 3.9 + sd) - 0.5) * 2.0 * spread;
      float len = (t == 8 ? 0.85 : 0.55) * (0.5 + h11(fk * 7.7 + sd) * 0.7);
      vec2 d = rot2(p - bc, -ak);
      float tt = clamp(d.x / len, 0.0, 1.0);
      float ww = (t == 8 ? 0.05 : 0.07) * pow(1.0 - tt, 0.7) + 0.006;
      float wob = fbm3(vec2(d.x * 4.0, fk)) * 0.04;
      fing = max(fing, smoothstep(ww, ww * 0.4, abs(d.y + wob)) * step(0.0, d.x) * step(d.x, len));
      vec2 tip = bc + vec2(cos(ak), sin(ak)) * (len + 0.05);
      fing = max(fing, smoothstep(0.03, 0.015, length(p - tip)));
    }
    float drops = 0.0;
    for (int k = 0; k < 26; k++) {
      float fk = float(k);
      float ak = t == 14 ? h11(fk * 1.3 + sd) * 2.0 * PI : (h11(fk * 1.3 + sd) - 0.5) * (t == 8 ? 0.8 : 1.6);
      float dist = 0.3 + h11(fk * 4.1 + sd) * 0.6;
      float rr = 0.008 + h11(fk * 6.7 + sd) * 0.025;
      vec2 dv = rot2(p - bc - vec2(cos(ak), sin(ak)) * dist, -ak);
      dv.x *= 0.55;
      drops = max(drops, smoothstep(rr, rr * 0.55, length(dv)));
    }
    float mist = t == 9 ? smoothstep(0.75, 0.0, length(p - bc)) * smoothstep(0.55, 0.75, fbm(p * 26.0 + sd) * 0.5 + 0.5) : 0.0;
    cov = max(max(blob, fing), max(drops, mist));
    float thick = max(blob, fing * 0.7) * (0.75 + 0.25 * n);
    c = vec3(0.44 - 0.17 * thick);
    h = thick * 0.25 + drops * 0.12;
    gl = max(thick, drops) * 0.9;
  } else if (t == 10) { // scorch
    float rays = fbm3(vec2(a * 3.0, r * 2.0) + sd) * 0.5 + 0.5;
    float s = smoothstep(1.0, 0.0, r + (rays - 0.5) * 0.45 + fbm(p * 4.0 + sd) * 0.15);
    c = vec3(mix(0.5, 0.05, pow(s, 0.8)));
    cov = smoothstep(0.0, 0.25, s);
    h = -s * 0.05;
  } else if (t == 11 || t == 15) { // pool / acid splotch
    float n = fbm(p * 3.0 + sd);
    float pool = smoothstep(0.6 + n * 0.25, 0.45 + n * 0.2, r);
    float bub = t == 15 ? smoothstep(0.35, 0.2, worley(p * 9.0 + sd)) * pool : 0.0;
    c = vec3(0.3 + bub * 0.2);
    cov = pool;
    h = pool * 0.2;
    gl = pool;
  } else if (t == 13) { // knife slash: parallel scratches along x
    float s = 0.0;
    for (int k = 0; k < 3; k++) {
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
  float ef = edgeFade(p);
  return vec4(c, cov * ef);
}

vec4 fxCell(int t, vec2 p) {
  float r = length(p);
  float sd = uSeed;
  if (t == 0) { // soft glow
    float a = pow(max(0.0, 1.0 - r), 2.4) * 0.62 + exp(-r * r * 22.0) * 0.38;
    return vec4(1.0, 1.0, 1.0, a);
  }
  if (t == 1 || t == 2 || t == 8 || t == 12) { // legacy puffs (plain, softly shaded)
    float f = puffF(p * (t == 8 ? 0.85 : 1.0), float(t) * 7.0, t == 12 ? 0.6 : 0.0);
    float d = smoothstep(0.1, t == 8 ? 1.1 : 0.75, f) * edgeFade(p);
    float shade = 0.82 + 0.18 * clamp(p.y + 0.3 * fbm3(p * 4.0), -1.0, 1.0);
    float v = t == 2 || t == 12 ? 0.8 : 1.0;
    return vec4(vec3(shade * v), d * (t == 8 ? 0.8 : 0.9));
  }
  if (t == 3) { // spark / tracer streak: head (right) bright, tail fades
    float u = p.x * 0.5 + 0.5;
    float w = mix(0.05, 0.2, u);
    float a = exp(-pow(p.y / (w * 0.5), 2.0)) * mix(0.12, 1.0, pow(u, 1.6)) * smoothstep(1.0, 0.9, p.x) * smoothstep(-1.0, -0.85, p.x);
    a = max(a, exp(-dot(p - vec2(0.84, 0.0), p - vec2(0.84, 0.0)) * 140.0));
    return vec4(1.0, 1.0, 1.0, a);
  }
  if (t == 4 || t == 5) { // legacy flash stars (third person / generic)
    float s = star(p, t == 4 ? 5.0 : 7.0, 0.95, t == 4 ? 0.13 : 0.09, sd);
    float core = exp(-r * r * 30.0) + exp(-r * r * 6.0) * 0.35;
    return vec4(1.0, 1.0, 1.0, clamp(max(s, core), 0.0, 1.0) * edgeFade(p));
  }
  if (t == 6) { float tp; float d = coneD(p, 0, tp); return vec4(1.0, 1.0, 1.0, clamp(d * (0.5 + tp), 0.0, 1.0)); }
  if (t == 7) { // drop
    float a = smoothstep(0.62, 0.42, r);
    float hl = 1.0 - smoothstep(0.0, 0.25, length(p - vec2(-0.18, 0.2))) * 0.3;
    return vec4(vec3(hl), a);
  }
  if (t == 9 || t == 58) { // rock chunk (58 shaded facets)
    float a = polyRock(p, sd + float(t), 0.62);
    float w = worley(p * 3.0 + sd);
    float shade = t == 58 ? 0.6 + 0.4 * clamp(dot(normalize(vec2(p.x + 0.2, p.y + 0.4) + 0.001), vec2(0.4, 0.9)) * 0.5 + 0.5 - w * 0.3, 0.0, 1.0) : 1.0;
    return vec4(vec3(shade), a);
  }
  if (t == 10) { float tp; float d = fireD(p, 2.0, tp); return vec4(1.0, 1.0, 1.0, clamp(d * (0.4 + tp * 0.9), 0.0, 1.0)); }
  if (t == 11 || t == 62) { // shock rings
    float rr = t == 11 ? 0.78 : 0.86, w = t == 11 ? 0.16 : 0.05;
    float a = exp(-pow((r - rr) / w, 2.0)) + (t == 11 ? smoothstep(rr, 0.0, r) * 0.15 : 0.0);
    return vec4(1.0, 1.0, 1.0, clamp(a, 0.0, 1.0) * edgeFade(p));
  }
  if (t == 13) { float a = exp(-r * r * 14.0) + exp(-r * r * 60.0); return vec4(1.0, 1.0, 1.0, clamp(a, 0.0, 1.0)); }
  if (t == 14) { // legacy hole
    float a = smoothstep(0.5, 0.15, r);
    return vec4(vec3(0.08 + 0.2 * smoothstep(0.1, 0.4, r)), a);
  }
  if (t == 15) { // legacy splat mask
    float n = fbm(p * 4.0 + sd);
    float a = smoothstep(0.55 + n * 0.2, 0.42, r);
    for (int k = 0; k < 18; k++) { vec2 c = rot2(vec2(0.55 + h11(float(k)) * 0.35, 0.0), h11(float(k) * 3.1) * 6.283); a = max(a, smoothstep(0.06, 0.03, length(p - c))); }
    return vec4(1.0, 1.0, 1.0, a * edgeFade(p));
  }
  if (t >= 16 && t < 32) { // muzzle cloud: 4 shapes x 4 frames
    int set = (t - 16) / 4; float fr = float((t - 16) - set * 4);
    float tp; float d = muzzleD(p, set, fr, tp);
    return vec4(0.5, 0.5, tp, d);
  }
  if (t >= 32 && t < 36) { float tp; float d = coneD(p, t - 32, tp); return vec4(0.5, 0.5, tp, d); }
  if (t == 36) { // sharp 4-prong star
    float s = 0.0;
    for (int k = 0; k < 4; k++) {
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
    for (int k = 0; k < 4; k++) {
      float ak = (float(k) - 1.5) * 0.2 + (h11(float(k) + 9.0) - 0.5) * 0.08;
      vec2 d = rot2(p - b, -ak);
      float len = 1.45 + 0.25 * h11(float(k) * 2.0);
      float tt = clamp(d.x / len, 0.0, 1.0);
      s = max(s, exp(-pow(d.y / (0.05 * (1.0 - tt) + 0.006), 2.0)) * (1.0 - tt * tt) * step(0.0, d.x));
    }
    float core = exp(-dot(p - b, p - b) * 18.0);
    return vec4(1.0, 1.0, 1.0, clamp(max(s, core), 0.0, 1.0) * edgeFade(p));
  }
  if (t >= 38 && t < 46) { float tp; float d = fireD(p, float(t - 38), tp); return vec4(0.5, 0.5, tp, d); }
  if (t >= 46 && t < 50) { // blood spray: RGB = thinness shading, A = mask
    float a = bloodSpray(p, 7.0, float(t - 46));
    return vec4(vec3(0.75 + 0.25 * smoothstep(0.2, 1.0, (p.x + 0.9) / 1.8)), a);
  }
  if (t >= 50 && t < 56) { // lit puffs: normal from the field gradient + spherical bulge
    float s = float(t) * 3.7;
    float grain = t >= 54 ? 0.45 : 0.0;
    float e = uTexel * 2.0;
    float f0 = puffF(p, s, grain), fx = puffF(p + vec2(e, 0.0), s, grain), fy = puffF(p + vec2(0.0, e), s, grain);
    float H0 = sqrt(max(f0, 0.0)), Hx = sqrt(max(fx, 0.0)), Hy = sqrt(max(fy, 0.0));
    vec2 g = vec2(Hx - H0, Hy - H0) / e;
    vec3 N = normalize(vec3(-g * 0.35, 1.0));
    float d = smoothstep(0.1, t >= 54 ? 0.55 : 0.7, f0) * edgeFade(p);
    return vec4(N.xy * 0.5 + 0.5, clamp(f0 * 0.75, 0.0, 1.0), d);
  }
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
  if (t == 60) { // water crown: column + spray fan + droplets (base at the bottom)
    float y = (p.y + 0.9) / 1.8;
    float col = smoothstep(0.12 * (1.0 - y) + 0.03, 0.02, abs(p.x + fbm3(vec2(p.y * 3.0, 1.0)) * 0.06)) * smoothstep(1.0, 0.55, y);
    float fan = 0.0;
    for (int k = 0; k < 9; k++) {
      float ak = (float(k) - 4.0) * 0.17 + (h11(float(k)) - 0.5) * 0.1;
      vec2 d = rot2(p - vec2(0.0, -0.85), -(1.5708 + ak));
      float len = 1.2 + h11(float(k) * 3.0) * 0.4;
      float tt = clamp(d.x / len, 0.0, 1.0);
      fan = max(fan, smoothstep(0.04 * (1.0 - tt) + 0.008, 0.0, abs(d.y)) * step(0.0, d.x) * step(d.x, len) * (1.0 - tt * 0.6));
    }
    float drops = 0.0;
    for (int k = 0; k < 20; k++) { vec2 c = vec2((h11(float(k) * 1.7) - 0.5) * 1.2, h11(float(k) * 2.9) * 1.4 - 0.4); drops = max(drops, smoothstep(0.035, 0.015, length(p - c))); }
    float a = clamp(max(max(col, fan * 0.8), drops), 0.0, 1.0) * edgeFade(p);
    return vec4(1.0, 1.0, 1.0, a);
  }
  if (t == 61) { // barrel smoke wisp: thin curly vertical strand
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
  return vec4(0.0);
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  if (uType >= 100) {
    int t = uType - 100;
    float h, gl;
    vec4 c = decal(t, p, h, gl);
    if (uPass < 0.5) { gl_FragColor = c; return; }
    float e = uTexel * 2.0, hx, hy, g2;
    decal(t, p + vec2(e, 0.0), hx, g2);
    decal(t, p + vec2(0.0, e), hy, g2);
    vec3 N = normalize(vec3(-(hx - h) / e * 0.06, -(hy - h) / e * 0.06, 1.0));
    gl_FragColor = vec4(N.xy * 0.5 + 0.5, gl, 1.0);
    return;
  }
  gl_FragColor = fxCell(uType, p);
}`;

// ------------------------------------------------------------------ ramps (HDR, linear)
const RAMPS = [
  // gunfire (06a §6)
  [[0, [0, 0, 0]], [0.2, [0.6, 0.2, 0.06]], [0.4, [1.8, 0.75, 0.25]], [0.6, [3.6, 1.9, 0.75]], [0.8, [6, 4.2, 2]], [1, [9, 8, 6]]],
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
 * Returns { fx, decal, ramp, cell, decalCell, regenerate() } (render-target textures + the ramp DataTexture).
 */
export function buildAtlases(gl, { size = 2048 } = {}) {
  const cell = size / COLS;
  const dSize = size >= 2048 ? 1024 : 512;           // decal atlas height; width = 2x (colour | normal)
  const dCell = dSize / 4;
  const fxRT = makeRT(size, size);
  const decalRT = makeRT(dSize * 2, dSize);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    uniforms: { uType: { value: 0 }, uSeed: { value: 0 }, uFrame: { value: 0 }, uPass: { value: 0 }, uTexel: { value: 2 / cell } },
  });
  const quad = new FullScreenQuad(mat);
  const u = mat.uniforms;

  const generate = () => {
    const prevRT = gl.getRenderTarget();
    const prevAuto = gl.autoClear;
    const prevCC = gl.getClearColor(new THREE.Color()), prevCA = gl.getClearAlpha();
    gl.autoClear = false;
    // storage is allocated with a full mip chain (generateMipmaps on), then mips are built once at the end
    for (const rt of [fxRT, decalRT]) { rt.texture.generateMipmaps = true; gl.initRenderTarget(rt); rt.texture.generateMipmaps = false; }
    // FX atlas: 64 cells
    gl.setRenderTarget(fxRT);
    gl.setClearColor(0x000000, 0); gl.clear(true, false, false);
    for (let i = 0; i < COLS * COLS; i++) {
      const cx = i % COLS, cy = Math.floor(i / COLS);
      fxRT.viewport.set(cx * cell, (COLS - 1 - cy) * cell, cell, cell);
      fxRT.scissor.copy(fxRT.viewport); fxRT.scissorTest = true;
      u.uType.value = i; u.uSeed.value = i * 1.37; u.uFrame.value = 0; u.uPass.value = 0; u.uTexel.value = 2 / cell;
      if (i === COLS * COLS - 1) fxRT.texture.generateMipmaps = true;
      gl.setRenderTarget(fxRT);
      quad.render(gl);
    }
    fxRT.scissorTest = false; fxRT.viewport.set(0, 0, size, size);
    // decal atlas: colour half + normal half
    gl.setRenderTarget(decalRT);
    gl.clear(true, false, false);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 16; i++) {
        const cx = i % 4, cy = Math.floor(i / 4);
        decalRT.viewport.set(pass * dSize + cx * dCell, (3 - cy) * dCell, dCell, dCell);
        decalRT.scissor.copy(decalRT.viewport); decalRT.scissorTest = true;
        u.uType.value = 100 + i; u.uSeed.value = i; u.uPass.value = pass; u.uTexel.value = 2 / dCell;
        if (pass === 1 && i === 15) decalRT.texture.generateMipmaps = true;
        gl.setRenderTarget(decalRT);
        quad.render(gl);
      }
    }
    decalRT.scissorTest = false; decalRT.viewport.set(0, 0, dSize * 2, dSize);
    gl.setRenderTarget(prevRT);
    gl.autoClear = prevAuto;
    gl.setClearColor(prevCC, prevCA);
  };
  generate();
  return {
    fx: fxRT.texture, decal: decalRT.texture, ramp: buildRamp(), cell, decalCell: dCell, size,
    regenerate: generate,
    /** Dev: PNG data URL of an atlas ('fx' | 'decal') for visual QA. */
    debugURL(which = 'fx') {
      const rt = which === 'decal' ? decalRT : fxRT;
      const w = rt.width, h = rt.height;
      const px = new Uint8Array(w * h * 4);
      gl.readRenderTargetPixels(rt, 0, 0, w, h, px);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d');
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4;
          // composite over a checker so alpha is visible; volumetric cells show density/temperature
          const a = px[s + 3] / 255, bg = ((x >> 4) + (y >> 4)) & 1 ? 40 : 70;
          for (let c = 0; c < 3; c++) img.data[d + c] = px[s + c] * a + bg * (1 - a);
          img.data[d + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return cv.toDataURL('image/png');
    },
    dispose() { fxRT.dispose(); decalRT.dispose(); mat.dispose(); quad.dispose(); },
  };
}
