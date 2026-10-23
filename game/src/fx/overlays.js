// Full-screen premium overlays (PREMIUM_WEAPONS §1.7.5 / §1.14, 06b §6.2 + §9.8), drawn inside the HDR scene
// pass so they go through bloom and ACES like everything else (no composite change needed):
//   front  (over the viewmodel, like CSO's 2D screen sprites)
//     mul pass  TINT (06b formula), ink-filter paper, ...            dst * src        (one draw when active)
//     add pass  status overlays burn / poison / frost / electric,     premultiplied    (one draw when active)
//               ink washes, BORDER fallback
//   back   (behind the viewmodel, in front of the world: depth pinned just behind the gun's squeezed range)
//     add pass  RADIAL speed lines, RIFT (rice-paper tear), CLOUDSEA, CURTAIN
//   TUNNEL    camera-attached open cylinder (wave pipe, lava pipe, ice rings), same depth trick
// One ubershader per pass; every kind is a uniform-gated branch (coherent, skipped at 0), so the whole set is
// 4 programs compiled at load. Budgets (§1.14): ≤ 4 overlays at once (the weakest fades out), one L4
// screen (TUNNEL / CLOUDSEA / RIFT / CURTAIN / ink) at a time, TINT α ≤ 0.35, full-screen α ≤ 0.5, centre
// 20 % kept clean, low quality = borders + tint only, medium drops RADIAL.
import * as THREE from 'three';
import { GLSL_NOISE, hdr } from './kitutil.js';

const STATUS = { burn: 'fire', burning: 'fire', fire: 'fire', poison: 'poison', acid: 'poison', frost: 'frost', ice: 'frost', freeze: 'frost', electric: 'elec', shock: 'elec', elec: 'elec' };
const L4 = new Set(['tunnel', 'cloudsea', 'rift', 'curtain', 'ink']);

