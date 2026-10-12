// First-person arms: tactical jacket sleeves + gloves, built from rigid segments (one node per bone).
// Rest pose (authoring, mm): each arm points straight forward (-z) with the palm facing down and the
// thumb towards the body centre. Shoulder at s = 0, elbow at s = 300, wrist at s = 565.
// Node names: <side>_upper, <side>_fore, <side>_hand, <side>_thumb1..3, <side>_index1..3, middle, ring, pinky.
//   node tools/assets/arms.mjs   -> game/assets/arms.glb
import { Gun, lathe, box, sweep, ring, sphere, profile, section, xform, merge } from './lib/gunkit.mjs';
import * as THREE from 'three';

const ELBOW = 300, WRIST = 565;

/** Lathe-based limb along s with a radius function r(u) (u = 0..1), wrinkles added by the caller. */
function limb(s0, s1, rFn, opts = {}) {
  const pts = [];
  const n = opts.n || 24;
  pts.push([s0, 0]);
  for (let i = 0; i <= n; i++) { const u = i / n; pts.push([s0 + (s1 - s0) * u, rFn(u)]); }
  pts.push([s1, 0]);
  return lathe(pts, { seg: opts.seg || 28, t: opts.t || 0, w: opts.w || 0, crease: 70 });
}

/** A finger segment: capsule-like with a joint bulge, along s from a to b, radius r. */
function phalanx(a, b, r, { w = 0, t = 0, tip = false, flatten = 0.85 } = {}) {
  const len = b - a;
  const pts = [[a - r * 0.55, 0]];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    let rad = r * (1 - 0.1 * Math.sin(u * Math.PI));            // slight waist between joints
    if (u < 0.15) rad = r * (0.75 + 0.25 * Math.sin((u / 0.15) * Math.PI / 2));
    if (tip && u > 0.55) rad = r * Math.cos(((u - 0.55) / 0.45) * Math.PI / 2) ** 0.6 * 0.98 + 0.01;
    pts.push([a + len * u - (u < 0.15 ? r * 0.55 * (1 - u / 0.15) : 0), Math.max(0.01, rad)]);
  }
  if (!tip) pts.push([b + r * 0.35, r * 0.5], [b + r * 0.5, 0]);
  else pts.push([b, 0]);
  const g = lathe(pts, { seg: 18, crease: 80 });
  g.scale(1, flatten, 1); // fingers are a bit flatter than round
  g.translate(w, t, 0);
  return g;
}

