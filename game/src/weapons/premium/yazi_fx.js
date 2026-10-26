// 睚眥．裂魂 FX pieces (weapons/premium/yazi.js): the 報 seal, the slash lines (white edge bleeding to blood red), the
// shadow-puppet swordsman (皮影刀客) of the 裂魂 ultimate, the soul wisp of KE_SOUL. Everything is drawn procedurally
// (Canvas 2D / shaders): no texture is loaded. The seal glyph is our own seal-script construction of 報 (a public-domain
// character drawn in an original stroke set); the puppet is an original design (no particular troupe's figure).
import * as THREE from 'three';

export const WHITE = [5.4, 5.1, 4.8];
export const BLOOD = [3.0, 0.16, 0.1];       // the element colour of a cut that bites (§1.17)
export const CRIM = [2.2, 0.12, 0.08];
export const EMBER = [3.4, 1.5, 0.5];
export const GOLD = [3.2, 2.1, 0.8];

// ------------------------------------------------------------------------------------------ the 報 seal
// A square stamped seal: an eroded double border, the glyph 報 in squared seal strokes -- 幸 on the left (土 over a
// split crossbar over 干), 𠬝 on the right (a 卩 hook over 又) -- every stroke a bar with rounded ends, the whole thing
// worn like a real stamp (speckled gaps, a bled edge). R = the mask.
let sealCv = null;
export function sealCanvas() {
  if (sealCv) return sealCv;
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, S, S);
  c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round';
  // border: a thick outer frame with rounded corners and a thin inner line
  const rr = (x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  c.lineWidth = 30; rr(34, 34, S - 68, S - 68, 34); c.stroke();
  c.lineWidth = 7; rr(70, 70, S - 140, S - 140, 18); c.stroke();
  // the glyph in a 0..1 box mapped into the inner square
  const X0 = 100, Y0 = 96, W = S - 200, H = S - 192, L = (pts, w = 17) => { c.lineWidth = w; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(X0 + x * W, Y0 + y * H) : c.moveTo(X0 + x * W, Y0 + y * H))); c.stroke(); };
  // 幸 (left half, 0 .. 0.46)
  L([[0.06, 0.1], [0.4, 0.1]]); L([[0.23, 0.02], [0.23, 0.26]]); L([[0.02, 0.27], [0.44, 0.27]]);   // 土
  L([[0.1, 0.37], [0.15, 0.45]], 15); L([[0.34, 0.37], [0.29, 0.45]], 15);                         // the two dots
  L([[0.04, 0.52], [0.42, 0.52]]); L([[0.08, 0.7], [0.38, 0.7]]); L([[0.23, 0.52], [0.23, 0.98]]);  // 干 + the stem
  // 𠬝 (right half, 0.54 .. 1)
  L([[0.56, 0.08], [0.95, 0.08], [0.95, 0.4], [0.86, 0.46]]); L([[0.56, 0.08], [0.56, 0.5]]);       // 卩 hook
  L([[0.58, 0.58], [0.96, 0.58], [0.82, 0.78], [0.6, 0.97]]); L([[0.66, 0.68], [0.98, 0.98]]);      // 又
  // wear: speckled gaps and nibbled edges (the stamp's paste did not take everywhere)
  let s = 1234567;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 520; i++) { const x = r() * S, y = r() * S, q = 1 + r() * r() * 7; c.beginPath(); c.arc(x, y, q, 0, Math.PI * 2); c.fill(); }
  c.globalCompositeOperation = 'source-over';
  sealCv = cv;
  return cv;
}
let sealTex = null;
const sealTexture = () => {
  if (!sealTex) { sealTex = new THREE.CanvasTexture(sealCanvas()); sealTex.colorSpace = THREE.NoColorSpace; sealTex.anisotropy = 4; sealTex.generateMipmaps = true; }
  return sealTex;
};
const SEAL_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// stamped in: a wipe from the top (uT), a white-hot rim on the fresh edge, then the colour; uAmt fades the whole seal
const SEAL_FRAG = /* glsl */`
uniform sampler2D tMap;
uniform float uT, uAmt, uGlow;
uniform vec3 uColor, uHot;
varying vec2 vUv;
void main() {
  float m = texture2D(tMap, vUv).r;
  float halo = texture2D(tMap, vUv, 3.0).r;
  float wipe = smoothstep(uT * 1.15 - 0.15, uT * 1.15, 1.0 - vUv.y);
  float fresh = smoothstep(0.12, 0.0, abs((1.0 - vUv.y) - uT * 1.15 + 0.06)) * step(uT, 0.99);
  vec3 col = uColor * m * (1.0 - wipe) + uHot * m * fresh * 1.5 + uColor * halo * 0.35 * uGlow * (1.0 - wipe);
  float a = max(m, halo * 0.5) * (1.0 - wipe) * uAmt;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * uAmt, 1.0);
}`;
/** a vertical seal plane (1 x 1, centred); uniforms uT (stamp wipe 0 -> 1), uAmt, uColor, uHot, uGlow */
export function sealMesh() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    vertexShader: SEAL_VERT, fragmentShader: SEAL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { tMap: { value: sealTexture() }, uT: { value: 0 }, uAmt: { value: 0 }, uGlow: { value: 1 }, uColor: { value: new THREE.Vector3(1.9, 0.1, 0.07) }, uHot: { value: new THREE.Vector3(3.2, 2.4, 2.0) } },
  }));
  m.frustumCulled = false; m.renderOrder = 8;
  return m;
}