const VERT = (z) => /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, ${z}, 1.0); }`;

const COMMON = /* glsl */`
varying vec2 vUv;
uniform float uTime, uAspect;
${GLSL_NOISE}
// over-compositing of premultiplied layers: c = colour, m = coverage
void over(inout vec3 acc, inout float a, vec3 c, float m) { acc = c * m + acc * (1.0 - m); a = m + a * (1.0 - m); }
// manga / CSO speed lines: wedges from the centre, re-dealt every 40 ms
float speedLines(vec2 ca, float seed, float r0, float density) {
  float ang = atan(ca.y, ca.x) / 6.2831853 + 0.5;
  float N = 96.0;
  float id = floor(ang * N);
  float h = hash11(id + seed * 17.0);
  float h2 = hash11(id * 1.7 + seed * 5.0 + 3.1);
  float on = step(1.0 - density, h);
  float w = 0.18 + 0.32 * h2;
  float x = abs(fract(ang * N) - 0.5) * 2.0;
  float rad = length(ca);
  float start = r0 + 0.22 * h2;
  return on * (1.0 - smoothstep(w * 0.4, w, x)) * smoothstep(start, start + 0.18, rad);
}`;

// ------------------------------------------------------------------ front add pass (status, ink, border)
const FRONT_ADD = /* glsl */`
${COMMON}
uniform vec4 uStatus;      // fire, poison, frost, electric
uniform vec3 uElecCol;
uniform float uInk;
uniform vec4 uEdge;        // rgb, amount (BORDER fallback)
uniform vec4 uTintAdd;     // tint colour * 0.05 * alpha
vec3 fireRamp(float t) {
  vec3 c = mix(vec3(0.35, 0.03, 0.0), vec3(2.4, 0.75, 0.08), smoothstep(0.0, 0.45, t));
  c = mix(c, vec3(4.2, 2.3, 0.5), smoothstep(0.4, 0.8, t));
  return mix(c, vec3(6.0, 4.6, 2.2), smoothstep(0.82, 1.0, t));
}
void main() {
  vec2 uv = vUv, cc = uv - 0.5;
  vec2 ca = vec2(cc.x * uAspect, cc.y);
  float r2 = dot(cc, cc);
  float T = mod(uTime, 300.0);
  vec3 acc = vec3(0.0); float a = 0.0; vec3 add = uTintAdd.rgb;
  // ---- burning (CSO Zombiflame): licking flame sheet, thin in the middle, thick at the edges and bottom
  if (uStatus.x > 0.001) {
    float s = uStatus.x;
#ifdef OV_LQ
    add += vec3(2.4, 0.75, 0.08) * smoothstep(0.12, 0.45, r2) * s * 0.6;
#else
    vec2 p = vec2(ca.x * 0.9, ca.y * 0.38 - T * 0.3);
    float n = fbm2(p);
    float n2 = n1(vec2(ca.x * 2.4 + 0.3, ca.y * 0.55 - T * 0.5));
    float n3 = n1(vec2(ca.x * 5.0 - 0.7, ca.y * 1.1 - T * 0.9));
    // edge mask (06b: m = smoothstep(.10,.42, r2 + (n-.5)*.25)), weighted towards the bottom: fire rises, it
    // does not hang from the top of the screen
    float vert = smoothstep(0.45, -0.5, ca.y);
    float m = smoothstep(0.10, 0.42, r2 + (n - 0.5) * 0.3) * (0.45 + 0.55 * vert) + smoothstep(-0.12, -0.5, ca.y) * 0.45;
    // tongues: ridged turbulence stretched upwards, burning out with height
    float tongue = pow(1.0 - abs(n2 * 2.0 - 1.0), 4.0) * 0.7 + pow(1.0 - abs(n3 * 2.0 - 1.0), 6.0) * 0.4;
    float heat = clamp(m * (0.45 + 0.7 * n) + tongue * m - 0.3, 0.0, 1.0);
    float flick = 0.92 + 0.08 * sin(T * 9.0 + n * 6.0);
    vec3 fc = fireRamp(heat * 0.92) * smoothstep(0.04, 0.3, heat) * flick * 0.75;
    // embers: points rising in screen cells
    vec2 g = vec2(ca.x * 14.0, ca.y * 14.0 - T * 2.2);
    vec2 gi = floor(g), gf = fract(g) - 0.5;
    float eh = hash21(gi);
    vec2 eo = vec2(hash21(gi + 7.1), hash21(gi + 3.3)) - 0.5;
    float ember = step(0.86, eh) * smoothstep(0.09, 0.0, length(gf - eo * 0.6)) * smoothstep(0.03, 0.2, r2);
    add += (fc * 0.9 + vec3(5.0, 2.4, 0.6) * ember + vec3(0.35, 0.1, 0.01) * smoothstep(0.04, 0.4, r2)) * s;
    // smoky darkening right at the rim so the flames read against bright skies
    over(acc, a, vec3(0.05, 0.02, 0.01), smoothstep(0.2, 0.5, r2 + (n - 0.5) * 0.2) * 0.35 * s);
#endif
  }
  // ---- poison (CSO Zombipoison): opaque lime blotches, ragged frame, drips from the top, clear centre
  if (uStatus.y > 0.001) {
    float s = uStatus.y;
#ifdef OV_LQ
    over(acc, a, vec3(0.32, 0.75, 0.06), smoothstep(0.16, 0.4, r2) * 0.55 * s);
#else
    float n = fbm2(ca * 0.55 + vec2(0.0, T * 0.01));
    float n2 = n1(ca * 1.9 + 0.5);
    float e = r2 + (n - 0.5) * 0.4 + (n2 - 0.5) * 0.06;
    // a weaker dose hugs the screen edges (frame pushed out, shorter drips): splashes stay readable mid-fight
    float lo = 1.0 - s;
    float m = smoothstep(0.16 + 0.18 * lo, 0.36 + 0.1 * lo, e);
    // drips: columns along the top edge, each with its own length and a round head
    float cx = uv.x * 26.0, col = floor(cx);
    float h = hash11(col + 3.7);
    float len = (0.05 + 0.3 * h * h) * (0.75 + 0.25 * sin(T * 0.6 + h * 9.0)) * (0.2 + 0.8 * s);
    float w = 0.14 + 0.16 * h;
    float xin = abs(fract(cx) - 0.5);
    float yt = 1.0 - uv.y;
    float stem = step(0.45, h) * (1.0 - smoothstep(w * 0.55, w, xin)) * (1.0 - smoothstep(len - 0.01, len, yt));
    float head = step(0.45, h) * (1.0 - smoothstep(w * 1.15, w * 1.45, length(vec2(xin, (yt - len) * 26.0 / uAspect * 0.5))));
    m = max(m, max(stem, head) * smoothstep(0.0, 0.05, yt + 0.02));
    // gooey depth: darker inner rim, lighter body, wet highlights
    float body = smoothstep(0.16, 0.3, e);
    vec3 gc = mix(vec3(0.1, 0.32, 0.02), vec3(0.45, 0.9, 0.1), body * (0.7 + 0.3 * n2));
    float spec = smoothstep(0.72, 0.8, n2) * body;
    over(acc, a, gc + vec3(0.5, 0.7, 0.3) * spec, m * 0.72 * s);
    // bubbles
    vec2 bg = ca * 9.0 + vec2(0.0, T * 0.15);
    vec2 bi = floor(bg), bf = fract(bg) - 0.5;
    float bh = hash21(bi);
    float br = 0.12 + 0.2 * hash21(bi + 1.3);
    float ring = smoothstep(br, br - 0.04, length(bf)) - smoothstep(br - 0.05, br - 0.09, length(bf));
    add += vec3(0.25, 0.5, 0.06) * ring * step(0.8, bh) * m * s;
#endif
  }
  // ---- frost: crystalline rime creeping in from the edges, Voronoi crack lines, cold glints
  if (uStatus.z > 0.001) {
    float s = uStatus.z;
#ifdef OV_LQ
    over(acc, a, vec3(0.8, 1.0, 1.15), smoothstep(0.2, 0.45, r2) * 0.5 * s);
#else
    vec2 vp = ca * 12.0;
    vec2 vi = floor(vp), vf = fract(vp);
    float d1 = 8.0, d2 = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 pt = o + vec2(hash21(vi + o), hash21(vi + o + 19.7)) - vf;
      float d = dot(pt, pt);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    float edges = 1.0 - smoothstep(0.0, 0.05, sqrt(d2) - sqrt(d1));
    float n = fbm2(ca * 0.9 + 0.2);
    // feathery crystals: ridged high-frequency noise, sharper towards the rim
    float f1 = 1.0 - abs(n1(ca * 3.3 + vec2(0.3, 0.7)) * 2.0 - 1.0);
    float f2 = 1.0 - abs(n1(ca * 7.1 + vec2(0.9, 0.1)) * 2.0 - 1.0);
    float fern = pow(f1, 6.0) * 0.7 + pow(f2, 8.0) * 0.5;
    float e = r2 + (n - 0.5) * 0.18 + fern * 0.05;
    float m = smoothstep(0.2, 0.46, e);
    float rim = smoothstep(0.3, 0.55, e);
    vec3 fc = mix(vec3(0.66, 0.86, 1.0), vec3(1.0, 1.04, 1.1), clamp(fern + rim, 0.0, 1.0));
    over(acc, a, fc, clamp(m * 0.42 + rim * 0.3 + fern * m * 0.35, 0.0, 0.85) * s);
    float front = smoothstep(0.19, 0.25, e) * (1.0 - smoothstep(0.27, 0.36, e));
    add += vec3(0.45, 0.8, 1.25) * edges * front * 0.3 * s;
    over(acc, a, vec3(0.9, 0.97, 1.05), rim * 0.25 * s);
    float tw = step(0.992, hash21(floor(ca * 90.0) + floor(T * 2.0))) * m * smoothstep(0.35, 0.0, length(fract(ca * 90.0) - 0.5));
    add += vec3(2.0, 2.4, 2.8) * tw * s;
#endif
  }
  // ---- electric: arcs crawling along the screen border, re-seeded every 50 ms (flicker)
  if (uStatus.w > 0.001) {
    float s = uStatus.w;
    float k = floor(T * 20.0);
    float glow = smoothstep(0.16, 0.5, r2);
#ifdef OV_LQ
    add += uElecCol * glow * 0.35 * s;
#else
    vec2 off = vec2(hash11(k), hash11(k + 1.3)) * 3.0;
    float n = fbm2(ca * 0.8 + off);
    float n2 = n1(ca * 2.3 + off.yx);
    float ridge = 1.0 - abs(n * 2.0 - 1.0);
    float ridge2 = 1.0 - abs(n2 * 2.0 - 1.0);
    float arc = pow(ridge, 14.0) + pow(ridge2, 22.0) * 0.6;
    arc *= smoothstep(0.17, 0.3, r2);
    add += (uElecCol * (arc * 2.2 + glow * 0.18) + vec3(2.5) * pow(ridge, 40.0) * smoothstep(0.17, 0.3, r2)) * s;
#endif
  }
  // ---- ink filter washes: soft grey wash then black ink bleeding in from the edges (paper is in the mul pass)
  if (uInk > 0.001) {
#ifdef OV_LQ
    over(acc, a, vec3(0.03), smoothstep(0.18, 0.5, r2) * 0.6 * uInk);
#else
    float n = fbm2(ca * 0.7 + vec2(T * 0.004, 0.0));
    float n2 = n1(ca * 4.0);
    float e = r2 + (n - 0.5) * 0.35 + (n2 - 0.5) * 0.04;
    over(acc, a, vec3(0.2, 0.2, 0.21), smoothstep(0.12, 0.3, e) * 0.35 * uInk);
    over(acc, a, vec3(0.02, 0.02, 0.025), smoothstep(0.22, 0.42, e) * 0.85 * uInk);
#endif
  }
  if (uEdge.a > 0.001) add += uEdge.rgb * uEdge.a * smoothstep(0.10, 0.45, r2);
  gl_FragColor = vec4(acc + add, a);
}`;

// ------------------------------------------------------------------ front multiply pass (tint, paper)
const FRONT_MUL = /* glsl */`
${COMMON}
uniform vec4 uTint;        // rgb, alpha
uniform float uInk;
void main() {
  vec2 cc = vUv - 0.5;
  vec2 ca = vec2(cc.x * uAspect, cc.y);
  vec3 m = mix(vec3(1.0), uTint.rgb * 1.6, uTint.a);
  if (uInk > 0.001) {
    // rice paper: warm, slightly darker, fibrous grain
#ifdef OV_LQ
    float grain = 1.0;
#else
    float f = n1(vec2(ca.x * 9.0, ca.y * 2.5)) * 0.5 + n1(ca * 21.0) * 0.5;
    float grain = 0.9 + 0.1 * f;
#endif
    m *= mix(vec3(1.0), vec3(1.0, 0.95, 0.86) * grain, uInk);
  }
  gl_FragColor = vec4(m, 1.0);
}`;

// ------------------------------------------------------------------ back pass (behind the gun): radial, rift, cloudsea, curtain
const BACK = /* glsl */`
${COMMON}
uniform vec4 uRadial;      // amount, seed, ink (0 white..1 ink), r0
uniform vec3 uRadialCol;
uniform vec4 uRift;        // amount, open 0..1, angle, seed
uniform vec4 uCloud;       // amount, rise 0..1, seed, -
uniform vec3 uSunCol;
uniform vec4 uCurtain;     // amount, close 0..1, -, -
uniform vec3 uCurtainCol;
void main() {
  vec2 uv = vUv, cc = uv - 0.5;
  vec2 ca = vec2(cc.x * uAspect, cc.y);
  float T = mod(uTime, 300.0);
  vec3 acc = vec3(0.0); float a = 0.0; vec3 add = vec3(0.0);
  // ---- CLOUDSEA: three parallax cloud banks rising from the bottom, warm sunrise sky above them
  if (uCloud.x > 0.001) {
    float s = uCloud.x, rise = uCloud.y;
    float sky = smoothstep(-0.05, 0.5, ca.y);
    over(acc, a, uSunCol * 0.5, sky * 0.12 * s * rise);
    float hz = mix(-0.8, -0.16, rise);
    add += uSunCol * 0.9 * exp(-pow((ca.y - hz - 0.03) * 14.0, 2.0)) * exp(-ca.x * ca.x * 2.0) * s * rise;
    // far bank (k = 2: small, slow, high) .. near bank (k = 0: big, faster, low), iso-density billows
    for (int k = 2; k >= 0; k--) {
      float fk = float(k);
      float sc = 1.0 / (0.55 + 0.4 * fk);
      vec2 q = vec2(ca.x * sc + T * (0.006 + 0.01 * (2.0 - fk)) + uCloud.z + fk * 0.37, ca.y * sc * 1.6 + fk * 0.41);
      float top = hz + 0.05 * fk - 0.06 * (2.0 - fk);
      float grad = 2.6 + fk;
      float dens = fbm2(q * 0.42) * 0.65 + n1(q * 1.3) * 0.22 + (top - ca.y) * grad;
      float cov = smoothstep(0.5, 0.56, dens);
      vec2 q2 = q + vec2(0.0, 0.05 * sc * 1.6);
      float up = fbm2(q2 * 0.42) * 0.65 + n1(q2 * 1.3) * 0.22 + (top - ca.y - 0.05) * grad;
      float lit = clamp((dens - up - 0.05 * grad) * 9.0 + 0.45, 0.0, 1.0);   // lit where density falls off towards the sun
      float rim = 1.0 - smoothstep(0.5, 0.62, dens);
      vec3 shade = mix(vec3(0.5, 0.53, 0.66), vec3(1.15, 1.08, 1.0), lit);
      shade += uSunCol * 0.45 * rim;                                          // gold rim on the billow tops
      over(acc, a, shade * (0.82 + 0.06 * fk), cov * 0.92 * s);
    }
  }
  // ---- RIFT: a rice-paper tear opening across the screen; fibres on the torn lip, ink blooming inside
  if (uRift.x > 0.001) {
    float s = uRift.x, open = uRift.y;
    vec2 dir = vec2(cos(uRift.z), sin(uRift.z)), nrm = vec2(-dir.y, dir.x);
    float sd = dot(ca, dir), d = dot(ca, nrm);
    float L = 0.62;
    float taper = sqrt(max(0.0, 1.0 - sd * sd / (L * L)));
    float side = sign(d);
    float jag = (fbm2(vec2(sd * 0.5, uRift.w + side * 0.31)) - 0.5) * 0.7;
    float rag = (n1(vec2(sd * 7.0, uRift.w * 1.7 + side)) - 0.5) * 0.7 + (n1(vec2(sd * 19.0, uRift.w + side * 2.1)) - 0.5) * 0.4;
    float hw = open * taper * (0.105 * (1.0 + jag) + 0.016 * rag);
    float dd = d - (fbm2(vec2(sd * 0.25 + uRift.w, 0.3)) - 0.5) * 0.05;
    float ad = abs(dd);
    float inside = 1.0 - smoothstep(hw - 0.002, hw + 0.002, ad);
    // torn lip: a band of pale paper fibres combed outwards from the tear
    float fib = n1(vec2(sd * 55.0, ad * 3.0 + uRift.w));
    float lipW = (0.008 + 0.02 * fib * fib) * taper * open;
    float lip = (1.0 - smoothstep(hw, hw + lipW, ad)) * (1.0 - inside) * step(0.002, hw);
    // inside: rice paper seen through the tear, shaded deeper near the edges, ink blooming slowly
    vec2 pp = vec2(sd, dd) * 3.0;
    float grain = n1(vec2(pp.x * 2.0, pp.y * 6.0)) * 0.5 + n1(pp * 9.0) * 0.5;
    float depth = smoothstep(0.0, 0.05, hw - ad);
    vec3 paper = vec3(0.93, 0.9, 0.82) * (0.86 + 0.14 * grain) * (0.55 + 0.45 * depth);
    float ink = fbm2(vec2(sd * 0.35, dd * 0.6) + vec2(T * 0.02, uRift.w)) + (n1(vec2(sd * 2.0, dd * 3.0) + uRift.w) - 0.5) * 0.08;
    paper = mix(paper, vec3(0.5, 0.49, 0.48), smoothstep(0.5, 0.58, ink) * 0.5);
    paper = mix(paper, vec3(0.05, 0.05, 0.06), smoothstep(0.6, 0.68, ink) * 0.85);
    over(acc, a, paper * 1.3, inside * s);
    over(acc, a, vec3(1.15, 1.1, 0.98) * (0.8 + 0.2 * fib), lip * 0.85 * s);
    add += vec3(1.6, 1.25, 0.7) * exp(-max(0.0, hw - ad) * 70.0) * inside * taper * s * 0.35;
    // ink speed lines around the outside
    float sl = speedLines(ca, floor(T * 25.0) + uRift.w, 0.3, 0.45);
    over(acc, a, vec3(0.03, 0.03, 0.035), sl * 0.6 * s * (1.0 - inside));
  }
  // ---- RADIAL: speed lines (white light or ink), centre kept clean
  if (uRadial.x > 0.001) {
    float sl = speedLines(ca, floor(T * 25.0) + uRadial.y, uRadial.w, 0.5);
    vec3 c = mix(uRadialCol, vec3(0.03, 0.03, 0.035), uRadial.z);
    over(acc, a, c, sl * 0.55 * uRadial.x);
  }
  // ---- CURTAIN (simple): velvet stage drapes sliding in from the sides + a scalloped valance, gold trim
  if (uCurtain.x > 0.001) {
    float s = uCurtain.x, cl = uCurtain.y;
    float cw = 0.24 * cl;                       // curtain width per side (uv), never past 24 %
    float xL = uv.x, xR = 1.0 - uv.x;
    float side = min(xL, xR);
    float u = side / max(cw, 1e-3);              // 0 at the screen edge .. 1 at the curtain's inner edge
    float hem = (n1(vec2(uv.y * 3.0, 0.5)) - 0.5) * 0.01;
    float cov = 1.0 - smoothstep(cw - 0.004 + hem, cw + 0.004 + hem, side);
    float folds = sin(u * 26.0 + uv.y * 1.5 + (xL < xR ? 0.0 : 1.7));
    float fshade = 0.45 + 0.55 * pow(0.5 + 0.5 * folds, 1.6);
    vec3 vel = uCurtainCol * fshade * (0.8 + 0.2 * smoothstep(0.0, 0.6, uv.y));
    float trim = smoothstep(0.86, 0.94, u) * cov;
    vel = mix(vel, vec3(1.4, 0.95, 0.3) * (0.7 + 0.3 * folds), trim);
    over(acc, a, vel, cov * s);
    // valance: scalloped swags along the top
    float sw = 0.1 * cl;
    float scal = 0.02 * (1.0 - abs(fract(uv.x * 6.0) - 0.5) * 2.0);
    float vy = (1.0 - uv.y);
    float vcov = 1.0 - smoothstep(sw + scal - 0.003, sw + scal + 0.003, vy);
    vec3 vc = uCurtainCol * (0.55 + 0.45 * sin(uv.x * 37.7) * 0.5 + 0.25);
    vc = mix(vc, vec3(1.4, 0.95, 0.3), smoothstep(sw + scal - 0.012, sw + scal - 0.004, vy) * vcov);
    over(acc, a, vc, vcov * s);
  }
  gl_FragColor = vec4(acc + add, a);
}`;

// ------------------------------------------------------------------ TUNNEL (camera-attached open cylinder)
const TUNNEL_VERT = /* glsl */`
varying vec3 vPos;
varying vec2 vUv;
varying vec3 vClip;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPos = position;                          // camera space (the mesh is a child of the camera)
  gl_Position = projectionMatrix * mv;
  vClip = gl_Position.xyw;
  gl_Position.z = -0.835 * gl_Position.w;   // behind the viewmodel's squeezed depth, in front of the world
}`;
const TUNNEL_FRAG = /* glsl */`
uniform float uTime, uAspect, uAmt, uLook, uSeed;
uniform vec3 uCol;
varying vec3 vPos;
varying vec2 vUv;
varying vec3 vClip;
${GLSL_NOISE}
void main() {
  vec2 ndc = vClip.xy / vClip.z;
  float rc = length(vec2(ndc.x * uAspect, ndc.y));
  float hollow = smoothstep(0.3, 0.62, rc);                 // centre 35 % of the screen stays open
  float T = mod(uTime, 300.0);
  float ang = atan(vPos.y, vPos.x);                           // 0 = right, pi/2 = up (camera space)
  float z = -vPos.z;                                          // metres ahead
  float depthFade = smoothstep(29.0, 10.0, z) * smoothstep(0.0, 1.5, z);
  vec3 col; float al;
  if (uLook < 0.5) {
    // wave pipe (螭吻 浪管): a 220 degree curl of WATER over the top and right side -- a cyan (#6fe3ff) to deep blue
    // (#2f8bff) water wall (α 0.27-0.33), foam bands thresholded out of noise rolling round the axis 0.8 turns/s and
    // streaming back, a light refraction wobble through it; thin white streaks are only a secondary layer
    float a0 = radians(-62.0), a1 = radians(158.0);
    float span = smoothstep(a0, a0 + 0.35, ang) * (1.0 - smoothstep(a1 - 0.25, a1, ang));
    float hel = ang / 6.2831853 + z * 0.045 - T * 0.8;
    float zz = z * 0.03 + T * 0.4;
    float up = smoothstep(radians(-62.0), radians(150.0), ang);   // 0 at the base of the wall .. 1 at the lip
    vec2 wob = vec2(n1(vec2(hel * 4.0 + T * 0.3, zz * 0.5)), n1(vec2(zz * 0.7 + 3.1, hel * 3.0 - T * 0.2))) - 0.5;
    float bodyN = fbm2(vec2(hel * 3.0, zz * 0.6) + wob * 0.35);
    col = mix(vec3(0.16, 0.77, 1.0), vec3(0.02, 0.2, 0.9), clamp(up * 0.85 + (bodyN - 0.5) * 0.5, 0.0, 1.0)) * uCol;
    col += vec3(0.45, 0.95, 1.1) * pow(n1(vec2(hel * 2.5, zz * 0.6) + wob), 3.0) * 0.55;   // light through thin water
    float fb = fbm2(vec2(hel * 5.0, z * 0.25 + T * 1.6) + wob * 0.6);   // foam patches (not long streaks)
    float foam = smoothstep(0.61, 0.67, fb) * (0.4 + 0.5 * up);
    float s2 = n1(vec2(hel * 15.0 + 0.3, zz * 0.8));
    float lines = smoothstep(0.72, 0.78, s2) * (1.0 - smoothstep(0.78, 0.86, s2)) * 0.3;
    float lipN = fbm2(vec2(hel * 3.0, zz * 1.5));
    float lipFoam = smoothstep(0.2, 0.0, (radians(150.0) - ang) / 1.2 - (lipN - 0.5) * 0.35);
    float f = clamp(foam + lines + lipFoam, 0.0, 1.0);
    col = mix(col, vec3(1.3, 1.5, 1.6), f);
    al = span * (0.26 + 0.06 * up + 0.34 * f);
  } else if (uLook < 1.5) {
    // lava pipe (螭吻 twin): black crust, orange molten seams flowing back
    float hel = ang / 6.2831853 + z * 0.05 - T * 0.35;
    vec2 fp = vec2(hel * 2.0, z * 0.04 + T * 0.25);
    float n = fbm2(fp);
    float seam = 1.0 - smoothstep(0.0, 0.035, abs(n - 0.5));
    float glow = 1.0 - smoothstep(0.0, 0.12, abs(n - 0.5));
    col = mix(vec3(0.03, 0.012, 0.008), vec3(0.6, 0.12, 0.02), glow * 0.6);
    col = mix(col, vec3(4.0, 1.1, 0.15) * uCol, seam);
    float span = smoothstep(radians(-62.0), radians(-27.0), ang) * (1.0 - smoothstep(radians(144.0), radians(158.0), ang));
    al = span * (0.35 + 0.3 * seam);
  } else {
    // rings: generic energy tunnel (ice / light), stripes racing towards the player
    float ring = fract(z * 0.4 - T * 3.0);
    float st = smoothstep(0.0, 0.08, ring) * (1.0 - smoothstep(0.12, 0.3, ring));
    float sh = fbm2(vec2(ang / 6.2831853 * 3.0, z * 0.05 + uSeed));
    col = uCol * (0.05 + 0.9 * st) * (0.5 + 0.8 * sh);
    al = 0.0;   // additive
  }
  float k = uAmt * hollow * depthFade;
  gl_FragColor = vec4(col * (uLook < 1.5 ? al * k : k), al * k);
}`;

const LOOKS = { wave: 0, wave_pipe: 0, lava: 1, lava_pipe: 1, rings: 2, ice: 2, light: 2 };

class Entry {
  constructor(kind, o) {
    this.kind = kind;
    this.amt = o.amt ?? 1;
    this.t = 0;
    this.dur = o.dur ?? Infinity;
    this.fadeIn = o.fadeIn ?? 0.12;
    this.fadeOut = o.fadeOut ?? 0.25;
    this.o = o;
    this.alive = true;
    this.level = 0;
  }
  /** Fades out over `fade` seconds (default the entry's fadeOut). */
  stop(fade = this.fadeOut) { this.fadeOut = Math.max(0.01, fade); this.dur = Math.min(this.dur, this.t + this.fadeOut); }
  set(o) { Object.assign(this.o, o); if (o.amt !== undefined) this.amt = o.amt; return this; }
  _level() {
    const fi = this.fadeIn > 0 ? Math.min(1, this.t / this.fadeIn) : 1;
    const fo = Number.isFinite(this.dur) ? Math.min(1, Math.max(0, (this.dur - this.t) / this.fadeOut)) : 1;
    return this.amt * fi * fo;
  }
}

export class Overlays {
  constructor(kit) {
    this.kit = kit;
    this.game = kit.game;
    this.low = kit.quality === 'low';
    this.medium = kit.quality === 'medium';
    this.entries = [];
    this.scale = 1;            // settings: 0 disables every overlay except the border
    this.max = 4;              // §1.14 budget
    this._satAdded = 0; this._conAdded = 0; this._expAdded = 0; this._edgeAdded = null;
    const defines = this.low ? { OV_LQ: '' } : {};
    const U = (o) => ({ uTime: kit.time, uAspect: { value: 1 }, tNoise: kit.noise, ...o });
    const quad = new THREE.PlaneGeometry(2, 2);
    const mk = (frag, uniforms, z, blend, order, depthTest) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: VERT(z), fragmentShader: frag, uniforms, defines, transparent: true, depthWrite: false, depthTest,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
        blendSrc: blend === 'mul' ? THREE.ZeroFactor : THREE.OneFactor, blendDst: blend === 'mul' ? THREE.SrcColorFactor : THREE.OneMinusSrcAlphaFactor,
      });
      const mesh = new THREE.Mesh(quad, m);
      mesh.frustumCulled = false; mesh.renderOrder = order; mesh.visible = false;
      kit.game.scene.add(mesh);
      return mesh;
    };
    this.uf = U({ uStatus: { value: new THREE.Vector4() }, uElecCol: { value: new THREE.Vector3(2, 0.7, 3.5) }, uInk: { value: 0 }, uEdge: { value: new THREE.Vector4() }, uTintAdd: { value: new THREE.Vector4() } });
    this.um = U({ uTint: { value: new THREE.Vector4() }, uInk: { value: 0 } });
    this.ub = U({ uRadial: { value: new THREE.Vector4() }, uRadialCol: { value: new THREE.Vector3(1.6, 1.6, 1.7) }, uRift: { value: new THREE.Vector4() },
      uCloud: { value: new THREE.Vector4() }, uSunCol: { value: new THREE.Vector3(1.6, 1.0, 0.45) }, uCurtain: { value: new THREE.Vector4() }, uCurtainCol: { value: new THREE.Vector3(0.42, 0.02, 0.04) } });
    this.back = mk(BACK, this.ub, '-0.835', 'premul', 31, true);
    this.mul = mk(FRONT_MUL, this.um, '-1.0', 'mul', 996, false);
    this.front = mk(FRONT_ADD, this.uf, '-1.0', 'premul', 997, false);
    // tunnel: 30 m open cylinder around the camera's -Z axis, drawn from inside
    const tg = new THREE.CylinderGeometry(2.5, 2.5, 30, 40, 1, true);
    tg.rotateX(-Math.PI / 2); tg.translate(0, 0, -14);
    this.ut = { uTime: kit.time, uAspect: { value: 1 }, tNoise: kit.noise, uAmt: { value: 0 }, uLook: { value: 0 }, uSeed: { value: 0 }, uCol: { value: new THREE.Vector3(1, 1, 1) } };
    this.tunnelMesh = new THREE.Mesh(tg, new THREE.ShaderMaterial({
      vertexShader: TUNNEL_VERT, fragmentShader: TUNNEL_FRAG, uniforms: this.ut, transparent: true, depthWrite: false, side: THREE.BackSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.tunnelMesh.frustumCulled = false; this.tunnelMesh.renderOrder = 30; this.tunnelMesh.visible = false;
    kit.game.camera.add(this.tunnelMesh);
  }

  // ------------------------------------------------------------------ API
  /**
   * Generic overlay. kind: tint | radial | fire | poison | frost | elec | ink | rift | cloudsea | curtain |
   * tunnel | border. opts: amt (0..1), dur (s, Infinity = until stop()), fadeIn, fadeOut, color + per-kind
   * params. Returns a handle { stop(fade), set(opts), alive, level }.
   */
  add(kind, opts = {}) {
    kind = STATUS[kind] || kind;
    if (this.scale <= 0 && kind !== 'border') return new Entry(kind, { ...opts, dur: 0 });
    // quality downgrades (§1.14): low = borders + tint (+ the paper multiply of the ink filter); medium drops RADIAL
    if (this.low) {
      if (kind === 'tunnel') return this.border(opts.color || [0.3, 0.9, 1.6], 0.3 * (opts.amt ?? 1), opts.dur ?? 2);
      if (kind === 'cloudsea') return this.tint(opts.sun || [1.6, 1.0, 0.45], 0.18, opts.dur ?? 3);
      if (kind === 'rift') return this.tint([1.2, 1.15, 1.0], 0.2, Math.min(0.6, opts.dur ?? 0.6));
      if (kind === 'curtain') return this.tint([0.55, 0.12, 0.12], 0.3, opts.dur ?? 3);
      if (kind === 'radial') return new Entry(kind, { ...opts, dur: 0 });
    } else if (this.medium && kind === 'radial') return new Entry(kind, { ...opts, dur: 0 });
    if (L4.has(kind)) for (const e of this.entries) if (L4.has(e.kind) && e.dur > e.t + 0.15) e.stop(0.15);
    const e = new Entry(kind, opts);
    if (kind === 'rift' || kind === 'cloudsea') e.seed = opts.seed ?? Math.random() * 50;
    this.entries.push(e);
    // budget: at most 4 live overlays; the weakest one fades out quickly
    const live = this.entries.filter((x) => x.dur > x.t + 0.16 && x.kind !== 'border');
    if (live.length > this.max) {
      live.sort((x, y) => x._level() - y._level());
      live[0].stop(0.15);
    }
    return e;
  }

  /** TINT (06b §9.8): col = mix(col, col*tint*1.6 + tint*0.05, α); α is capped at 0.35 (§1.14). */
  tint(color = [1, 1, 1], alpha = 0.2, dur = 0.6, opts = {}) {
    return this.add('tint', { fadeIn: 0.06, fadeOut: Math.min(0.4, dur * 0.6), ...opts, amt: Math.min(0.35, alpha), dur, color });
  }
  /** RADIAL speed lines, centre clean. opts: color (HDR), ink (black lines), r0 (clear radius). */
  radial(amt = 1, dur = 0.35, opts = {}) { return this.add('radial', { fadeIn: 0.03, fadeOut: dur * 0.6, ...opts, amt, dur }); }
  /**
   * CSO full-screen status overlays: 'burn' | 'poison' | 'frost' | 'electric'. Calling again refreshes the
   * same status (max strength, extended time) instead of stacking. opts: color (electric), fadeOut.
   */
  status(kind, strength = 1, dur = 1.2, opts = {}) {
    const k = STATUS[kind];
    if (!k) return null;
    const cur = this.entries.find((e) => e.kind === k && e.alive && e.dur > e.t + 0.05);
    if (cur) {
      cur.amt = Math.max(cur._level(), strength);
      cur.t = Math.min(cur.t, cur.fadeIn);
      cur.dur = Math.max(cur.dur, cur.t + dur);
      if (opts.color) cur.o.color = opts.color;
      return cur;
    }
    return this.add(k, { fadeIn: 0.1, fadeOut: 0.5, ...opts, amt: strength, dur });
  }
  /** Ink-wash filter (負屓 書寫): desaturate + rice-paper grain + ink bleeding in from the edges. */
  ink(amt = 1, dur = Infinity, opts = {}) { return this.add('ink', { fadeIn: 0.25, fadeOut: 0.35, ...opts, amt, dur }); }
  /** RIFT: a rice-paper tear across the screen (負屓 大招). opts: angle (rad, 1.75 ≈ near vertical), seed, open (0..1). */
  rift(dur = 1.2, opts = {}) { return this.add('rift', { fadeIn: 0.05, fadeOut: 0.3, angle: 1.75, open: 1, ...opts, dur }); }
  /** CLOUDSEA: cloud banks rising over the lower screen, sunrise sky (玉山 雲海日出). opts: sun (HDR colour), seed. */
  cloudsea(dur = 4, opts = {}) { return this.add('cloudsea', { fadeIn: 0.05, fadeOut: 0.6, ...opts, dur }); }
  /** CURTAIN (simple): stage drapes close in from the sides, then open again. opts: color (velvet). */
  curtain(dur = 3, opts = {}) { return this.add('curtain', { fadeIn: 0.02, fadeOut: 0.45, ...opts, dur }); }
  /**
   * TUNNEL around the camera (螭吻 浪管 / 熔岩管, generic rings). opts: look 'wave' | 'lava' | 'rings', color (HDR
   * multiplier for wave / lava, colour for rings), amt (α scale, 1 = spec α 0.35).
   */
  tunnel(dur = 2.5, opts = {}) { return this.add('tunnel', { fadeIn: 0.15, fadeOut: 0.3, look: 'wave', ...opts, dur }); }
  /**
   * BORDER: element-colour screen edge (§1.9 4). Uses the composite's uEdge when the renderer provides it
   * (post.edge / post.edgeColor), otherwise this kit's own edge term. α capped at 0.35.
   */
  border(color = [1, 0.8, 0.3], alpha = 0.25, dur = Infinity, opts = {}) {
    return this.add('border', { fadeIn: 0.15, fadeOut: 0.3, ...opts, color, amt: Math.min(0.35, alpha), dur });
  }
  get active() { return this.entries.filter((e) => e.alive); }
  clear() { this.entries.length = 0; this.update(0); }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const uf = this.uf, um = this.um, ub = this.ub, ut = this.ut;
    const st = uf.uStatus.value.set(0, 0, 0, 0);
    let ink = 0, radial = 0, rift = 0, cloud = 0, curtain = 0, tunnel = 0, wave = false;
    let tint = null, tintA = 0, tintSum = [0, 0, 0], edge = [0, 0, 0], edgeA = 0;
    const sc = this.scale;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      e.t += dt;
      if (e.t >= e.dur) { e.alive = false; this.entries.splice(i, 1); continue; }
      const L = (e.level = e._level()) * (e.kind === 'border' ? 1 : sc);
      const o = e.o;
      switch (e.kind) {
        case 'fire': st.x = Math.max(st.x, L); break;
        case 'poison': st.y = Math.max(st.y, L); break;
        case 'frost': st.z = Math.max(st.z, L); break;
        case 'elec': st.w = Math.max(st.w, L); if (o.color) hdr(o.color, 1, uf.uElecCol.value); break;
        case 'ink': ink = Math.max(ink, L); break;
        case 'tint': {
          const c = hdr(o.color, 1, _c);
          tintSum[0] += c.x * L; tintSum[1] += c.y * L; tintSum[2] += c.z * L; tintA += L; tint = true;
          break;
        }
        case 'border': { const c = hdr(o.color, 1, _c); edge[0] += c.x * L; edge[1] += c.y * L; edge[2] += c.z * L; edgeA = Math.max(edgeA, L); break; }
        case 'radial':
          if (L > radial) { radial = L; ub.uRadial.value.set(L, o.seed ?? 0, o.ink ? 1 : 0, o.r0 ?? 0.22); hdr(o.color || [1.6, 1.6, 1.7], 1, ub.uRadialCol.value); }
          break;
        case 'rift': {
          rift = L;
          const op = Math.min(1, e.t / 0.2), close = Number.isFinite(e.dur) ? Math.min(1, (e.dur - e.t) / 0.25) : 1;
          ub.uRift.value.set(L, (o.open ?? 1) * (1 - Math.pow(1 - op, 3)) * Math.max(0, close), o.angle ?? 1.75, e.seed);
          break;
        }
        case 'cloudsea': {
          cloud = L;
          const rise = 1 - Math.pow(1 - Math.min(1, e.t / 0.9), 3);
          ub.uCloud.value.set(L, rise, e.seed, 0);
          if (o.sun) hdr(o.sun, 1, ub.uSunCol.value);
          break;
        }
        case 'curtain': {
          curtain = L;
          const cl = Math.min(1, e.t / 0.4), op = Number.isFinite(e.dur) ? Math.min(1, (e.dur - e.t) / 0.45) : 1;
          const k = Math.min(cl, op);
          ub.uCurtain.value.set(Math.min(1, L * 1.5), k * k * (3 - 2 * k), 0, 0);
          if (o.color) hdr(o.color, 1, ub.uCurtainCol.value);
          break;
        }
        case 'tunnel':
          tunnel = L; wave = (LOOKS[o.look] ?? 0) === 0;
          ut.uLook.value = LOOKS[o.look] ?? 0;
          if (o.color) hdr(o.color, 1, ut.uCol.value); else ut.uCol.value.set(1, 1, 1);
          ut.uSeed.value = o.seed ?? 0;
          break;
      }
    }
    // §1.14: full-screen effects ≤ 0.5 opacity -> the shaders already scale; just clamp the drivers
    const aspect = this.game.camera.aspect || 16 / 9;
    uf.uAspect.value = um.uAspect.value = ub.uAspect.value = ut.uAspect.value = aspect;
    if (tint) { const k = 1 / Math.max(tintA, 1e-4); um.uTint.value.set(tintSum[0] * k, tintSum[1] * k, tintSum[2] * k, Math.min(0.35, tintA)); }
    else um.uTint.value.set(1, 1, 1, 0);
    const ta = um.uTint.value.w;
    uf.uTintAdd.value.set(um.uTint.value.x * 0.05 * ta, um.uTint.value.y * 0.05 * ta, um.uTint.value.z * 0.05 * ta, 0);
    uf.uInk.value = um.uInk.value = ink;
    if (!this.low) ub.uRadial.value.x = radial; else ub.uRadial.value.x = 0;
    if (!rift) ub.uRift.value.x = 0;
    if (!cloud) ub.uCloud.value.x = 0;
    if (!curtain) ub.uCurtain.value.x = 0;
    ut.uAmt.value = tunnel;
    if (tunnel > 0.3 && wave) this._spray(dt);
    this._border(edge, edgeA);
    this.front.visible = st.x + st.y + st.z + st.w + ink + uf.uEdge.value.w + ta > 0.001;
    this.mul.visible = ta + ink > 0.001;
    this.back.visible = ub.uRadial.value.x + rift + cloud + curtain > 0.001;
    this.tunnelMesh.visible = tunnel > 0.001;
    // ink filter desaturates in the composite (post.saturation / contrast), applied as a delta like screenfx
    const post = this.game.renderer?.post;
    if (post) {
      // brighter + more contrast: backgrounds go paper-white, dark shapes go ink-black
      const sat = -0.92 * ink, con = 0.16 * ink, exp = 0.85 * ink;
      post.saturation += sat - this._satAdded; this._satAdded = sat;
      post.contrast += con - this._conAdded; this._conAdded = con;
      post.exposure += exp - this._expAdded; this._expAdded = exp;
    }
  }

  /** Wave pipe: 2-3 droplets flung off the foaming lip every 0.4 s, streaking across the upper left (vm layer). */
  _spray(dt) {
    this._sprayT = (this._sprayT ?? 0) - dt;
    if (this._sprayT > 0) return;
    this._sprayT = 0.4;
    const P = this.kit.fx.particles;
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const x = -0.32 + Math.random() * 0.2, y = 0.12 + Math.random() * 0.08, z = -0.45 - Math.random() * 0.15;
      P.spawn({ vm: true, additive: true, x, y, z, vx: 0.9 + Math.random() * 0.6, vy: -0.2 - Math.random() * 0.3, vz: 0.25, life: 0.35 + Math.random() * 0.2,
        size: 0.006 + Math.random() * 0.006, stretch: 0.05, color: [1.6, 2.0, 2.2, 1], color1: [0.6, 1.0, 1.2, 0], gravity: 1.5, frame: 7 });
    }
  }

  _border(edge, a) {
    const post = this.game.renderer?.post;
    const k = a > 0 ? 1 / a : 0;
    const col = [Math.min(4, edge[0] * k), Math.min(4, edge[1] * k), Math.min(4, edge[2] * k)];
    // the composite BORDER (renderer post.edge + post.edgeColor, mixed after tonemapping) wins when present:
    // applied as a delta so other writers (renderer.setEdge: ready reminder, buffs) keep their share; its colour
    // is display-range, so the HDR colour is normalised to 0..1
    if (post && 'edge' in post && post.edgeColor?.setRGB) {
      post.edge = Math.max(0, post.edge + a - (this._edgeAdded || 0));
      this._edgeAdded = a;
      const mx = Math.max(1, col[0], col[1], col[2]);
      if (a > 0) post.edgeColor.setRGB(col[0] / mx, col[1] / mx, col[2] / mx);
      this.uf.uEdge.value.set(0, 0, 0, 0);
    } else this.uf.uEdge.value.set(col[0], col[1], col[2], a);
  }
}
const _c = new THREE.Vector3();