function buildArm(g, side) {
  const S = side === 'R' ? 1 : -1;   // mirror factor on w
  const P = (name, pivot, parent, extras) => g.part(`${side}_${name}`, { pivot, parent: parent && `${side}_${parent}`, extras });

  // ---- upper arm: jacket sleeve, mostly off screen
  const up = P('upper', [0, 0, 0]);
  up.add(limb(-40, ELBOW + 20, (u) => 58 - 12 * u + 4 * Math.sin(u * 9)), 'sleeve');

  // ---- forearm: sleeve with folds and a cuff with a velcro tab
  const fore = P('fore', [ELBOW, 0, 0], 'upper');
  fore.add(limb(ELBOW - 30, WRIST - 30, (u) => 47 - 9 * u + 2.2 * Math.sin(u * 23 + 1) * (1 - u * 0.5) + 3 * Math.exp(-(((u - 0.72) / 0.05) ** 2))), 'sleeve');
  // wrinkles: irregular rings
  for (const [s, rr, tilt] of [[ELBOW + 40, 47, 8], [ELBOW + 95, 45, -6], [ELBOW + 150, 43, 10], [ELBOW + 190, 42, -4]]) {
    const r = ring(0, rr - 2, 3.2, { axis: 's', seg: 28 });
    r.scale(1, 0.92, 1);
    g.part(`${side}_fore`).add(xform(r, { rot: [tilt, 0, tilt * 0.5 * S], move: [s, 0, 0] }), 'sleeve');
  }
  // cuff band + velcro tab
  fore.add(limb(WRIST - 70, WRIST - 30, (u) => 41.5 + 1.2 * Math.sin(u * Math.PI)), 'sleeve_dark');
  fore.add(box([WRIST - 52, 0, S * 38], [26, 30, 6], { r: 3 }), 'sleeve_dark');

  // ---- hand (glove). Palm down: back of hand faces +t, fingers forward (+s), thumb towards -S*w.
  const hand = P('hand', [WRIST, 0, 0], 'fore');
  const H = WRIST;
  // glove cuff (overlaps the sleeve)
  hand.add(limb(H - 55, H + 12, (u) => 38 + 4 * u + 1.5 * Math.sin(u * 20)), 'glove');
  hand.add(limb(H - 50, H - 34, () => 41.5), 'glove_cuff');
  // palm block: rounded, tapered, slightly arched
  const palm = box([H + 48, 0, S * 2], [100, 30, 84], { r: 12, seg: 4 });
  {
    const p = palm.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const s = -z - H;                         // 0..100 along the palm
      const u = Math.min(1, Math.max(0, s / 100));
      // narrower at the wrist, arch across the back
      const wScale = 0.82 + 0.18 * u;
      const arch = (1 - ((x - S * 2) / 44) ** 2) * 4;
      p.setXYZ(i, S * 2 + (x - S * 2) * wScale, y * (0.9 + 0.1 * u) + (y > 0 ? arch : 0), z);
    }
    palm.computeVertexNormals();
  }
  hand.add(palm, 'glove');
  // knuckle guard plate (hard, moulded) and back-of-hand padding
  hand.add(xform(box([H + 86, 15.5, S * 2], [22, 6, 80], { r: 3 }), {}), 'knuckle');
  for (let i = 0; i < 4; i++) hand.add(sphere([H + 88, 17, S * (-27 + i * 18.5)], 7.5, { scale: [1, 0.55, 1.1], seg: 14 }), 'knuckle');
  hand.add(box([H + 40, 15, S * 4], [46, 5, 56], { r: 8 }), 'glove_pad');
  // palm padding (grippy)
  hand.add(box([H + 58, -15, S * 2], [70, 5, 70], { r: 6 }), 'glove_palm');

  // ---- fingers: [name, base w, base s, lengths, radius]
  const fingers = [
    ['index', -27, 97, [44, 26, 22], 9.6],
    ['middle', -8.5, 101, [48, 29, 23], 9.9],
    ['ring', 10, 98, [45, 27, 22], 9.4],
    ['pinky', 27, 89, [35, 21, 19], 8.4],
  ];
  for (const [name, bw, bs, lens, r] of fingers) {
    let s = H + bs;
    const w = S * bw;
    let parent = 'hand';
    for (let k = 0; k < 3; k++) {
      const node = P(`${name}${k + 1}`, [s, 0, w], parent);
      node.add(phalanx(s, s + lens[k], r * (1 - k * 0.06), { w, tip: k === 2 }), k === 2 ? 'glove_tip' : 'glove');
      if (k === 0) node.add(sphere([s + lens[k] * 0.55, r * 0.75, w], r * 0.62, { scale: [1.2, 0.5, 1], seg: 12 }), 'knuckle');
      parent = `${name}${k + 1}`;
      s += lens[k];
    }
  }
  // thumb: metacarpal angled out from the palm side, pointing forward/inward, slightly below the palm plane
  const tw = -S * 30, ts = H + 18, tt = -8;
  const thumbLens = [44, 33, 27];
  let s = ts, parent = 'hand';
  for (let k = 0; k < 3; k++) {
    const node = P(`thumb${k + 1}`, [s, tt, tw], parent, k === 0 ? { yaw: -S * 38, roll: S * 50 } : undefined);
    node.add(phalanx(s, s + thumbLens[k], 11.5 - k * 1.0, { w: tw, t: tt, tip: k === 2 }), k === 2 ? 'glove_tip' : 'glove');
    parent = `thumb${k + 1}`;
    s += thumbLens[k];
  }
  // thenar pad between thumb and palm
  hand.add(sphere([H + 30, -8, -S * 24], 20, { scale: [1.5, 0.7, 0.9], seg: 16 }), 'glove');
  // wrist watch on the left arm (detail visible during reloads)
  if (side === 'L') {
    fore.add(limb(WRIST - 64, WRIST - 42, () => 43), 'fabric_black');
    fore.add(lathe([[0, 0], [0, 19], [3, 20], [11, 19], [12, 0]], { seg: 32 }).rotateX(-Math.PI / 2).translate(0, 43, -(WRIST - 53)), 'steel_dark');
    fore.add(lathe([[0, 0], [0, 15.5], [1, 15.5], [1.5, 0]], { seg: 32 }).rotateX(-Math.PI / 2).translate(0, 55, -(WRIST - 53)), 'glass');
  }
}

export default function build() {
  const g = new Gun('arms');
  buildArm(g, 'R');
  buildArm(g, 'L');
  g.meta({ rest: { elbow: ELBOW / 1000, wrist: WRIST / 1000 } });
  return g;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const g = build();
  const res = await g.export('game/assets/arms.glb', { tessellate: 28 });
  console.log(res);
}