// ------------------------------------------------------------------------------------------ slash lines
// A cut drawn as a long thin lens of light: a white-hot core that bleeds to blood red at the rim and down the tail, the
// head drawing across in uT (0 -> 1), fading with uFade. Unit quad: x 0..1 along the cut, y -0.5..0.5 across.
const CUT_VERT = /* glsl */`
varying vec2 vUv;
varying vec2 vNdc;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vNdc = gl_Position.xy / gl_Position.w; }`;
const CUT_FRAG = /* glsl */`
uniform float uT, uFade, uRed, uHole, uBend;
uniform vec3 uCore, uRim;
varying vec2 vUv;
varying vec2 vNdc;
void main() {
  // the quad is 4x the blade of light: a crescent (bowed by uBend) lens of white-hot core, a blood-red halo round it
  float x = vUv.x, yy = (vUv.y - 0.5) * 2.0;
  // uHole > 0 (screen slashes): fade out round the screen centre (the crosshair stays readable)
  float hole = uHole > 0.0 ? smoothstep(uHole * 0.6, uHole * 1.4, length(vNdc * vec2(1.0, 0.56))) : 1.0;
  float head = uT * 1.2;
  if (x > head) discard;
  float y = abs(yy - uBend * (1.0 - 4.0 * (x - 0.5) * (x - 0.5)));
  float taper = smoothstep(0.0, 0.22, x) * smoothstep(head, head - 0.1, x);
  float w = 0.25 * taper * (0.25 + 0.75 * pow(sin(3.14159 * clamp(x / max(head, 0.001), 0.0, 1.0)), 1.5));
  float core = smoothstep(w, w * 0.12, y) * step(0.0005, w);
  // (the halo dies out before the quad's long edges: a cut close to the eye never shows its rectangle)
  float halo = exp(-pow(y / max(w * 2.4, 1e-4), 2.0)) * taper * smoothstep(1.0, 0.72, abs(yy));
  if (core + halo < 0.01) discard;
  // the red creeps in from the tail (uRed 0..1): the bite turning to blood
  float red = clamp(uRed * 1.4 - x * 0.6 + (1.0 - core) * 0.8, 0.0, 1.0);
  vec3 col = mix(uCore, uRim, red) * core * 1.25 + uRim * halo * 0.55;
  gl_FragColor = vec4(col * uFade * hole, 1.0);
}`;
/** one cut line (additive): scale.x = length, scale.y = width; position at its start */
export function cutLine({ core = WHITE, rim = BLOOD } = {}) {
  const g = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    vertexShader: CUT_VERT, fragmentShader: CUT_FRAG, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uFade: { value: 1 }, uRed: { value: 0 }, uHole: { value: 0 }, uBend: { value: 0 }, uCore: { value: new THREE.Vector3(...core) }, uRim: { value: new THREE.Vector3(...rim) } },
  }));
  m.frustumCulled = false; m.renderOrder = 9; m.visible = false;
  return m;
}

// ------------------------------------------------------------------------------------------ 皮影刀客 (shadow puppet)
// Atlas 1024²: five plates cut from backlit hide -- head (helmet + plume, the hollowed hero face, long brow, beard),
// torso (armoured robe: cloud collar, scale vest, belt, lace-cut skirt panels, boots), the back arm (a long sleeve), the
// sword arm (upper sleeve) and the sword hand (forearm, fist, a curved 刀). Vermilion and ink on amber hide, gold edges,
// rivets at the joints. Colours are what the backlight shows through: the shader squares and lifts them.
let pupCv = null;
const RECT = { head: [0, 0, 300, 300], torso: [300, 0, 380, 700], back: [680, 0, 344, 250], upper: [680, 260, 300, 150], hand: [0, 720, 1024, 200] };
export function puppetCanvas() {
  if (pupCv) return pupCv;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1024;
  const c = cv.getContext('2d');
  const RED = '#c52418', DEEP = '#7a0e0c', INK = '#170c09', HIDE = '#e3a95a', AMBER = '#c9781e', JADE = '#2f6f52', GOLD = '#ffd37a';
  const cut = (fn) => { c.save(); c.globalCompositeOperation = 'destination-out'; fn(); c.restore(); };
  const edge = (p, w = 3.2) => { c.save(); c.strokeStyle = GOLD; c.lineWidth = w; c.lineJoin = 'round'; c.stroke(p); c.restore(); };
  const ink = (p, w = 2) => { c.save(); c.strokeStyle = INK; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(p); c.restore(); };
  const rivet = (x, y, r = 7) => { c.fillStyle = GOLD; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); c.fillStyle = INK; c.beginPath(); c.arc(x, y, r * 0.38, 0, 6.283); c.fill(); };
  // lace: rows of cut-outs inside a clip path (the hide shows its pattern as light)
  const lace = (clip, kind, x0, y0, x1, y1, step) => {
    c.save(); c.clip(clip);
    cut(() => {
      for (let y = y0, r = 0; y < y1; y += step, r++) for (let x = x0 + (r % 2) * step / 2; x < x1; x += step) {
        c.beginPath();
        if (kind === 'coin') { c.arc(x, y, step * 0.32, 0, 6.283); c.moveTo(x + step * 0.12, y); c.rect(x - step * 0.1, y - step * 0.1, step * 0.2, step * 0.2); }
        else if (kind === 'diamond') { c.moveTo(x, y - step * 0.34); c.lineTo(x + step * 0.24, y); c.lineTo(x, y + step * 0.34); c.lineTo(x - step * 0.24, y); c.closePath(); }
        else if (kind === 'cloud') { c.ellipse(x - step * 0.12, y, step * 0.2, step * 0.14, 0, 0, 6.283); c.moveTo(x + step * 0.3, y); c.ellipse(x + step * 0.14, y - step * 0.04, step * 0.16, step * 0.12, 0, 0, 6.283); }
        else { c.arc(x, y, step * 0.18, 0, 6.283); }
        c.fill('evenodd');
      }
    });
    c.restore();
  };
  // ---- head (profile to the right): helmet with a plume and neck flaps, the hollow face, brow, eye, beard
  c.save(); c.translate(...RECT.head.slice(0, 2));
  const helm = new Path2D('M60,128 C56,70 100,38 160,40 C214,42 246,80 248,124 L236,128 C226,118 214,112 198,112 L120,112 C96,114 80,124 74,140 Z');
  c.fillStyle = INK; c.fill(helm);
  const crest = new Path2D('M150,42 C140,10 170,-2 186,18 C176,22 170,30 172,44 Z');
  c.fillStyle = GOLD; c.fill(crest);
  const plume = new Path2D('M170,24 C200,-6 260,6 286,40 C262,30 236,34 222,50 C210,40 192,34 176,40 Z');
  c.fillStyle = RED; c.fill(plume); edge(plume, 2);
  const flap = new Path2D('M66,132 L96,136 L104,226 C90,236 72,236 58,226 Z');
  c.fillStyle = DEEP; c.fill(flap); lace(flap, 'diamond', 60, 140, 104, 230, 16); edge(flap, 2);
  const face = new Path2D('M104,118 L206,116 C222,128 232,146 228,160 C240,166 242,176 232,182 L226,198 C222,214 210,224 190,226 L120,228 C108,206 102,160 104,118 Z');
  c.fillStyle = HIDE; c.fill(face);
  // the hero's hollowed face: cut away inside the outline, leaving the brow, the eye, the nose line and the lips
  cut(() => { c.fill(new Path2D('M116,132 L198,130 C210,140 216,152 214,160 L202,166 L214,176 L206,190 C200,206 190,214 176,214 L128,214 C120,196 114,160 116,132 Z')); });
  const brow = new Path2D('M128,142 C150,132 178,130 204,140 L202,146 C178,140 152,142 130,150 Z');
  c.fillStyle = INK; c.fill(brow);
  const eye = new Path2D('M150,156 C162,150 178,150 190,156 C180,162 162,164 150,160 Z');
  c.fillStyle = INK; c.fill(eye);
  ink(new Path2D('M206,152 L222,176 L210,182'), 3);
  ink(new Path2D('M196,196 L212,194'), 3);
  edge(face, 2.4); edge(helm, 2.6);
  // beard: long ink strands
  c.strokeStyle = INK; c.lineWidth = 3;
  for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(150 + i * 7, 214); c.bezierCurveTo(146 + i * 6, 250, 136 + i * 4, 270, 126 + i * 3, 296); c.stroke(); }
  rivet(132, 252, 8);
  c.restore();
  // ---- torso: armoured robe -- cloud collar, scale vest, belt with a buckle, three lace-cut skirt panels, boots
  c.save(); c.translate(...RECT.torso.slice(0, 2));
  const robe = new Path2D('M108,40 C140,16 240,16 272,40 L300,170 L322,300 L360,560 C330,574 290,580 252,576 L190,560 L128,576 C90,580 50,574 20,560 L58,300 L80,170 Z');
  c.fillStyle = RED; c.fill(robe);
  // scale vest over the chest
  const vest = new Path2D('M96,70 L284,70 L302,250 L78,250 Z');
  c.fillStyle = DEEP; c.fill(vest);
  c.save(); c.clip(vest); c.strokeStyle = GOLD; c.lineWidth = 2;
  for (let y = 80, r = 0; y < 256; y += 18, r++) for (let x = 84 + (r % 2) * 13; x < 300; x += 26) { c.beginPath(); c.arc(x, y, 13, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
  c.restore();
  lace(vest, 'coin', 84, 88, 300, 250, 26);
  edge(vest, 2);
  // cloud collar
  const collar = new Path2D('M110,36 C150,74 230,74 270,36 C262,62 248,92 190,100 C132,92 118,62 110,36 Z');
  c.fillStyle = INK; c.fill(collar); lace(collar, 'cloud', 116, 46, 266, 96, 22); edge(collar, 2.4);
  // belt + buckle
  c.fillStyle = INK; c.fillRect(70, 252, 240, 30);
  c.fillStyle = GOLD; c.beginPath(); c.ellipse(190, 267, 24, 18, 0, 0, 6.283); c.fill(); c.fillStyle = INK; c.beginPath(); c.ellipse(190, 267, 11, 8, 0, 0, 6.283); c.fill();
  // skirt panels: lace (diamond, cloud, coin rows), jade borders
  const panels = [new Path2D('M62,286 L178,286 L170,556 L28,548 Z'), new Path2D('M202,286 L318,286 L352,548 L210,556 Z'), new Path2D('M150,290 L230,290 L226,520 L154,520 Z')];
  panels.forEach((p, i) => { c.fillStyle = i === 2 ? JADE : RED; c.fill(p); lace(p, ['diamond', 'diamond', 'cloud'][i], 30, 300, 352, 548, i === 2 ? 26 : 22); edge(p, 2.2); });
  // hem band
  c.fillStyle = INK; c.fill(new Path2D('M24,540 C120,556 260,556 356,540 L360,560 C260,580 120,580 20,560 Z'));
  // boots
  const boots = new Path2D('M92,572 L150,572 L156,668 L196,690 L84,690 Z M232,572 L290,572 L296,668 L336,690 L224,690 Z');
  c.fillStyle = INK; c.fill(boots); edge(boots, 2);
  edge(robe, 3.4);
  rivet(190, 46, 8); rivet(108, 72, 7); rivet(272, 72, 7);
  c.restore();
  // ---- the back arm: a long flowing sleeve with a cloud cut-out band, the hand open
  c.save(); c.translate(...RECT.back.slice(0, 2));
  const sleeve = new Path2D('M18,30 L74,18 C150,40 250,90 300,170 C270,196 220,170 196,200 C160,150 90,110 20,74 Z');
  c.fillStyle = RED; c.fill(sleeve); lace(sleeve, 'cloud', 40, 40, 300, 200, 26); edge(sleeve, 2.6);
  const hand = new Path2D('M282,176 C302,168 330,178 338,198 C330,214 306,222 290,212 Z');
  c.fillStyle = HIDE; c.fill(hand); edge(hand, 2);
  rivet(34, 42, 8);
  c.restore();
  // ---- the sword arm (upper): an armoured sleeve with a scale band
  c.save(); c.translate(...RECT.upper.slice(0, 2));
  const upper = new Path2D('M14,40 C70,14 200,16 286,44 L292,104 C200,124 80,126 14,104 Z');
  c.fillStyle = DEEP; c.fill(upper);
  c.save(); c.clip(upper); c.strokeStyle = GOLD; c.lineWidth = 2;
  for (let y = 46, r = 0; y < 116; y += 16, r++) for (let x = 20 + (r % 2) * 11; x < 290; x += 22) { c.beginPath(); c.arc(x, y, 11, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
  c.restore();
  edge(upper, 2.6); rivet(30, 72, 8); rivet(270, 72, 8);
  c.restore();
  // ---- the sword hand: forearm, fist, guard, a long curved 刀 (blade hide left pale so it reads as steel)
  c.save(); c.translate(...RECT.hand.slice(0, 2));
  const fore = new Path2D('M12,70 C60,48 150,50 200,64 L204,130 C150,142 60,140 12,124 Z');
  c.fillStyle = RED; c.fill(fore); lace(fore, 'diamond', 20, 62, 200, 132, 20); edge(fore, 2.4);
  const fist = new Path2D('M196,62 C220,52 246,58 250,82 L252,118 C240,138 214,138 198,128 Z');
  c.fillStyle = HIDE; c.fill(fist); edge(fist, 2);
  c.fillStyle = GOLD; c.fillRect(250, 56, 16, 84);
  const dao = new Path2D('M266,74 L820,58 C920,54 990,70 1012,98 C960,108 900,112 820,114 L266,124 Z');
  c.fillStyle = '#eef1f4'; c.fill(dao);
  // the blade's ridge and a red fuller line, a ring pommel stub behind the fist
  c.strokeStyle = '#9aa6b2'; c.lineWidth = 3; c.beginPath(); c.moveTo(270, 90); c.lineTo(980, 84); c.stroke();
  c.strokeStyle = RED; c.lineWidth = 5; c.beginPath(); c.moveTo(300, 100); c.lineTo(700, 92); c.stroke();
  edge(dao, 2.4);
  c.strokeStyle = GOLD; c.lineWidth = 7; c.beginPath(); c.arc(178, 96, 16, 0, 6.283); c.stroke();
  rivet(24, 96, 8);
  c.restore();
  pupCv = cv;
  return cv;
}
let pupTex = null;
const puppetTexture = () => {
  if (!pupTex) { pupTex = new THREE.CanvasTexture(puppetCanvas()); pupTex.colorSpace = THREE.SRGBColorSpace; pupTex.anisotropy = 4; }
  return pupTex;
};
const PUP_VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vN, vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
// backlit hide: the colours glow (squared, lifted by the warm back light), thin pale hide brightest, the gold edges
// bloom; a dissolve (uFade) eats it from the edges as it falls back into paper ash
const PUP_FRAG = /* glsl */`
uniform sampler2D tMap;
uniform float uGlow, uFade, uFlash;
uniform vec3 uBack;
varying vec2 vUv;
varying vec3 vN, vV;
float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec4 t = texture2D(tMap, vUv);
  if (t.a < 0.5) discard;
  float n = h21(floor(vUv * 160.0));
  if (n < uFade * 1.15 - 0.1) discard;
  float lum = max(t.r, max(t.g, t.b));
  vec3 hide = t.rgb * t.rgb;
  float thin = smoothstep(0.35, 0.9, lum);
  vec3 c = hide * uBack * uGlow * (0.55 + 1.1 * thin);
  float gold = smoothstep(0.8, 0.98, lum) * step(0.55, t.g) * step(t.b, 0.75);
  c += vec3(2.6, 1.6, 0.6) * gold * uGlow;
  // a seared rim where the dissolve bites
  float burn = smoothstep(0.08, 0.0, n - (uFade * 1.15 - 0.1)) * step(0.001, uFade);
  c += vec3(3.0, 0.6, 0.2) * burn;
  c += uFlash * vec3(2.4, 0.5, 0.3) * (0.3 + thin);
  gl_FragColor = vec4(c, 1.0);
}`;
const _pv = new THREE.Vector3(), _pw = new THREE.Vector3();
let haloTex = null;
/** the lamp behind the puppet screen: a soft warm radial glow (additive) */
function haloMat() {
  if (!haloTex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d'), gr = c.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,190,110,1)'); gr.addColorStop(0.45, 'rgba(255,110,40,0.45)'); gr.addColorStop(1, 'rgba(120,20,0,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
    haloTex = new THREE.CanvasTexture(cv); haloTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshBasicMaterial({ map: haloTex, color: new THREE.Color(2.2, 1.3, 0.7), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
}
/** plane geometry with the atlas rect r, size w x h (m), pivot (px, py) in plate units (0..1 from left / bottom) */
function plateGeo(r, w, h, px, py) {
  const g = new THREE.PlaneGeometry(w, h).translate(w * (0.5 - px), h * (0.5 - py), 0);
  const [x, y, rw, rh] = r, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * rw) / 1024, 1 - (y + (1 - uv.getY(i)) * rh) / 1024);
  return g;
}
// the geometry every puppet shares (the five plates, the lamp, a rod) and the rods' material: built once
let PG = null;
function pupGeo() {
  return PG ||= {
    torso: plateGeo(RECT.torso, 0.66, 1.22, 0.5, 0.0), head: plateGeo(RECT.head, 0.46, 0.46, 0.42, 0.14), back: plateGeo(RECT.back, 0.62, 0.45, 0.07, 0.86),
    upper: plateGeo(RECT.upper, 0.42, 0.21, 0.06, 0.5), hand: plateGeo(RECT.hand, 1.32, 0.26, 0.02, 0.5),
    halo: new THREE.PlaneGeometry(1.5, 2.1).translate(0, 0.95, -0.04), rod: new THREE.CylinderGeometry(0.008, 0.01, 1, 5).translate(0, 0.5, 0),
    rodMat: new THREE.MeshBasicMaterial({ color: 0x1a120c }),
  };
}
function plate(mat, geo) {
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 6; m.frustumCulled = false;
  return m;
}
// three slash key poses (shoulder / elbow / wrist, radians) + the torso lean: raised behind, mid strike, follow-through
const POSES = [
  { sh: 2.25, el: -0.5, wr: 0.2, lean: -0.12, back: -0.6 },
  { sh: 0.55, el: -0.15, wr: -0.1, lean: 0.12, back: -0.2 },
  { sh: -0.6, el: 0.25, wr: -0.35, lean: 0.2, back: 0.15 },
];
/** one puppet's meshes, built once and reused (puppet() / puppetPool()): its own materials, the shared geometry */
function makeRig(game) {
  const G = pupGeo();
  const u = { tMap: { value: puppetTexture() }, uGlow: { value: 1.7 }, uFade: { value: 0 }, uFlash: { value: 0 }, uBack: { value: new THREE.Vector3(1.5, 0.9, 0.55) } };
  const mat = new THREE.ShaderMaterial({ vertexShader: PUP_VERT, fragmentShader: PUP_FRAG, uniforms: u, side: THREE.DoubleSide });
  const root = new THREE.Group(), body = new THREE.Group();
  root.name = 'yazi-puppet';
  root.add(body);
  const torso = plate(mat, G.torso); body.add(torso);
  const head = plate(mat, G.head); head.position.set(0.02, 1.12, 0.004); torso.add(head);
  const backArm = plate(mat, G.back); backArm.position.set(-0.12, 1.04, -0.006); torso.add(backArm);
  const upper = plate(mat, G.upper); upper.position.set(0.12, 1.02, 0.008); torso.add(upper);
  const hand = plate(mat, G.hand); hand.position.set(0.37, 0, 0.004); upper.add(hand);
  // the lamp behind the screen; the rods (竹籤) the puppeteer props it up with, from the ground to the neck and the fist
  const halo = new THREE.Mesh(G.halo, haloMat());
  halo.renderOrder = 5; halo.frustumCulled = false; body.add(halo);
  const rod1 = new THREE.Mesh(G.rod, G.rodMat), rod2 = new THREE.Mesh(G.rod, G.rodMat);
  rod1.frustumCulled = rod2.frustumCulled = false;
  root.add(rod1, rod2);
  root.visible = false;
  game.scene.add(root);
  return { root, body, torso, head, backArm, upper, hand, halo, rod1, rod2, mat, u, gen: 0, alive: false, P: { t: 0 } };
}
const POOLS = new WeakMap();
const poolOf = (game) => { let p = POOLS.get(game); if (!p || p.scene !== game.scene) POOLS.set(game, p = { scene: game.scene, rigs: [] }); return p; };
/** builds the pool up to n puppets (the ultimate's six and a spare) and returns the rigs (the warm-up draws them) */
export function puppetPool(game, n = 7) {
  const pl = poolOf(game);
  while (pl.rigs.length < n) pl.rigs.push(makeRig(game));
  return pl.rigs;
}
const _pb = new THREE.Vector3(), _pd = new THREE.Vector3(), _pu = new THREE.Vector3(0, 1, 0);
/**
 * One shadow-puppet swordsman (皮影刀客): propped up from lying flat in `rise` s (rods from the ground, a slight
 * overshoot), faces the camera, mirrored to face `face`; cut(): one slash through the three key poses with a blade
 * trail; stop(): falls back burning into paper ash. Returns { obj, cut(), tip(out), stop(), update(dt) -> alive }.
 * Puppets come from a per-game pool (no material, geometry or program is built mid-fight): a handle goes stale (does
 * nothing, update -> false) once its puppet is reused.
 */
export function puppet(game, pos, { height = 1.8, face = null, rise = 0.1, life = 1.9, glow = 1.7, back = [1.5, 0.9, 0.55], trail = BLOOD, seed = 1 } = {}) {
  const pl = poolOf(game);
  let rig = pl.rigs.find((x) => !x.alive);
  if (!rig) {
    if (pl.rigs.length < 12) pl.rigs.push(rig = makeRig(game));
    else { rig = pl.rigs.reduce((a, b) => (a.P.t > b.P.t ? a : b)); rig.P.trailR?.stop?.(); }   // the oldest one
  }
  const gen = ++rig.gen, { root, body, torso, head, backArm, upper, hand, halo, rod1, rod2, u } = rig;
  u.uGlow.value = glow; u.uFade.value = 0; u.uFlash.value = 0; u.uBack.value.set(...back);
  root.scale.setScalar(height / 1.8);
  root.position.copy(pos);
  root.visible = true;
  rig.alive = true;
  let r = seed >>> 0 || 1;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const P = rig.P = { t: 0, cutT: -1, life, trailR: null, fall: 0.45, phase: rnd() * 6, recoil: 0 };
  const live = () => rig.gen === gen && rig.alive;
  const h = {
    obj: root, mat: rig.mat, hand, head, torso,
    cut: () => { if (live()) { P.cutT = 0; u.uFlash.value = 1; } },
    tip: (out = new THREE.Vector3()) => { hand.updateMatrixWorld(true); return out.set(1.28, 0, 0).applyMatrix4(hand.matrixWorld); },
    stop: (after = 0, fall = 0.45) => { if (live()) { P.fall = Math.min(P.fall, fall); P.life = Math.min(P.life, P.t + after + P.fall); } },
    update: (dt) => {
      if (!live()) return false;
      P.t += dt;
      const t = P.t, cam = game.camera.position;
      // stand up off the ground (hinged at the feet), overshoot, settle; fall back over the last 0.45 s
      const up = Math.min(1, t / rise), over = up < 1 ? up * up * (3 - 2 * up) * 1.1 : 1 + 0.1 * Math.exp(-(t - rise) * 12) * Math.cos((t - rise) * 26);
      const end = Math.max(0, (t - (P.life - P.fall)) / P.fall);
      const yaw = Math.atan2(cam.x - root.position.x, cam.z - root.position.z);
      root.rotation.set(0, yaw, 0);
      _pv.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const right = face ? _pw.subVectors(face, root.position).dot(_pv) >= 0 : true;
      body.scale.x = right ? 1 : -1;
      body.rotation.x = -(Math.PI / 2) * (1 - Math.min(1.1, over)) - end * end * 1.4;
      u.uFade.value = end;
      halo.material.opacity = 0.42 * Math.min(1, up) * (1 - end) * (0.85 + 0.15 * Math.sin(t * 11 + P.phase));
      // the slash: through the three key poses in 0.14 s, the blade trail on; idle: a slow sway in the raised pose
      let k;
      if (P.cutT >= 0) {
        P.cutT += dt;
        const v = Math.min(1, P.cutT / 0.14), x = v * 2, i = Math.min(1, Math.floor(x)), f = x - i, e = f * f * (3 - 2 * f);
        const A = POSES[i], B = POSES[i + 1];
        k = { sh: A.sh + (B.sh - A.sh) * e, el: A.el + (B.el - A.el) * e, wr: A.wr + (B.wr - A.wr) * e, lean: A.lean + (B.lean - A.lean) * e, back: A.back + (B.back - A.back) * e };
        if (!P.trailR) P.trailR = game.fx?.trail?.({ width: 0.12, life: 0.16, profile: 'katana', color: [4.2, 1.2, 0.9, 1], color1: [...trail, 0.6], segs: 16 });
        if (P.trailR) { hand.updateMatrixWorld(true); P.trailR.push(hand.localToWorld(_pv.set(0.55, 0, 0)), hand.localToWorld(_pw.set(1.3, 0, 0))); }
        if (P.cutT > 0.24) { P.trailR?.stop?.(); P.trailR = null; P.cutT = -1; P.recoil = 0.35; }
      } else {
        // after a cut: ease back up to the raised pose over 0.35 s
        P.recoil = Math.max(0, P.recoil - dt);
        const e = P.recoil / 0.35, A = POSES[0], B = POSES[2], sw = Math.sin(t * 2.2 + P.phase) * 0.06;
        k = { sh: A.sh + (B.sh - A.sh) * e + sw, el: A.el + (B.el - A.el) * e, wr: A.wr + (B.wr - A.wr) * e, lean: A.lean + (B.lean - A.lean) * e, back: A.back + (B.back - A.back) * e };
      }
      upper.rotation.z = k.sh; hand.rotation.z = k.el + k.wr;
      torso.rotation.z = -k.lean;
      backArm.rotation.z = k.back + Math.sin(t * 1.7 + P.phase) * 0.05;
      head.rotation.z = Math.sin(t * 1.3 + P.phase) * 0.04 - k.lean * 0.4;
      u.uFlash.value = Math.max(0, u.uFlash.value - dt * 6);
      // rods: from the ground under the figure to the neck and to the sword fist
      torso.updateMatrixWorld(true);
      const neck = torso.localToWorld(_pv.set(0.02, 1.08, 0)), fist = hand.localToWorld(_pw.set(0.2, 0, 0));
      for (const [rod, p, dx] of [[rod1, neck, -0.1], [rod2, fist, 0.25]]) {
        root.worldToLocal(p);
        _pb.set(dx * (right ? 1 : -1), -0.35, 0.02);
        const L = _pd.copy(p).sub(_pb).length();
        rod.position.copy(_pb); rod.scale.set(1, L, 1);
        rod.quaternion.setFromUnitVectors(_pu, _pd.normalize());
        rod.visible = end < 0.3 && up >= 1;
      }
      if (t >= P.life) { h.remove(); return false; }
      return true;
    },
    remove: () => {
      if (!live()) return;
      rig.alive = false;
      P.trailR?.stop?.(); P.trailR = null;
      root.visible = false;
    },
  };
  return h;
}

// ------------------------------------------------------------------------------------------ shared warm-up
/** the weapon's procedural textures (the seal, the puppet atlas): uploaded up front by the warm-up */
export function fxTextures() { return [sealTexture(), puppetTexture()]; }
