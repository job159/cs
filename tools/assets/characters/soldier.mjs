// soldier — 隊友 operator: the third-person teammate model (remote players and AI bots, game/src/player/remote.js).
// A healthy adult man (~1.78 m, athletic) in a modern combat uniform: combat shirt with a breathable coyote-tan torso
// and ranger-green ripstop sleeves (shoulder pockets with velcro patches), ranger-green ripstop combat pants with
// cargo pockets (CC0 male_casualsuit02 geometry, re-textured) tucked / bloused into procedural high-top combat boots
// (boots.mjs: coyote leather and nylon, lacing with speed hooks, padded collar, lugged rubber sole with a heel).
// Kit (procedural meshes, skinned to the game_engine bones): coyote plate carrier (front / back plates, MOLLE
// cummerbunds, padded shoulder straps), triple rifle-mag pouch with mags, admin + radio pouches with a whip antenna,
// battle belt with IFAK and a drop-leg pistol holster, a tan high-cut ballistic helmet (rubber edge trim, side
// rails, NVG shroud, velcro patches) with goggles pushed up on the front and an electronic hearing-protection
// headset with a boom mic, two-tone tactical gloves (shell over the hand) and hard-cap knee pads.
// Normal, un-zombified CC0 MakeHuman skin (middle-aged light-skinned male, short buzz cut + stubble).
//
// Built by tools/assets/characters/build.mjs (which also authors and embeds the AnimationClips, see soldier_anims.mjs).
// The shared zombie lib (tools/assets/zombies/lib) is only imported read-only.
import * as THREE from 'three';
import { rasterUV, texelSurface } from '../zombies/lib/raster.mjs';
import { resize, createImage, normalFromHeight, blurField } from '../zombies/lib/image.mjs';
import { Builder, packZones, paintAtlas, panel, strap, cylinder, box, bvhOf, lin, toByte, clamp01, ss, mix, V3, S2LUT, down } from './kit.mjs';
import { bootShape, bootGeometry, bootPaint, treadPaint } from './boots.mjs';

const texSize = (s) => Math.max(64, Math.round(s * +(process.env.ZOMBIE_TEX_SCALE || 1)));
// geometry / clip QA builds (build.mjs --fast / --animonly): no texture painting
const FAST = process.env.SOLDIER_FAST === '1';
const flat = (c = [128, 128, 128, 255]) => createImage(8, 8, c);
const DEG = Math.PI / 180;
const lum = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
const over = (c, col, a) => { if (!(a > 0)) return; a = Math.min(1, a); for (let k = 0; k < 3; k++) c[k] += (col[k] - c[k]) * a; };
const scale = (c, k) => { c[0] *= k; c[1] *= k; c[2] *= k; };
const hash2 = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ------------------------------------------------------------------------------------------------ palette (linear)
const PAL = {
  coyote: lin([132, 110, 82]), coyoteDark: lin([92, 76, 57]), coyoteLight: lin([158, 136, 102]),
  ranger: lin([86, 92, 70]), rangerDark: lin([62, 67, 52]),
  tanShirt: lin([104, 108, 88]),
  helmet: lin([150, 136, 108]), black: lin([26, 26, 26]), rubber: lin([22, 22, 21]), polymer: lin([36, 36, 35]),
  steel: lin([60, 60, 62]), lens: lin([16, 20, 24]), olive: lin([66, 68, 52]),
  thread: lin([96, 82, 62]), webbing: lin([112, 92, 66]), loop: lin([104, 86, 62]),
  boot: lin([112, 93, 68]), sole: lin([34, 31, 28]),
};

/** Fabric surface: dye mottling + weave grain, optional MOLLE rows, binding tape, stitches, velcro fields. */
function fabric(N, base, o = {}) {
  return (P, Nn, lu, lv, out, ctx) => {
    const z = ctx.zone, X = lu * z.w, Y = lv * z.h;
    const c = out.c; c[0] = base[0]; c[1] = base[1]; c[2] = base[2];
    let h = 0, ro = o.rough ?? 0.86;
    // dye / wear mottling (3D, so it is continuous across pieces) + fine weave grain
    const m = N.fbm(P[0] * 7 + 3, P[1] * 7, P[2] * 7, 3);
    scale(c, 1 + m * 0.07);
    const g = (hash2(ctx.x * ctx.S, ctx.y * ctx.S) - 0.5);
    scale(c, 1 + g * 0.05);
    h += g * 0.25;
    // MOLLE webbing rows (1" webbing every 2", bar tacks every 1.5")
    if (o.molle) {
      const { x0 = 0.012, x1 = z.w - 0.012, y0 = 0.012, rows = 99, vertical = false } = o.molle;
      const A = vertical ? Y : X, Bv = vertical ? X : Y, A1 = vertical ? (o.molle.x1 ?? z.h - 0.012) : x1;
      const ph = (Bv - y0) / 0.0508;
      const row = Math.floor(ph), f = ph - row;
      if (row >= 0 && row < rows && A > x0 && A < A1 && Bv < (vertical ? z.w : z.h) - 0.008) {
        // f runs bottom -> top within a 2" pitch: webbing occupies the upper half
        const web = ss(0.5, 0.53, f) * (1 - ss(0.97, 1.0, f));
        if (web > 0) {
          const rib = Math.sin(f * 0.0508 / 0.0011 * Math.PI) * 0.5 + 0.5;
          scale(c, 1 - 0.04 * web + (rib - 0.5) * 0.04 * web);
          h += web * 1.6 + rib * 0.2 * web;
          // bar tacks every 1.5": short dense stitch blocks pinning the webbing down
          const t = Math.abs((((A - x0) / 0.0381) % 1) - 0.5) * 2;
          if (t > 0.9) { const k = ss(0.9, 0.95, t) * ss(0.56, 0.6, f) * (1 - ss(0.9, 0.94, f)); scale(c, 1 - k * 0.25); h -= k * 1.0; }
          if (f > 0.95) scale(c, 1.05); // lit top edge
        }
        // contact shadow under each strip
        const shadow = ss(0.42, 0.5, f) * (1 - ss(0.5, 0.52, f));
        scale(c, 1 - shadow * 0.3);
      }
    }
    // velcro loop fields [x0, y0, x1, y1] (m) with optional patch painter
    for (const v of o.velcro || []) {
      if (X > v[0] && X < v[2] && Y > v[1] && Y < v[3]) {
        const e = Math.min(X - v[0], v[2] - X, Y - v[1], v[3] - Y);
        over(c, PAL.loop.map((q, k) => q * base[k] / PAL.coyote[k]), 0.8);
        const fz = N.noise(X * 900, Y * 900, 1.7);
        scale(c, 1 + fz * 0.1);
        h += 0.6 + fz * 0.3 - (1 - ss(0, 0.003, e)) * 0.8;
        ro = 0.95;
        if (e < 0.003) scale(c, 0.8);
        if (v[4]) v[4](X - v[0], Y - v[1], v[2] - v[0], v[3] - v[1], c, out);
      }
    }
    // binding tape round the edge + a stitch line
    if (o.binding) {
      const e = Math.min(X, z.w - X, Y, z.h - Y);
      const b = 1 - ss(o.binding * 0.85, o.binding, e);
      if (b > 0) { over(c, base.map((v) => v * 0.72), b * 0.85); h += b * 0.8; }
      const st = Math.abs(e - o.binding * 1.35);
      const along = (Math.abs(X - z.w / 2) > Math.abs(Y - z.h / 2) * z.w / z.h ? Y : X) / 0.004;
      if (st < 0.0007 && (along % 1) < 0.65) { over(c, PAL.thread, 0.6); h -= 0.4; }
    }
    if (o.extra) o.extra(X, Y, c, out, P, Nn, ctx);
    // dust: lower and upward-facing surfaces collect a little
    const dust = clamp01(ss(-0.2, 0.7, N.fbm(P[0] * 12 + 9, P[1] * 12, P[2] * 12, 3)) * 0.25 + Math.max(0, Nn[1]) * 0.15) * (o.dust ?? 1);
    over(c, lin([150, 136, 112]), dust * 0.35);
    out.h = h * (o.hScale ?? 1); out.ro = ro; out.me = 0;
  };
}

/** Slot marker band: light-grey woven elastic with darker edges (tinted at runtime). */
function markerPaint(N) {
  return (P, Nn, lu, lv, out, ctx) => {
    const c = out.c, z = ctx.zone, X = lu * z.w, Y = lv * z.h;
    const v = 0.62 * (1 + N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 2) * 0.06);
    c[0] = c[1] = c[2] = v;
    const rib = Math.sin(Y * 2400) * 0.5 + 0.5;
    scale(c, 0.94 + rib * 0.08);
    const e = Math.min(lu, 1 - lu) * z.w;
    if (e < 0.0025) scale(c, 0.6);
    out.h = rib * 0.5 - (e < 0.0025 ? 0.8 : 0); out.ro = 0.8; out.me = 0;
    void X;
  };
}

/** Hard surfaces: paint / polymer / rubber with edge wear from a 3D noise. */
function hard(N, base, o = {}) {
  return (P, Nn, lu, lv, out, ctx) => {
    const c = out.c; c[0] = base[0]; c[1] = base[1]; c[2] = base[2];
    const z = ctx.zone, X = lu * z.w, Y = lv * z.h;
    const grain = N.noise(P[0] * 400, P[1] * 400, P[2] * 400);
    const blot = N.fbm(P[0] * 18, P[1] * 18, P[2] * 18, 3);
    scale(c, 1 + blot * (o.blot ?? 0.06) + grain * (o.grain ?? 0.04));
    out.h = grain * (o.bump ?? 0.4);
    out.ro = (o.rough ?? 0.6) + blot * 0.05;
    out.me = o.metal ?? 0;
    if (o.wear) {
      const w = ss(0.55, 0.8, N.fbm(P[0] * 40 + 2, P[1] * 40, P[2] * 40, 3)) * o.wear;
      over(c, o.wearColor || PAL.steel, w);
      out.ro = mix(out.ro, 0.45, w);
    }
    if (o.extra) o.extra(X, Y, c, out, P, Nn, ctx);
  };
}

/** Least-squares-free helpers */
function ray(bvh, o, d, max = 2) {
  const r = new THREE.Ray(o.clone(), d.clone().normalize());
  const h = bvh.raycastFirst(r, THREE.DoubleSide, 0, max);
  return h ? h.point.clone() : null;
}

/** Inverse-distance weights of the k nearest vertices of a lib Part, restricted to `allowed` bone names. */
function nearestWeights(part, sk, allowed, k = 6) {
  const allow = new Set(allowed.map((n) => sk.byName[n].index));
  const P = part.pos, n = part.nVerts;
  const used = new Uint8Array(n);
  for (const t of part.tris().filter((_, i) => i % 2 === 0)) used[t] = 1;
  const idx = [];
  for (let i = 0; i < n; i++) if (used[i]) idx.push(i);
  const fallback = sk.byName[allowed[0]].index;
  return (p) => {
    const best = [];
    for (const i of idx) {
      const d = (P[i * 3] - p.x) ** 2 + (P[i * 3 + 1] - p.y) ** 2 + (P[i * 3 + 2] - p.z) ** 2;
      if (best.length < k || d < best[best.length - 1][1]) {
        best.push([i, d]); best.sort((a, b) => a[1] - b[1]); if (best.length > k) best.pop();
      }
    }
    const acc = new Map();
    for (const [i, d] of best) {
      const w = 1 / (Math.sqrt(d) + 0.01);
      for (const [b, bw] of part.weights[i]) if (allow.has(b)) acc.set(b, (acc.get(b) || 0) + bw * w);
    }
    const l = [...acc.entries()];
    return l.length ? l : [[fallback, 1]];
  };
}

/** Removes faces of a lib Part that are covered (along their normals) by an occluder BVH within maxDist. */
function hideUnder(part, bvh, maxDist, filter = null) {
  const nrm = part.normals();
  const r = new THREE.Ray();
  const P = part.pos;
  const covered = new Int8Array(part.nVerts).fill(-1);
  const test = (v) => {
    if (covered[v] >= 0) return covered[v];
    r.origin.set(P[v * 3] + nrm[v * 3] * 0.002, P[v * 3 + 1] + nrm[v * 3 + 1] * 0.002, P[v * 3 + 2] + nrm[v * 3 + 2] * 0.002);
    r.direction.set(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
    covered[v] = bvh.raycastFirst(r, THREE.DoubleSide, 0, maxDist) ? 1 : 0;
    return covered[v];
  };
  const removed = [];
  part.obj.faces.forEach((f, fi) => {
    if (!part.keep[fi]) return;
    if (filter && !filter(f)) return;
    if (f.v.every((v) => test(v))) { part.keep[fi] = 0; removed.push(fi); }
  });
  return removed;
}

/**
 * Shrinks a set of removed faces by `rings` face rings: removed faces that share a vertex with a kept face come back.
 * Gear that moves a little off the body (soft cummerbund, plates in a crouch) then never opens a see-through hole.
 */
function erodeRemoved(part, removed, rings) {
  let set = removed.slice();
  for (let r = 0; r < rings; r++) {
    const keptV = new Uint8Array(part.nVerts);
    part.obj.faces.forEach((f, fi) => { if (part.keep[fi]) for (const v of f.v) keptV[v] = 1; });
    const back = set.filter((fi) => part.obj.faces[fi].v.some((v) => keptV[v]));
    for (const fi of back) part.keep[fi] = 1;
    const bs = new Set(back);
    set = set.filter((fi) => !bs.has(fi));
  }
  return set;
}

export async function build(lib) {
  const opts = lib.merge('muscular', {
    macro: { gender: 1, age: 0.62, muscle: 0.68, weight: 0.55, height: 0.53, proportions: 0.7, race: { caucasian: 0.85, asian: 0.15 } },
    modifiers: {
      'chin-width-decr-incr': 0.3, 'chin-prominent-decr-incr': 0.15, 'chin-bones-decr-incr': 0.25, 'head/head-square': 0.3,
      'eyebrows-trans-backward-forward': 0.2, 'measure-shoulder-dist-decr-incr': 0.15, 'neck-scale-horiz-decr-incr': 0.1,
      // a harder, weathered face (it read soft and young): cheekbones, leaner cheeks, jaw, nasolabial folds, hooded lids
      'cheek-bones-decr-incr': 0.35, 'cheek-volume-decr-incr': -0.3, 'chin-jaw-drop-decr-incr': 0.2, 'mouth-laugh-lines-in-out': 0.35,
      'head-age-decr-incr': 0.25, 'nose-hump-decr-incr': 0.15, 'eye-eyefold-down-up': 0.35, 'eyebrows-angle-down-up': -0.15,
      // adult male arm proportions (shoulder -> elbow 0.30 m, elbow -> wrist 0.275 m instead of 0.257 / 0.261): the
      // default MakeHuman arms are too short to hold a rifle at low ready in front of a plate carrier
      'measure-upperarm-length-decr-incr': 0.6, 'measure-lowerarm-length-decr-incr': 0.22,
    },
    // upper lids lowered a little: the iris stays covered at the top instead of a ring of sclera (a zombie cue)
    expression: { 'eyebrows-left-down': 0.12, 'eyebrows-right-down': 0.12, 'eye-left-closure': 0.2, 'eye-right-closure': 0.2 },
  });
  const h = await lib.Human.create(opts);
  const sk = h.skeleton.byName;
  const N = lib.makeNoise(31);
  const A = lib.anchors(h);
  const eyeY = (A.eyeL[1] + A.eyeR[1]) / 2;

  // ---------------------------------------------------------------------------------------------- CC0 parts
  const body = await h.proxyBody('male1591');
  const suit = await h.fit('clothes/male_casualsuit02', { name: 'uniform', role: 'cloth' });
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  const brows = await h.fit('eyebrows/eyebrow001', { name: 'eyebrows', role: 'hair', hide: false }); // placement only (painted brows)
  h.hideCovered(body);
  const basePart = h.basePart({ name: 'tmp' });
  const headBVH = bvhOf([{ pos: h.pos, tris: basePart.tris() }]); // whole base mesh (head / feet / shins)

  // ---------------------------------------------------------------------------------------------- combat boots
  // procedural high-top boots (boots.mjs) fitted round the base-mesh feet / shins; the trousers are tucked into the
  // shaft and bloused over its collar (the hem ring pulled in, a soft roll above the collar), everything hidden inside
  // the boot (trouser legs, feet and lower shins of the body) is removed
  const bootSh = bootShape(h, headBVH, { shaft: 0.145 });
  {
    let tucked = 0;
    for (let v = 0; v < suit.nVerts; v++) {
      if (![6, 7, 8, 9].includes(suit.seg[v])) continue;
      const x = suit.pos[v * 3], y = suit.pos[v * 3 + 1], z = suit.pos[v * 3 + 2];
      const S = bootSh[x > 0 ? 'l' : 'r'];
      if (y > S.yTop + 0.07) continue;
      const yy = Math.min(y, S.yTop);
      const c = S.radius(yy, 0).c;
      const ph = Math.atan2(x - c.x, z - c.z), rv = Math.hypot(x - c.x, z - c.z);
      const rOut = S.radius(yy, ph).r;
      let r;
      if (y < S.yTop - 0.022) r = Math.min(rv, rOut - 0.009);                                  // inside the shaft
      else {
        // blousing band: rolled over the collar (covers its top 2 cm), gathering back into the trouser leg above
        const t = (y - (S.yTop - 0.022)) / 0.095;
        const roll = rOut + 0.011 + 0.008 * Math.sin(Math.min(1, t * 1.8) * Math.PI);
        r = mix(roll, Math.max(rv, rOut + 0.006), ss(0.4, 1, t));
      }
      suit.pos[v * 3] = c.x + Math.sin(ph) * r; suit.pos[v * 3 + 2] = c.z + Math.cos(ph) * r;
      tucked++;
    }
    // trouser faces deep inside the shaft and the body's feet / lower shins are never seen
    let hiddenT = 0, hiddenB = 0;
    const top = Math.min(bootSh.l.yTop, bootSh.r.yTop);
    suit.obj.faces.forEach((f, fi) => { if (suit.keep[fi] && f.v.every((v) => suit.pos[v * 3 + 1] < top - 0.035)) { suit.keep[fi] = 0; hiddenT++; } });
    body.obj.faces.forEach((f, fi) => { if (body.keep[fi] && f.v.every((v) => body.pos[v * 3 + 1] < top - 0.02)) { body.keep[fi] = 0; hiddenB++; } });
    console.log(`soldier: boots top ${top.toFixed(3)} m, ${tucked} trouser vertices tucked / bloused, hidden faces: trousers ${hiddenT}, body ${hiddenB}`);
  }

  // trousers under the knee caps follow the shin like the caps do (the caps are rigid on the calf): otherwise the
  // linear-blend knee front collapses when the knee bends and the cap floats a few cm off the leg (done before the
  // gear is built: the knee-pad straps copy these trouser weights)
  {
    let pinned = 0;
    for (const s of ['l', 'r']) {
      const th = sk[`thigh_${s}`], ca = sk[`calf_${s}`];
      const knee = ca.head.clone();
      const ax = th.tail.clone().sub(th.head).normalize().add(ca.tail.clone().sub(ca.head).normalize()).normalize().negate();
      const fwd = V3(0, 0, 1).addScaledVector(ax, -ax.z).normalize();
      const side = ax.clone().cross(fwd).normalize();
      const iC = ca.index, iT = th.index;
      const legSegs = s === 'l' ? [6, 7] : [8, 9];
      for (let i = 0; i < suit.nVerts; i++) {
        if (!legSegs.includes(suit.seg[i])) continue;
        const d = V3(suit.pos[i * 3], suit.pos[i * 3 + 1], suit.pos[i * 3 + 2]).sub(knee);
        const t = d.dot(ax);
        d.addScaledVector(ax, -t);
        const a = Math.atan2(d.dot(side), d.dot(fwd));
        const f = (1 - ss(0.05, 0.085, Math.abs(t - 0.005))) * (1 - ss(0.7, 1.15, Math.abs(a)));
        if (f <= 0) continue;
        const wt = ss(0.0, 0.08, t) * 0.25;
        const acc = new Map();
        for (const [b, w] of suit.weights[i]) acc.set(b, (acc.get(b) || 0) + w * (1 - f));
        acc.set(iC, (acc.get(iC) || 0) + f * (1 - wt));
        acc.set(iT, (acc.get(iT) || 0) + f * wt);
        let list = [...acc.entries()].filter(([, w]) => w > 1e-4).sort((p, q) => q[1] - p[1]).slice(0, 4);
        const sum = list.reduce((x, [, w]) => x + w, 0);
        suit.weights[i] = list.map(([b, w]) => [b, w / sum]);
        pinned++;
      }
    }
    console.log(`soldier: ${pinned} trouser vertices pinned under the knee caps`);
  }

  const suitBVH = bvhOf([{ pos: suit.pos, tris: suit.tris() }]);
  // per-segment BVHs (rays round the torso / one leg must not hit an arm or the other leg)
  const segBVH = (segs) => {
    const t = suit.tris(), out = [];
    for (let i = 0; i < t.length; i += 6) if (segs.includes(suit.seg[t[i]]) && segs.includes(suit.seg[t[i + 2]]) && segs.includes(suit.seg[t[i + 4]])) out.push(...t.slice(i, i + 6));
    return bvhOf([{ pos: suit.pos, tris: Int32Array.from(out) }]);
  };
  const torsoBVH = segBVH([0]);
  const legBVH = { l: segBVH([6, 7]), r: segBVH([8, 9]) };
  const torsoW = nearestWeights(suit, h.skeleton, ['spine_03', 'spine_02', 'spine_01', 'pelvis']);
  const shoulderW = nearestWeights(suit, h.skeleton, ['spine_03', 'clavicle_l', 'clavicle_r']);
  // battle belt: pelvis-dominant (the trousers' thigh weights at the groin creased and thinned its front when the
  // thigh lifted in a run / crouch)
  const hipW = nearestWeights(suit, h.skeleton, ['pelvis', 'spine_01']);
  // knee-pad straps copy the (pinned) trouser weights round the knee: rigid on the calf, the lower strap left the leg
  // as a loose loop in a deep crouch
  const kneeStrapW = { l: nearestWeights(suit, h.skeleton, ['thigh_l', 'calf_l'], 4), r: nearestWeights(suit, h.skeleton, ['thigh_r', 'calf_r'], 4) };
  /** a * (1 - t) + b * t of two weight lists. */
  const blendW = (a, b, t) => { const m = new Map(); for (const [k, w] of a) m.set(k, (m.get(k) || 0) + w * (1 - t)); for (const [k, w] of b) m.set(k, (m.get(k) || 0) + w * t); return [...m.entries()]; };

  // ---------------------------------------------------------------------------------------------- gear zones
  const G = { zones: null };
  const neckY = sk.neck_01.head.y;
  const plate = { top: neckY - 0.075, h: 0.32, a: 0.132, th: 0.03 };
  plate.bot = plate.top - plate.h;
  plate.yc = (plate.top + plate.bot) / 2;
  const plateB = { top: neckY - 0.06, h: 0.335, a: 0.134, th: 0.03 };
  plateB.bot = plateB.top - plateB.h;
  plateB.yc = (plateB.top + plateB.bot) / 2;

  /** Fits a plate's inner surface to the shirt: depth(x, y) = d0 + s (y - yc) - x^2 / 2R - (y - yc)^2 / 2Ry. */
  const fitPlate = (pl, side) => {
    const R = 0.3, Ry = 1.1, cl = 0.007;
    const S = [];
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
      const x = (i / 10 * 2 - 1) * (pl.a + 0.012), y = pl.bot - 0.012 + j / 10 * (pl.h + 0.024);
      const p = ray(suitBVH, V3(x, y, side * 0.6), V3(0, 0, -side));
      if (p) S.push([x, y, p.z * side]);
    }
    let sy = 0, sr = 0, syy = 0, syr = 0;
    const res = S.map(([x, y, d]) => [y - pl.yc, d + x * x / (2 * R) + (y - pl.yc) ** 2 / (2 * Ry)]);
    for (const [y, r] of res) { sy += y; sr += r; syy += y * y; syr += y * r; }
    const n = res.length, s = (n * syr - sy * sr) / (n * syy - sy * sy);
    let d0 = -Infinity;
    for (const [y, r] of res) d0 = Math.max(d0, r - s * y);
    d0 += cl;
    const depth = (x, y) => d0 + s * (y - pl.yc) - x * x / (2 * R) - (y - pl.yc) ** 2 / (2 * Ry);
    const normal = (x, y) => V3(x / R, -s + (y - pl.yc) / Ry, side).normalize();
    return { depth, normal, side, R };
  };
  const PF = fitPlate(plate, 1), PB = fitPlate(plateB, -1);
  // plate surface point (world) at plate coords (x = world X for the front, -X for the back) and offset off the inner face
  const plateAt = (pl, F, x, y, off) => {
    const X = F.side * x;
    const n = F.normal(X, y);
    return { p: V3(X, y, F.side * F.depth(X, y)).addScaledVector(n, off), n };
  };

  // belt height: just above the trouser waistband
  const beltY = sk.pelvis.head.y + 0.035;

  const zones = (B) => {
    const Z = {};
    const molleFront = fabric(N, PAL.coyote, { binding: 0.009, velcro: [[0.045, 0.2, 0.215, 0.285, (x, y, w, hh, c, out) => {
      // name tape + blood-type tape (subdued, unreadable at game distance: bars instead of letters)
      if (y > hh * 0.5 && y < hh * 0.9 && x > w * 0.08 && x < w * 0.92) {
        over(c, PAL.olive, 0.9); out.h += 0.6;
        const ch = Math.floor((x - w * 0.15) / 0.009);
        if (x > w * 0.15 && x < w * 0.85 && y > hh * 0.6 && y < hh * 0.8 && hash2(ch, 3) > 0.25 && ((x - w * 0.15) / 0.009 % 1) < 0.7) over(c, lin([40, 40, 34]), 0.8);
      }
    }]] });
    Z.plateF = B.zone('plateF', plate.a * 2, plate.h, molleFront);
    Z.plateB = B.zone('plateB', plateB.a * 2, plateB.h, fabric(N, PAL.coyote, { binding: 0.009, molle: { y0: 0.03, x0: 0.03, x1: plateB.a * 2 - 0.03, rows: 5 } }));
    Z.plateEdge = B.zone('plateEdge', 1.1, plate.th * 1.2, fabric(N, PAL.coyoteDark, { dust: 0.5 }));
    // laser-cut style MOLLE (flatter): the webbing relief sawtoothed where the panel compressed in a crouch
    Z.cummer = B.zone('cummer', 0.17, 0.3, fabric(N, PAL.coyote, { molle: { y0: 0.012, x0: 0.015, x1: 0.3 - 0.015, rows: 3, vertical: true }, binding: 0.007, hScale: 0.45 }));
    Z.strap = B.zone('strap', 0.06, 0.55, fabric(N, PAL.coyote, { binding: 0.006, extra: (X, Y, c, out) => {
      // padded shoulder: quilted channels along the strap
      const q = Math.abs(((X / 0.06) * 3) % 1 - 0.5);
      out.h += (1 - q * 2) * 1.2; scale(c, 0.92 + (1 - q * 2) * 0.1);
    } }));
    Z.strapEdge = B.zone('strapEdge', 0.02, 0.55, fabric(N, PAL.coyoteDark, { dust: 0.3 }));
    Z.pouch = B.zone('pouch', 0.072, 0.115, fabric(N, PAL.coyote, { binding: 0.006, extra: (X, Y, c, out) => {
      // elastic side gussets and a horizontal bungee channel near the top
      if (Math.abs(Y - 0.092) < 0.004) { scale(c, 0.75); out.h += 0.5; }
      if (X < 0.008 || X > 0.064) { scale(c, 0.85); out.h += Math.sin(Y * 1600) * 0.3; }
    } }), { scale: 1.3 });
    Z.pouchSide = B.zone('pouchSide', 0.6, 0.04, fabric(N, PAL.coyoteDark, { dust: 0.4 }));
    Z.mag = B.zone('mag', 0.07, 0.07, hard(N, PAL.polymer, { rough: 0.5, grain: 0.02, bump: 0.15, wear: 0.12, wearColor: lin([70, 70, 68]), extra: (X, Y, c, out) => {
      // floor plate (the mags ride bullets-down: the visible end is the base) + a grip-texture band
      if (Y > 0.056) { scale(c, 1.25); out.h += 0.8; }
      if (Y > 0.05 && Y < 0.054) { scale(c, 0.6); out.h -= 0.8; }
    } }), { scale: 1.3 });
    Z.magSide = B.zone('magSide', 0.2, 0.06, hard(N, PAL.polymer, { rough: 0.55, grain: 0.02, bump: 0.15 }));
    Z.admin = B.zone('admin', 0.08, 0.1, fabric(N, PAL.coyote, { binding: 0.006, extra: (X, Y, c, out) => {
      // zip pull + flap edge
      if (Math.abs(Y - 0.072) < 0.0035) { over(c, PAL.black, 0.7); out.h -= 0.6; }
      if (Math.abs(X - 0.04) < 0.004 && Y > 0.06 && Y < 0.08) { over(c, PAL.black, 0.9); out.h += 0.8; }
    } }), { scale: 1.2 });
    Z.radio = B.zone('radio', 0.075, 0.16, fabric(N, PAL.coyote, { binding: 0.006, molle: { y0: 0.02, x0: 0.01, x1: 0.065, rows: 2 } }));
    Z.antenna = B.zone('antenna', 0.05, 0.4, hard(N, PAL.black, { rough: 0.5 }));
    Z.belt = B.zone('belt', 0.05, 1.05, fabric(N, PAL.coyote, { molle: { y0: 0.004, x0: 0, x1: 1.05, rows: 1, vertical: true }, binding: 0.004 }));
    Z.beltEdge = B.zone('beltEdge', 0.02, 1.05, fabric(N, PAL.coyoteDark, { dust: 0.4 }));
    Z.buckle = B.zone('buckle', 0.06, 0.05, hard(N, PAL.black, { rough: 0.45, wear: 0.4, wearColor: PAL.steel, metal: 0.4 }));
    Z.ifak = B.zone('ifak', 0.12, 0.09, fabric(N, PAL.coyote, { binding: 0.007, extra: (X, Y, c, out) => {
      // red cross-free medical tab: subdued pull handle stripe
      if (Math.abs(X - 0.06) < 0.012 && Y > 0.07) { over(c, lin([118, 40, 34]), 0.75); out.h += 0.6; }
      if (Math.abs(Y - 0.06) < 0.003) { over(c, PAL.black, 0.6); out.h -= 0.5; }
    } }));
    Z.holster = B.zone('holster', 0.07, 0.2, hard(N, PAL.polymer, { rough: 0.5, wear: 0.15, extra: (X, Y, c, out) => {
      if (Math.abs(X - 0.035) < 0.002) { out.h -= 0.8; scale(c, 0.8); }
    } }));
    Z.pistol = B.zone('pistol', 0.05, 0.06, hard(N, PAL.black, { rough: 0.45, extra: (X, Y, c, out) => {
      const st = Math.abs(Math.sin(X * 900) * Math.sin(Y * 900)); out.h += st * 0.6;
    } }));
    Z.legStrap = B.zone('legStrap', 0.04, 0.35, fabric(N, PAL.black, { rough: 0.8, extra: (X, Y, c, out) => { out.h += Math.sin(Y * 2600) * 0.15; } }));
    Z.helmet = B.zone('helmet', 0.82, 0.24, hard(N, PAL.helmet, { rough: 0.62, grain: 0.04, bump: 0.45, blot: 0.05, wear: 0.1, wearColor: lin([96, 90, 78]), extra: (X, Y, c, out, P) => {
      // velcro loop patches: crown + both sides (az = u)
      const u = X / 0.82, v = Y / 0.24;
      const patch = (u0, u1, v0, v1) => u > u0 && u < u1 && v > v0 && v < v1;
      if (patch(0.38, 0.62, 0.55, 0.9) || patch(0.14, 0.26, 0.3, 0.55) || patch(0.74, 0.86, 0.3, 0.55)) {
        over(c, mix(1, 0, 0) ? PAL.helmet : PAL.helmet.map((q) => q * 0.78), 0.9);
        scale(c, 1 + N.noise(X * 900, Y * 900, 3) * 0.1); out.ro = 0.95; out.h += 0.7;
      }
      // IR strobe square / subdued flag on the back patch
      if (patch(0.47, 0.53, 0.6, 0.68)) { over(c, lin([60, 62, 52]), 0.9); out.h += 0.4; }
      // scuffs on the crown
      const sc = ss(0.62, 0.8, N.fbm(P[0] * 60, P[1] * 25, P[2] * 60, 2));
      over(c, lin([170, 160, 140]), sc * 0.35);
    } }));
    Z.trim = B.zone('trim', 0.82, 0.03, hard(N, PAL.rubber, { rough: 0.7, grain: 0.05 }));
    Z.rail = B.zone('rail', 0.03, 0.16, hard(N, lin([58, 56, 50]), { rough: 0.55, grain: 0.02, bump: 0.1, wear: 0.1, extra: (X, Y, c, out) => {
      const s = Math.abs(((Y / 0.012) % 1) - 0.5); if (s < 0.18) { out.h -= 1; scale(c, 0.7); }
    } }));
    Z.shroud = B.zone('shroud', 0.06, 0.05, hard(N, PAL.black, { rough: 0.45, metal: 0.3, wear: 0.35, wearColor: lin([90, 92, 96]) }));
    const gogglePix = (X, Y, out) => {
      const c = out.c;
      // two oval lenses (ballistic spectacles style) in a tan polymer frame with a nose bridge and a black rubber
      // gasket round each lens; foam vent strip along the top
      const lensD = (cx) => Math.hypot((X - cx) / 0.043, (Y - 0.026) / 0.0185);
      const d = Math.min(lensD(0.053), lensD(0.147)), cx = lensD(0.053) < lensD(0.147) ? 0.053 : 0.147;
      if (d > 1) {
        const ey = Math.min(Y, 0.055 - Y);
        const vent = ey < 0.006 && Y > 0.03;
        const gasket = d < 1.16;
        const col = vent ? PAL.black : gasket ? PAL.rubber : PAL.coyoteLight;
        c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
        out.ro = vent ? 0.9 : gasket ? 0.7 : 0.55; out.me = 0;
        out.h = (gasket ? 0.5 : 1.3) + N.noise(X * 500, Y * 500, 2) * 0.2 - (Math.abs(X - 0.1) < 0.006 && Y < 0.016 ? 0.8 : 0);
        if (!vent && !gasket) scale(c, 1 + N.fbm(X * 90, Y * 90, 4, 2) * 0.08);
      } else {
        // light smoke / bronze tint (reads as a lens, not a black visor): darker at the top, a faint gradient sheen
        // and a soft highlight band; low roughness + a little metalness so it reflects the sky
        const k = ss(0.004, 0.04, Y);
        const tint = [0.13, 0.105, 0.07];
        c[0] = tint[0] * mix(1.15, 0.55, k); c[1] = tint[1] * mix(1.15, 0.55, k); c[2] = tint[2] * mix(1.2, 0.6, k);
        const band = Math.exp(-((((X - cx) * 0.7 + (Y - 0.034)) / 0.004) ** 2)) * (1 - d);
        over(c, [0.32, 0.3, 0.27], band * 0.35);
        out.ro = 0.05; out.me = 0.35; out.h = 0;
      }
    };
    Z.goggle = B.zone('goggle', 0.2, 0.055, (P, Nn, lu, lv, out, ctx) => {
      const R = ctx.R, dx = 0.2 / ((R.u1 - R.u0) * ctx.S), dy = 0.055 / ((R.v1 - R.v0) * ctx.S);
      const acc = [0, 0, 0], sub = { c: [0, 0, 0], ro: 0, me: 0, h: 0 };
      let ro = 0, me = 0, hh = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        gogglePix(lu * 0.2 + i * dx / 3, lv * 0.055 + j * dy / 3, sub);
        for (let k = 0; k < 3; k++) acc[k] += sub.c[k] / 9;
        ro += sub.ro / 9; me += sub.me / 9; hh += sub.h / 9;
      }
      out.c[0] = acc[0]; out.c[1] = acc[1]; out.c[2] = acc[2]; out.ro = ro; out.me = me; out.h = hh;
    }, { scale: 2 });
    Z.goggleStrap = B.zone('goggleStrap', 0.035, 0.6, fabric(N, PAL.coyoteLight, { rough: 0.8, extra: (X, Y, c, out) => {
      out.h += Math.sin(Y * 1800) * 0.25; if (X < 0.004 || X > 0.031) scale(c, 0.8);
    } }));
    Z.cup = B.zone('cup', 0.27, 0.035, hard(N, PAL.olive, { rough: 0.6, grain: 0.02, bump: 0.12, wear: 0.1, wearColor: lin([96, 98, 84]) }));
    Z.cupCap = B.zone('cupCap', 0.085, 0.085, hard(N, PAL.olive, { rough: 0.5, extra: (X, Y, c, out) => {
      const r = Math.hypot(X - 0.0425, Y - 0.0425);
      if (r > 0.03 && r < 0.034) { out.h -= 1; scale(c, 0.75); }
      if (Math.abs(X - 0.0425) < 0.006 && Math.abs(Y - 0.06) < 0.006) { over(c, PAL.black, 0.9); out.h += 1; } // volume knob
    } }));
    Z.mic = B.zone('mic', 0.03, 0.12, hard(N, PAL.black, { rough: 0.6 }));
    {
      // both hands' UV islands side by side; ~2.4 m per skin-UV unit keeps the texel density of the other gear
      const [l, r] = [G.gloveUV.l, G.gloveUV.r];
      Z.glove = B.zone('glove', ((l[2] - l[0]) + (r[2] - r[0])) * 2.4, Math.max(l[3] - l[1], r[3] - r[1]) * 2.4, null); // painter set below
    }
    Z.kneeCap = B.zone('kneeCap', 0.15, 0.13, hard(N, PAL.rubber, { rough: 0.65, grain: 0.08, bump: 0.8, extra: (X, Y, c, out) => {
      // ribbed hard cap
      const rib = Math.abs(((Y / 0.018) % 1) - 0.5) * 2;
      out.h += (1 - rib) * 1.5; scale(c, 0.85 + (1 - rib) * 0.3);
      const sc = ss(0.6, 0.85, N.noise(X * 120, Y * 120, 5)); over(c, lin([110, 104, 94]), sc * 0.35);
    } }));
    Z.kneeEdge = B.zone('kneeEdge', 0.5, 0.02, fabric(N, PAL.coyoteDark, {}));
    Z.kneeStrap = B.zone('kneeStrap', 0.025, 0.3, fabric(N, PAL.coyote, { extra: (X, Y, c, out) => { out.h += Math.sin(Y * 2600) * 0.15; } }));
    return Z;
  };

  // ---------------------------------------------------------------------------------------------- gear geometry
  const headTop = h.height;
  // head shape for the helmet: max head extent per direction from a centre in the cranium
  const headVerts = [...h.baseObj.groupVerts('body')].filter((v) => h.pos[v * 3 + 1] > eyeY - 0.07);
  const zFront = Math.max(...headVerts.filter((v) => Math.abs(h.pos[v * 3 + 1] - (eyeY + 0.045)) < 0.008 && Math.abs(h.pos[v * 3]) < 0.02).map((v) => h.pos[v * 3 + 2]));
  const zBack = Math.min(...headVerts.filter((v) => Math.abs(h.pos[v * 3 + 1] - (eyeY + 0.045)) < 0.008 && Math.abs(h.pos[v * 3]) < 0.02).map((v) => h.pos[v * 3 + 2]));
  const HC = V3(0, eyeY + 0.025, (zFront + zBack) / 2 - 0.004);
  const NAZ = 28, NEL = 12;
  const radialHead = (() => {
    // r(az, el) on a grid, cone-max over head vertices, then smoothed
    const grid = [];
    const P = headVerts.map((v) => V3(h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]).sub(HC));
    const cosCone = Math.cos(13 * DEG);
    for (let j = 0; j <= 18; j++) {
      const row = [];
      const el = -45 * DEG + j / 18 * 135 * DEG;
      for (let i = 0; i < 36; i++) {
        const az = i / 36 * Math.PI * 2;
        const d = V3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
        let r = 0;
        for (const p of P) { const l = p.length(); if (l > 0 && p.dot(d) / l > cosCone) r = Math.max(r, p.dot(d)); }
        row.push(r);
      }
      grid.push(row);
    }
    for (let it = 0; it < 3; it++) for (let j = 0; j <= 18; j++) {
      const row = grid[j].slice();
      for (let i = 0; i < 36; i++) grid[j][i] = Math.max(row[i], (row[(i + 35) % 36] + row[i] * 2 + row[(i + 1) % 36]) / 4);
    }
    return (az, el) => {
      const fj = Math.max(0, Math.min(17.999, (el + 45 * DEG) / (135 * DEG) * 18));
      const fi = ((az / (Math.PI * 2)) * 36 % 36 + 36) % 36;
      const j0 = Math.floor(fj), i0 = Math.floor(fi), tj = fj - j0, ti = fi - i0;
      const g = (j, i) => grid[j][i % 36];
      return (g(j0, i0) * (1 - ti) + g(j0, i0 + 1) * ti) * (1 - tj) + (g(j0 + 1, i0) * (1 - ti) + g(j0 + 1, i0 + 1) * ti) * tj;
    };
  })();
  const helmetR = (az, el) => Math.max(radialHead(az, el), 0.095) + 0.018 + 0.004 * Math.cos(el);
  const helmetP = (az, el, off = 0) => {
    const d = V3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    return HC.clone().addScaledVector(d, helmetR(az, el) + off);
  };
  // rim height (relative to the eye line) around the head: brow line at the front, high cut over the ears, nape at the back
  const RIM = [[0, 0.04], [30, 0.041], [55, 0.043], [72, 0.04], [92, 0.036], [112, 0.032], [135, 0.012], [160, -0.022], [180, -0.03]];
  const rimY = (az) => {
    const a = Math.abs(((az / DEG + 540) % 360) - 180); // 0 front .. 180 back
    for (let k = 1; k < RIM.length; k++) if (a <= RIM[k][0]) { const t = (a - RIM[k - 1][0]) / (RIM[k][0] - RIM[k - 1][0]); const s = t * t * (3 - 2 * t); return eyeY + RIM[k - 1][1] + (RIM[k][1] - RIM[k - 1][1]) * s; }
    return eyeY + RIM[RIM.length - 1][1];
  };
  const rimEl = (az) => {
    let lo = -60 * DEG, hi = 70 * DEG;
    const y = rimY(az);
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (helmetP(az, m).y < y) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  const helmetSurf = (az, v) => { const e0 = rimEl(az); return e0 + (88 * DEG - e0) * v ** 0.85; };
  const ear = { l: null, r: null };
  for (const s of ['l', 'r']) {
    const sx = s === 'l' ? 1 : -1;
    const y = eyeY - 0.012, z = HC.z - 0.012;
    const p = ray(headBVH, V3(sx * 0.3, y, z), V3(-sx, 0, 0));
    ear[s] = p || V3(sx * 0.08, y, z);
  }

  // hand faces of the body proxy (glove shell) and their skin-UV bounds
  const handSel = {};
  for (const s of ['l', 'r']) {
    const fa = sk[`lowerarm_${s}`], hb = sk[`hand_${s}`];
    const dir = fa.tail.clone().sub(fa.head).normalize();
    const cuff = hb.head.clone().addScaledVector(dir, -0.035);
    const inHand = (v) => V3(body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]).sub(cuff).dot(dir) > 0 && Math.abs(body.pos[v * 3]) > 0.3;
    const uvs = body.obj.uvs;
    let mnu = 1, mxu = 0, mnv = 1, mxv = 0;
    body.obj.faces.forEach((f) => { if (f.v.every(inHand)) for (const t of f.t) { mnu = Math.min(mnu, uvs[t * 2]); mxu = Math.max(mxu, uvs[t * 2]); mnv = Math.min(mnv, uvs[t * 2 + 1]); mxv = Math.max(mxv, uvs[t * 2 + 1]); } });
    (G.gloveUV ||= {})[s] = [mnu, mnv, mxu, mxv];
    handSel[s] = { dir, inHand };
  }
  console.log('glove uv bounds', JSON.stringify(G.gloveUV));

  const buildGear = (q) => {
    const B = new Builder(h.skeleton);
    const Z = zones(B);
    G.Z = Z;
    const R = (n) => Math.max(2, Math.round(n * q));
    const lod = q < 0.6; // LOD1: skip the small details (they are sub-pixel at LOD1 distance)
    const headW = B.rigid('head');
    // the plate bags hold rigid plates: one fixed blend for the whole bag and everything mounted on it, so they move
    // as a unit with the upper chest instead of bending like fabric (only the cummerbunds / shoulder straps are soft)
    const plateW = B.rigid({ spine_03: 0.72, spine_02: 0.28 });

    // ---- plate carrier: front / back plate bags
    for (const [pl, F, zf] of [[plate, PF, Z.plateF], [plateB, PB, Z.plateB]]) {
      panel(B, {
        half: [pl.a, pl.h / 2], th: pl.th, n: 7, res: [R(6), R(8)], bevel: 0.006,
        surf: (x, y) => { const s = plateAt(pl, F, x, y + pl.yc, pl.th / 2); return s; },
        face: zf, back: null, edge: Z.plateEdge, wfn: plateW,
      });
    }
    // ---- cummerbunds (each side, from under the front plate round the flank to under the back plate)
    for (const sx of [1, -1]) {
      const y0 = plate.bot - 0.012, y1 = plate.bot + 0.15, ym = (y0 + y1) / 2;
      const pts = [], ups = [];
      const zc = (PF.depth(0, ym) - PB.depth(0, ym)) / 2;
      const front = plateAt(plate, PF, sx * (plate.a - 0.035), ym, -0.004).p;
      const back = plateAt(plateB, PB, -sx * (plateB.a - 0.035), ym, -0.004).p;
      const phF = Math.atan2(sx * plate.a, PF.depth(sx * plate.a, ym) - zc), phB = Math.atan2(sx * plateB.a, -PB.depth(sx * plateB.a, ym) - zc);
      pts.push(front); ups.push(PF.normal(sx * plate.a, ym).add(V3(sx * 0.6, 0, 0)).normalize());
      const nS = R(9);
      for (let k = 0; k <= nS; k++) {
        const ph = phF + (phB - phF) * k / nS;
        const d = V3(Math.sin(ph), 0, Math.cos(ph));
        let best = 0;
        for (const y of [y0 + 0.01, ym, y1 - 0.015]) {
          const o = V3(0, y, zc).addScaledVector(d, 0.3);
          const p = ray(torsoBVH, o, d.clone().negate(), 0.3);
          if (p) best = Math.max(best, Math.hypot(p.x, p.z - zc));
        }
        // blend into the plate edges at both ends
        let pnt = V3(0, ym, zc).addScaledVector(d, best + 0.006);
        pts.push(pnt); ups.push(d.clone());
      }
      pts.push(back); ups.push(PB.normal(-sx * plateB.a, ym).add(V3(sx * 0.6, 0, 0)).normalize());
      if (sx < 0) { pts.reverse(); ups.reverse(); }
      // half the plate block's fixed spine_03 / spine_02 blend, half the shirt's weights: the band bends with the waist
      // without folding into a wedge between the plates
      strap(B, pts, ups, { width: y1 - y0, thick: 0.009, zone: Z.cummer, edgeZone: Z.strapEdge, wfn: (p) => blendW(plateW(p), torsoW(p), 0.5) });
    }
    // ---- padded shoulder straps
    for (const sx of [1, -1]) {
      const xs = sx * 0.088;
      const O = V3(xs, neckY - 0.035, sk.neck_01.head.z - 0.01);
      const pts = [], ups = [];
      const fTop = plateAt(plate, PF, xs, plate.top - 0.025, plate.th + 0.002);
      pts.push(fTop.p); ups.push(fTop.n);
      const nS = R(10);
      for (let k = 0; k <= nS; k++) {
        const psi = 1.75 - 3.5 * k / nS;
        const d = V3(0, Math.cos(psi), Math.sin(psi));
        const p = ray(suitBVH, O.clone().addScaledVector(d, 0.3), d.clone().negate(), 0.3);
        if (!p) continue;
        if ((d.z > 0 && p.y < plate.top + 0.01) || (d.z < 0 && p.y < plateB.top + 0.01)) continue;
        pts.push(p.addScaledVector(d, 0.005)); ups.push(d);
      }
      const bTop = plateAt(plateB, PB, -xs, plateB.top - 0.025, plateB.th + 0.002);
      pts.push(bTop.p); ups.push(bTop.n);
      strap(B, pts, ups, { width: 0.064, thick: 0.014, zone: Z.strap, edgeZone: Z.plateEdge, wfn: shoulderW });
    }
    // ---- triple mag pouch + mags on the lower front
    const onFront = (x, y, off) => plateAt(plate, PF, x, y, plate.th + off);
    for (let k = -1; k <= 1; k++) {
      const x = k * 0.076, y = plate.bot + 0.018 + 0.0575;
      const s = onFront(x, y, 0.0175);
      const ex = V3(1, 0, 0).addScaledVector(s.n, -s.n.x).normalize();
      const ey = s.n.clone().cross(ex).normalize();
      box(B, s.p, ex, ey, s.n, [0.072, 0.115, 0.035], { face: Z.pouch, back: null, edge: Z.pouchSide, wfn: plateW, res: [R(2), R(3)], n: 10, bevel: 0.004,
        bulge: (u, v) => 0.004 * (1 - u * u) * (1 - v * v) });
      // mag body sticking out of the top (slightly curved forward)
      const top = s.p.clone().addScaledVector(ey, 0.0575);
      const mc = top.clone().addScaledVector(ey, 0.005).addScaledVector(s.n, 0.001);
      box(B, mc, ex, ey, s.n, [0.064, 0.07, 0.024], { face: Z.mag, back: null, edge: Z.magSide, wfn: plateW, res: [1, R(2)], n: 10, bevel: 0.003 });
    }
    // ---- admin pouch (upper left chest) and a velcro panel stays visible on the right
    {
      const s = onFront(0.07, plate.top - 0.075, 0.016);
      const ex = V3(1, 0, 0).addScaledVector(s.n, -s.n.x).normalize(), ey = s.n.clone().cross(ex).normalize();
      box(B, s.p, ex, ey, s.n, [0.075, 0.095, 0.032], { face: Z.admin, back: null, edge: Z.pouchSide, wfn: plateW, res: [R(2), R(2)], n: 10, bevel: 0.004,
        bulge: (u, v) => 0.005 * (1 - u * u) * (1 - v * v) });
    }
    // ---- radio pouch on the back (left) + whip antenna past the left shoulder
    {
      const s = plateAt(plateB, PB, -0.075, plateB.yc + 0.02, plateB.th + 0.022);
      const ex = V3(-1, 0, 0).addScaledVector(s.n, -s.n.x).normalize(), ey = s.n.clone().cross(ex).normalize();
      box(B, s.p, ex, ey, s.n, [0.075, 0.16, 0.045], { face: Z.radio, back: null, edge: Z.pouchSide, wfn: plateW, res: [R(2), R(3)], n: 10, bevel: 0.005 });
      const base = s.p.clone().addScaledVector(ey, 0.08).addScaledVector(s.n, -0.005).addScaledVector(ex, 0.02);
      cylinder(B, base, V3(0.06, 1, -0.12).normalize(), [0.007, 0.0035], 0.05, { zone: Z.antenna, wfn: plateW, sides: R(6), caps: null });
      cylinder(B, base.clone().addScaledVector(V3(0.06, 1, -0.12).normalize(), 0.05), V3(0.08, 1, -0.2).normalize(), [0.0032, 0.0018], 0.34, { zone: Z.antenna, wfn: plateW, sides: Math.max(3, R(4)), caps: 'end' });
    }
    // ---- battle belt + IFAK + holster
    {
      const pts = [], ups = [];
      const nS = R(22);
      const zc = sk.pelvis.head.z;
      for (let k = 0; k <= nS; k++) {
        const ph = k / nS * Math.PI * 2;
        const d = V3(Math.sin(ph), 0, Math.cos(ph));
        let best = 0;
        for (const y of [beltY - 0.02, beltY, beltY + 0.02]) {
          const p = ray(torsoBVH, V3(0, y, zc).addScaledVector(d, 0.3), d.clone().negate(), 0.3);
          if (p) best = Math.max(best, Math.hypot(p.x, p.z - zc));
        }
        pts.push(V3(0, beltY, zc).addScaledVector(d, best + 0.004)); ups.push(d);
      }
      strap(B, pts, ups, { width: 0.048, thick: 0.012, zone: Z.belt, edgeZone: Z.beltEdge, wfn: hipW });
      // buckle at the front
      const f = pts[0];
      if (!lod) box(B, f.clone().addScaledVector(ups[0], 0.014), V3(1, 0, 0), V3(0, 1, 0), ups[0], [0.055, 0.042, 0.008], { face: Z.buckle, edge: Z.buckle, back: null, wfn: hipW, res: [1, 1], n: 8, bevel: 0.002 });
      // IFAK at the back right
      const ph = Math.PI * 1.12, d = V3(Math.sin(ph), 0, Math.cos(ph));
      const pb = pts[Math.round(nS * 0.56)];
      const ex = V3(0, 1, 0).cross(d).normalize();
      box(B, pb.clone().addScaledVector(d, 0.04).addScaledVector(V3(0, 1, 0), -0.01), ex, V3(0, 1, 0), d, [0.125, 0.09, 0.065], { face: Z.ifak, edge: Z.pouchSide, back: null, wfn: hipW, res: [R(2), R(2)], n: 9, bevel: 0.006,
        bulge: (u, v) => 0.008 * (1 - u * u) * (1 - v * v) });
    }
    // ---- drop-leg holster on the right thigh (platform hangs from the belt, pistol grip sticks out at the top)
    {
      const th = sk.thigh_r;
      const along = th.tail.clone().sub(th.head).normalize();
      const out = V3(-1, 0, 0.15).normalize();
      const t0 = th.head.clone().lerp(th.tail, 0.36);
      const p = ray(legBVH.r, t0.clone().addScaledVector(out, 0.3), out.clone().negate(), 0.3) || t0.clone().addScaledVector(out, 0.09);
      const c = p.clone().addScaledVector(out, 0.022);
      const ey = along.clone().negate(), ez = out.clone(), ex = ey.clone().cross(ez).normalize();
      const thighW = B.rigid({ thigh_r: 0.85, pelvis: 0.15 });
      box(B, c, ex, ey, ez, [0.06, 0.19, 0.045], { face: Z.holster, edge: Z.holster, back: null, wfn: thighW, res: [R(2), R(3)], n: 8, bevel: 0.006 });
      const g = c.clone().addScaledVector(ey, 0.12).addScaledVector(ex, 0.012).addScaledVector(ez, 0.0);
      box(B, g, ex.clone().applyAxisAngle(ez, -0.3), ey.clone().applyAxisAngle(ez, -0.3), ez, [0.032, 0.06, 0.03], { face: Z.pistol, edge: Z.pistol, back: null, wfn: thighW, res: [1, 1], n: 8, bevel: 0.004 });
      // two leg straps round the thigh
      for (const tt of [0.42, 0.62]) {
        const cc = th.head.clone().lerp(th.tail, tt);
        const pts = [], ups = [];
        const ax = along, ref = V3(0, 0, 1).addScaledVector(ax, -ax.z).normalize(), side = ax.clone().cross(ref).normalize();
        const nS = lod ? 7 : R(12);
        for (let k = 0; k <= nS; k++) {
          const a = -0.5 + k / nS * (Math.PI * 2 + 0.0);
          const d = ref.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
          const pp = ray(legBVH.r, cc.clone().addScaledVector(d, 0.25), d.clone().negate(), 0.25);
          pts.push((pp || cc.clone().addScaledVector(d, 0.08)).addScaledVector(d, 0.003)); ups.push(d);
        }
        strap(B, pts, ups, { width: 0.032, thick: 0.004, zone: Z.legStrap, wfn: B.rigid('thigh_r') });
      }
    }
    // ---- knee pads
    for (const s of ['l', 'r']) {
      const th = sk[`thigh_${s}`], ca = sk[`calf_${s}`];
      const knee = ca.head.clone();
      const ax = th.tail.clone().sub(th.head).normalize().add(ca.tail.clone().sub(ca.head).normalize()).normalize().negate(); // up the leg
      const fwd = V3(0, 0, 1).addScaledVector(ax, -ax.z).normalize();
      const side = ax.clone().cross(fwd).normalize();
      const surfR = (a, y) => {
        const d = fwd.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
        const o = knee.clone().addScaledVector(ax, y);
        const p = ray(legBVH[s], o.clone().addScaledVector(d, 0.25), d.clone().negate(), 0.25);
        return p ? p.distanceTo(o) : 0.07;
      };
      let Rk = 0;
      for (const a of [-0.8, -0.4, 0, 0.4, 0.8]) for (const y of [-0.06, -0.02, 0.02, 0.06]) Rk = Math.max(Rk, surfR(a, y));
      Rk += 0.012;
      const cy = 0.005;
      // the hard cap rides on the shin / patella: rigid on the calf, only its top rim takes a little of the thigh
      // (interpolating one piece across the joint shears it into a thin hook when the knee bends)
      const kneeW = (p) => {
        const t = p.clone().sub(knee).dot(ax);
        const w = ss(0.035, 0.07, t) * 0.12;
        return [[B.bone(`calf_${s}`), 1 - w], [B.bone(`thigh_${s}`), w]];
      };
      panel(B, {
        half: [0.062, 0.058], th: 0.013, n: 4, res: [R(6), R(6)], bevel: 0.004,
        surf: (x, y) => {
          // hugs the trouser surface (ray-cast per vertex, eased towards the max radius so the shell stays smooth)
          // instead of floating on the knee's largest radius: a few mm of clearance plus a domed centre
          const a = x / Rk;
          const d = fwd.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
          const r = mix(surfR(a, y + cy), Rk - 0.012, 0.3);
          return { p: knee.clone().addScaledVector(ax, y + cy).addScaledVector(d, r + 0.0095 + 0.006 * (1 - (y / 0.07) ** 2) * Math.cos(a)), n: d };
        },
        face: Z.kneeCap, back: null, edge: Z.kneeEdge, wfn: kneeW,
        bulge: (u, v) => 0.006 * (1 - u * u) * (1 - v * v),
      });
      // straps: the lower one is rigid on the calf like the cap (its ends stay on the cap's sides); the upper one is a
      // closed elastic band rigid on the thigh just above the knee (hidden under the cap's top when standing, an
      // exposed band round the lower thigh when the knee bends - never a loose loop hanging off the cap)
      for (const yy of lod ? [] : [0.056, -0.045]) {
        const pts = [], ups = [];
        const ring = yy > 0;
        const nS = R(ring ? 14 : 10);
        for (let k = 0; k <= nS; k++) {
          const a = ring ? k / nS * Math.PI * 2 : 1.0 + k / nS * (Math.PI * 2 - 2.0);
          const d = fwd.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
          const o = knee.clone().addScaledVector(ax, yy + cy);
          const p = ray(legBVH[s], o.clone().addScaledVector(d, 0.25), d.clone().negate(), 0.25);
          pts.push((p || o.clone().addScaledVector(d, 0.07)).addScaledVector(d, 0.003)); ups.push(d);
        }
        strap(B, pts, ups, { width: 0.024, thick: 0.004, zone: Z.kneeStrap, wfn: kneeStrapW[s] });
      }
    }
    // ---- helmet shell + rubber trim
    {
      const naz = R(NAZ), nel = R(NEL);
      const verts = [], tris = [];
      for (let j = 0; j < nel; j++) for (let i = 0; i <= naz; i++) {
        const az = i / naz * Math.PI * 2 + Math.PI; // seam at the back
        const v = j / nel;
        verts.push({ p: helmetP(az, helmetSurf(az, v)), uv: [i / naz, 0.12 + v * 0.86] });
      }
      const pole = verts.length;
      for (let i = 0; i <= naz; i++) verts.push({ p: helmetP(0, 88 * DEG + 2 * DEG), uv: [i / naz, 1] });
      const id = (i, j) => (j === nel ? pole + i : j * (naz + 1) + i);
      for (let j = 0; j < nel; j++) for (let i = 0; i < naz; i++) {
        const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
        if (j === nel - 1) tris.push([a, b, c]); else tris.push([a, b, c], [a, c, d]);
      }
      B.piece(verts, tris, Z.helmet, headW);
      // rim: outer edge rolls under (rubber edge trim)
      const tv = [], tt = [];
      for (let i = 0; i <= naz; i++) {
        const az = i / naz * Math.PI * 2 + Math.PI;
        const e = rimEl(az);
        const p0 = helmetP(az, e), pIn = helmetP(az, e, -0.016);
        const d = p0.clone().sub(HC).normalize();
        tv.push({ p: p0.clone().addScaledVector(d, 0.0015).add(V3(0, 0.004, 0)), uv: [i / naz, 1] });
        tv.push({ p: p0.clone().addScaledVector(d, 0.002).add(V3(0, -0.004, 0)), uv: [i / naz, 0.6] });
        tv.push({ p: pIn.clone().add(V3(0, -0.002, 0)), uv: [i / naz, 0.2] });
        tv.push({ p: pIn.clone().add(V3(0, 0.012, 0)), uv: [i / naz, 0] });
      }
      for (let i = 0; i < naz; i++) for (let k = 0; k < 3; k++) {
        const a = i * 4 + k, b = (i + 1) * 4 + k;
        tt.push([a, a + 1, b + 1], [a, b + 1, b]);
      }
      B.piece(tv, tt, Z.trim, headW);
      // side rails (ARC) above the ear cut-outs
      for (const sx of lod ? [] : [1, -1]) {
        const pts = [], ups = [];
        for (let k = 0; k <= R(6); k++) {
          const az = sx * (58 + k / R(6) * 62) * DEG;
          const e = rimEl(az) + 0.11;
          pts.push(helmetP(az, e, 0.001)); ups.push(helmetP(az, e, 1).sub(HC).normalize());
        }
        strap(B, pts, ups, { width: 0.016, thick: 0.006, zone: Z.rail, wfn: headW });
      }
      // NVG shroud at the top front
      if (!lod) {
        const e = rimEl(0) + 0.42;
        const p = helmetP(0, e, 0.006), n = p.clone().sub(HC).normalize();
        const ex = V3(1, 0, 0), ey = n.clone().cross(ex).negate().normalize();
        box(B, p, ex, ey.negate(), n, [0.05, 0.036, 0.014], { face: Z.shroud, edge: Z.shroud, back: null, wfn: headW, res: [1, 1], n: 8, bevel: 0.003 });
      }
      // goggles pushed up onto the helmet front + strap round the helmet
      {
        const eG = (az) => rimEl(az) + 0.26;
        const span = 50 * DEG;
        panel(B, {
          half: [0.1, 0.0275], th: 0.012, n: 6, res: [R(8), R(2)], bevel: 0.004,
          surf: (x, y) => {
            const az = x / 0.1 * span;
            const e = eG(az) + y / 0.14;
            const p = helmetP(az, e, 0.012);
            return { p, n: p.clone().sub(HC).normalize() };
          },
          face: Z.goggle, back: null, edge: Z.trim, wfn: headW,
        });
        const pts = [], ups = [];
        const nS = R(16);
        for (let k = 0; k <= nS; k++) {
          const az = span * 0.92 + k / nS * (Math.PI * 2 - span * 1.84);
          const e = eG(az) + 0.02 - 0.05 * Math.sin(k / nS * Math.PI);
          pts.push(helmetP(az, e, 0.0015)); ups.push(helmetP(az, e, 1).sub(HC).normalize());
        }
        if (!lod) strap(B, pts, ups, { width: 0.034, thick: 0.003, zone: Z.goggleStrap, wfn: headW });
      }
      // headset ear cups + rail arms + boom mic (right)
      for (const s of ['l', 'r']) {
        const sx = s === 'l' ? 1 : -1;
        const c = ear[s].clone().add(V3(sx * 0.004, 0, 0));
        const axis = V3(sx, 0.05, 0).normalize();
        cylinder(B, c, axis, [0.041, 0.038], 0.034, { zone: Z.cup, capZone: Z.cupCap, caps: 'end', capBulge: 0.008, sides: lod ? 8 : 20, wfn: headW });
        // arm from the rail down to the cup
        const railP = helmetP(sx * 92 * DEG, rimEl(sx * 92 * DEG) + 0.11, 0.004);
        const top = c.clone().addScaledVector(axis, 0.018).add(V3(0, 0.036, 0));
        const mid = top.clone().lerp(railP, 0.5).addScaledVector(axis, 0.006);
        if (!lod) strap(B, [top, mid, railP], [axis, axis, axis], { width: 0.014, thick: 0.006, zone: Z.mic, wfn: headW });
        if (s === 'r' && !lod) {
          const m0 = c.clone().addScaledVector(axis, 0.03).add(V3(0, -0.015, 0.02));
          const m1 = V3(A.mouth[0] - 0.035, A.mouth[1] + 0.003, A.mouth[2] + 0.012);
          cylinder(B, m0, m1.clone().sub(m0).normalize(), [0.003, 0.0025], m0.distanceTo(m1), { zone: Z.mic, sides: Math.max(3, R(5)), caps: null, wfn: headW });
          cylinder(B, m1.clone().addScaledVector(m1.clone().sub(m0).normalize(), -0.008), m1.clone().sub(m0).normalize(), [0.007, 0.007], 0.018, { zone: Z.mic, sides: Math.max(4, R(6)), caps: 'both', wfn: headW });
        }
      }
    }
    // ---- gloves: a shell over the hands (offset along the body normals), body hand faces removed below
    {
      const bn = body.normals();
      for (const s of ['l', 'r']) {
        const hb = sk[`hand_${s}`];
        const { dir, inHand } = handSel[s];
        const verts = [], tris = [], map = new Map();
        const uvs = body.obj.uvs;
        const [mnu, mnv, mxu, mxv] = G.gloveUV[s];
        const half = (G.gloveUV.l[2] - G.gloveUV.l[0]) / ((G.gloveUV.l[2] - G.gloveUV.l[0]) + (G.gloveUV.r[2] - G.gloveUV.r[0]));
        body.obj.faces.forEach((f, fi) => {
          if (!f.v.every(inHand)) return;
          G.handFaces = G.handFaces || new Set(); G.handFaces.add(fi);
          const ids = f.v.map((v, k) => {
            const key = v * 100000 + f.t[k];
            if (!map.has(key)) {
              const p = V3(body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]);
              const n = V3(bn[v * 3], bn[v * 3 + 1], bn[v * 3 + 2]);
              const t = p.clone().sub(hb.head).dot(dir);
              const off = 0.0028 + 0.002 * ss(0.0, 0.06, t) * (1 - ss(0.07, 0.11, t)) + 0.0025 * (1 - ss(-0.035, -0.015, t));
              // glove uv: the hand islands of the skin layout re-mapped into this glove's half of the zone
              const u = uvs[f.t[k] * 2], vv = uvs[f.t[k] * 2 + 1];
              const lu = (u - mnu) / (mxu - mnu || 1), lv = (vv - mnv) / (mxv - mnv || 1);
              map.set(key, verts.length);
              const hv = Math.max(mxv - mnv, (G.gloveUV[s === 'l' ? 'r' : 'l'][3] - G.gloveUV[s === 'l' ? 'r' : 'l'][1]));
              verts.push({ p: p.addScaledVector(n, off), uv: [s === 'l' ? lu * half : half + lu * (1 - half), lv * (mxv - mnv) / hv], w: body.weights[v] });
            }
            return map.get(key);
          });
          for (let k = 1; k + 1 < ids.length; k++) tris.push([ids[0], ids[k], ids[k + 1]]);
        });
        B.piece(verts, tris, Z.glove, () => [[B.bone(`hand_${s}`), 1]], { tag: 'glove_' + s });
      }
    }
    return B;
  };

  // LOD0 gear: pack zones, assemble
  const B0 = buildGear(1);
  const Z = G.Z;
  // glove painter (needs the hand frames): two-tone - coyote back, black synthetic palm / fingers, molded knuckles
  const gloveP = (P, Nn, lu, lv, out) => {
    const s = P[0] > 0 ? 'l' : 'r';
    const hb = sk[`hand_${s}`];
    const loc = V3(...P).sub(hb.head).applyQuaternion(hb.world.clone().invert());
    const nl = V3(...Nn).applyQuaternion(hb.world.clone().invert());
    const c = out.c;
    const palm = ss(-0.15, 0.25, nl.z); // palm faces local +z
    const along = loc.y; // wrist -> fingers
    const fingers = ss(0.075, 0.095, along);
    const base = PAL.coyote.map((v, k) => mix(v, PAL.black[k] * 1.4, Math.max(palm, fingers * 0.85)));
    c[0] = base[0]; c[1] = base[1]; c[2] = base[2];
    let hgt = (hash2(Math.round(lu * 4000), Math.round(lv * 4000)) - 0.5) * 0.4;
    // knuckle guard: molded ridge across the back over the knuckles
    const kn = (1 - palm) * (1 - ss(0.008, 0.016, Math.abs(along - 0.086)));
    over(c, PAL.rubber, kn * 0.9); hgt += kn * 1.6;
    // cuff band + velcro tab at the wrist
    const cuff = 1 - ss(-0.02, -0.012, along);
    over(c, PAL.black, cuff * 0.8); hgt += cuff * 0.6 + (Math.abs(along + 0.012) < 0.0015 ? -0.8 : 0);
    // palm suede texture + seams between the fingers
    scale(c, 1 + N.noise(P[0] * 700, P[1] * 700, P[2] * 700) * 0.12 * palm);
    out.h = hgt; out.ro = mix(0.7, 0.88, palm); out.me = 0;
    over(c, lin([140, 128, 108]), ss(0.3, 0.8, N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 2)) * 0.15);
  };
  Z.glove.paint = gloveP;
  const GEAR_TEX = texSize(2048);
  packZones(B0.zones, GEAR_TEX, { pad: 6 });
  const gear = B0.build('gear', 'gear');
  gear.extras.noSimplify = true;
  // LOD1 gear: same zones / atlas, coarser pieces
  const B1 = buildGear(0.35);
  B1.zones.forEach((z, i) => { z.rect = B0.zones[i].rect; z.paint = B0.zones[i].paint; });
  const gear1 = B1.build('gear', 'gear');

  // ---------------------------------------------------------------------------------------------- slot marker
  // a band round the back half of the helmet (behind the goggles / NVG shroud) and an armband on the left upper arm,
  // in their own light-grey material flagged extras.slotTint: remote.js tints it with the teammate's slot colour so
  // the four teammates can be told apart at 15-30 m without the name tags
  const buildMarker = (q) => {
    const BM = new Builder(h.skeleton);
    const zb = BM.zone('band', 0.045, 0.62, markerPaint(N)); // strap uv: u across, v along
    {
      const pts = [], ups = [];
      const n = Math.max(10, Math.round(24 * q));
      for (let k = 0; k <= n; k++) {
        const az = (42 + k / n * 276) * DEG; // left front, round the back, to the right front
        const e = rimEl(az) + 0.56;
        pts.push(helmetP(az, e, 0.0035)); ups.push(helmetP(az, e, 1).sub(HC).normalize());
      }
      strap(BM, pts, ups, { width: 0.024, thick: 0.003, zone: zb, wfn: BM.rigid('head') });
    }
    {
      const ua = sk.upperarm_l;
      const ax = ua.tail.clone().sub(ua.head).normalize();
      const cc = ua.head.clone().lerp(ua.tail, 0.42);
      const ref = V3(0, 0, 1).addScaledVector(ax, -ax.z).normalize(), side = ax.clone().cross(ref).normalize();
      const armBVH = segBVH([2]);
      const pts = [], ups = [];
      const n = Math.max(8, Math.round(16 * q));
      for (let k = 0; k <= n; k++) {
        const a = k / n * Math.PI * 2;
        const d = ref.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
        const p = ray(armBVH, cc.clone().addScaledVector(d, 0.2), d.clone().negate(), 0.2);
        pts.push((p || cc.clone().addScaledVector(d, 0.06)).addScaledVector(d, 0.004)); ups.push(d);
      }
      strap(BM, pts, ups, { width: 0.045, thick: 0.004, zone: zb, wfn: nearestWeights(suit, h.skeleton, ['upperarm_l', 'clavicle_l'], 4) });
    }
    return BM;
  };
  const BM0 = buildMarker(1);
  packZones(BM0.zones, texSize(256), { pad: 4 });
  const marker = BM0.build('marker', 'gear');
  const BM1 = buildMarker(0.5);
  BM1.zones.forEach((z, i) => { z.rect = BM0.zones[i].rect; });
  const marker1 = BM1.build('marker', 'gear');

  // ---------------------------------------------------------------------------------------------- hidden faces
  // body: hands under the gloves, scalp under the helmet / headset
  body.obj.faces.forEach((f, fi) => { if (G.handFaces.has(fi)) body.keep[fi] = 0; });
  const helmetBVH = bvhOf([gear]);
  const removedScalp = hideUnder(body, helmetBVH, 0.045, (f) => f.v.every((v) => body.pos[v * 3 + 1] > eyeY - 0.03)).length;
  // uniform: shirt under the plates / cummerbund / belt only. Not under the shoulder straps (above the plate tops):
  // the skin under the collar is still there, so a removed shirt face would open a skin-coloured sliver beside the
  // strap. The removed area is then shrunk by two face rings so the soft cummerbund and the (rigid) plates can move
  // off the body in a crouch / run without opening a hole into the hollow torso.
  const underPlates = (v) => suit.seg[v] === 0 && suit.pos[v * 3 + 1] > beltY - 0.03 && suit.pos[v * 3 + 1] < (suit.pos[v * 3 + 2] > 0 ? plate.top : plateB.top) - 0.02;
  // Front: everything covered goes (in a forward bend the rigid front plate swings into the belly, a shirt left under
  // it would poke through). Back: the plate's lower part lifts off the back when bending forward, so the shirt stays
  // under its bottom 9 cm and one face ring round the rest.
  const suitCovered = hideUnder(suit, helmetBVH, 0.06, (f) => f.v.every(underPlates));
  const isBack = (fi) => suit.obj.faces[fi].v.some((v) => suit.pos[v * 3 + 2] < sk.spine_02.head.z);
  for (const fi of suitCovered) if (isBack(fi) && suit.obj.faces[fi].v.some((v) => suit.pos[v * 3 + 1] < plateB.bot + 0.09)) suit.keep[fi] = 1;
  const backLeft = erodeRemoved(suit, suitCovered.filter((fi) => isBack(fi) && !suit.keep[fi]), 1);
  const removedSuit = suitCovered.filter((fi) => !isBack(fi)).length + backLeft.length;


  // ---------------------------------------------------------------------------------------------- textures
  // gear atlas (+ AO from the gear, the uniform and the body)
  const aoBVH = bvhOf([gear, { pos: suit.pos, tris: suit.tris() }, { pos: h.pos, tris: basePart.tris() }]);
  const gearTex = FAST ? { albedo: flat() } : paintAtlas(gear, GEAR_TEX, { ao: { bvh: aoBVH, rays: 16, maxDist: 0.08, size: texSize(512), strength: 0.8 }, normalSize: texSize(1024), ormSize: texSize(1024), normalStrength: 1.5 });
  gear.material = lib.material('gear', { albedo: gearTex.albedo, normal: gearTex.normal, orm: gearTex.orm });
  gear1.material = gear.material;

  // skin: CC0 middle-aged male skin (buzz cut + stubble), sun-weathered, light beard shadow
  // brow arcs from the CC0 eyebrow001 card fitted to this head: per side, 8 bins inner -> outer: centre height, height
  const browArc = ['l', 'r'].map((s) => {
    const sx = s === 'l' ? 1 : -1, V = [];
    for (let v = 0; v < brows.nVerts; v++) if (brows.pos[v * 3] * sx > 0.004) V.push([brows.pos[v * 3], brows.pos[v * 3 + 1], brows.pos[v * 3 + 2]]);
    const ax = V.map((p) => Math.abs(p[0])), lo = Math.min(...ax), hi = Math.max(...ax);
    const y = [], th = [];
    for (let b = 0; b < 8; b++) {
      const sel = V.filter((p) => Math.abs(p[0]) >= lo + (hi - lo) * b / 8 - 1e-6 && Math.abs(p[0]) <= lo + (hi - lo) * (b + 1) / 8 + 1e-6);
      const ys = sel.map((p) => p[1]);
      y.push(ys.reduce((a, q) => a + q, 0) / Math.max(1, ys.length)); th.push(Math.max(0.004, (Math.max(...ys) - Math.min(...ys)) / 2));
    }
    return { x0: sx * lo, x1: sx * hi, z: Math.max(...V.map((p) => p[2])), y, th };
  });
  // hairline height (m, relative to the eye line) by azimuth round the head (deg, 0 = front, 180 = back)
  const HAIRLINE = [[0, 0.074], [38, 0.072], [55, 0.058], [66, 0.03], [72, -0.03], [81, -0.036], [87, 0.012], [100, 0.016], [112, -0.01], [130, -0.05], [155, -0.09], [180, -0.104]];
  const skinBase = await lib.texture('system', 'skins/middleage_caucasian_male/middleage_lightskinned_male_diffuse.png', 1024);
  const mouth = A.mouth;
  const skin = FAST ? { albedo: flat([180, 140, 120, 255]) } : lib.paintSkin(h, {
    seed: 7, base: skinBase, size: texSize(1024), normalSize: texSize(512), ormSize: texSize(512),
    pallor: 0, mottle: 0, veins: 0, bruises: 0, socket: 0, lips: 0, grime: 0.12, coveredDarken: 0, roughness: 0.55,
    bumpStrength: 2.2, normalStrength: 1.6,
    extra: (P, Nn, c, st) => {
      // outdoor tan: darker, less blue (the light-skinned base read pale pink under the game's key light)
      c[0] *= 0.8; c[1] *= 0.71; c[2] *= 0.57;
      // buzz cut: dense dark-brown stubble over the scalp down to a natural hairline: temples, sideburns in front of the
      // ears, round the top of the ears, and down the nape (it showed under the helmet rim as bare / sunburnt skin)
      if (P[1] > eyeY - 0.13 && P[1] > A.neck[1] + 0.02) {
        const a = Math.abs(Math.atan2(P[0], P[2] - HC.z) / DEG); // 0 = front .. 180 = back
        let line = HAIRLINE[HAIRLINE.length - 1][1];
        for (let k = 1; k < HAIRLINE.length; k++) if (a <= HAIRLINE[k][0]) { const t = ss(HAIRLINE[k - 1][0], HAIRLINE[k][0], a); line = mix(HAIRLINE[k - 1][1], HAIRLINE[k][1], t); break; }
        line += eyeY;
        const onEar = Math.abs(P[0]) > 0.073 && a > 80 && a < 116 && P[1] < eyeY + 0.014 && P[1] > eyeY - 0.065;
        const k = ss(line - 0.003, line + 0.01, P[1] + N.noise(P[0] * 90, P[1] * 90, P[2] * 90) * 0.005) * (onEar ? 0 : 1);
        if (k > 0) {
          const dots = 0.66 + 0.34 * N.noise(P[0] * 1500, P[1] * 1500, P[2] * 1500);
          const g = (c[0] + c[1] + c[2]) / 3; // desaturate the skin under the stubble (the warm base read ginger)
          for (let q = 0; q < 3; q++) c[q] = mix(c[q], g * 0.7, k);
          over(c, lin([27, 23, 20]), k * 0.93 * dots);
          st.ro = mix(st.ro, 0.8, k);
          st.h += k * dots * 0.45;
        }
      }
      // brows painted into the skin along the CC0 eyebrow001 card's arch (the alpha-tested card read as a thin jagged
      // dashed line; it is measured for placement and not exported)
      for (const B of browArc) {
        if (P[2] < B.z - 0.02 || (P[0] - B.x0) * (P[0] - B.x1) > 0) continue;
        const t = (P[0] - B.x0) / (B.x1 - B.x0);                    // 0 = inner end .. 1 = outer end
        const ft = t * (B.y.length - 1), i0 = Math.min(B.y.length - 2, Math.floor(ft)), u = ft - i0;
        const yb = B.y[i0] * (1 - u) + B.y[i0 + 1] * u;
        const th = (B.th[i0] * (1 - u) + B.th[i0 + 1] * u) * 0.62 * (1 - 0.3 * t);
        const k = (1 - ss(th * 0.45, th, Math.abs(P[1] - yb))) * ss(0, 0.12, t) * (1 - ss(0.8, 1, t));
        if (k > 0) { over(c, lin([34, 27, 21]), k * 0.86 * (0.72 + 0.28 * N.noise(P[0] * 1400, P[1] * 1400, P[2] * 1400))); st.h += k * 0.35; st.ro = mix(st.ro, 0.75, k); }
      }
      // stubble / short beard: jaw, chin, upper lip; sideburns
      const dy = P[1] - mouth[1];
      if (P[2] > HC.z - 0.03 && dy < 0.022 && dy > -0.085 && P[1] > A.neck[1] + 0.02) {
        const front = ss(-0.6, 0.2, Nn[2]) + ss(0.2, 0.8, Math.abs(Nn[0])) * ss(-0.06, -0.02, dy);
        const lipGap = 1 - ss(0.004, 0.009, Math.abs(dy - 0.002)) * (1 - ss(0.02, 0.03, Math.abs(P[0])));
        const cheekLine = 1 - ss(0.0, 0.015, dy - (-0.004 + Math.abs(P[0]) * 0.25));
        const k = clamp01(front) * lipGap * clamp01(cheekLine + ss(-0.02, -0.035, dy)) * (0.65 + 0.35 * N.noise(P[0] * 900, P[1] * 900, P[2] * 900));
        const g = (c[0] + c[1] + c[2]) / 3; // desaturate under the stubble (the warm base read ginger)
        for (let q = 0; q < 3; q++) c[q] = mix(c[q], g * 0.8, k * 0.6);
        over(c, lin([36, 30, 25]), k * 0.58);
        st.ro = mix(st.ro, 0.7, k);
      }
    },
  });
  body.material = lib.material('skin', skin);

  // eyes / brows
  const eyeTex = await lib.texture('system', 'eyes/materials/brown_eye.png', 256);
  eyes.material = lib.material('eye', { albedo: eyeTex, roughness: 0.1 });
  eyes.extras.noSimplify = true;
  // brows: painted into the skin (browArc above); the CC0 card is only used for placement

  // uniform
  let uniTex = { albedo: flat([80, 84, 66, 255]) };
  if (!FAST) {
    const uni = paintUniform(suit, { N, sk, S: texSize(2048), NS: texSize(1024), beltY, bootTop: Math.min(bootSh.l.yTop, bootSh.r.yTop) });
    uni.normalImg = await lib.texture(suit.asset.textures.normal, texSize(1024));
    uni.aoImg = await lib.texture(suit.asset.textures.ao, texSize(1024));
    uniTex = uni.finish();
  }
  suit.material = lib.material('cloth', { albedo: uniTex.albedo, normal: uniTex.normal, orm: uniTex.orm, doubleSided: true });

  // boots: procedural mesh (boots.mjs), own 1024 atlas (upper + tread zone per boot), AO from the boots / trousers
  const bootGeo = bootGeometry(bootSh, 16);
  const BB = new Builder(h.skeleton);
  for (const s of ['l', 'r']) {
    const zu = BB.zone('boot_' + s, ...bootGeo[s].zone, bootPaint(N, bootSh[s], s));
    const zt = BB.zone('tread_' + s, ...bootGeo[s].treadZone, treadPaint(N), { scale: 0.6 });
    const wfn = nearestWeights(basePart, h.skeleton, [`calf_${s}`, `foot_${s}`, `ball_${s}`], 8);
    BB.piece(bootGeo[s].verts, bootGeo[s].tris, zu, wfn, { tag: 'boot_' + s });
    BB.piece(bootGeo[s].tread.verts, bootGeo[s].tread.tris, zt, wfn, { tag: 'tread_' + s, smooth: false });
  }
  packZones(BB.zones, texSize(1024), { pad: 6 });
  const boots = BB.build('boots', 'gear');
  const bootTex = FAST ? { albedo: flat([70, 58, 44, 255]) } : paintAtlas(boots, texSize(1024), { ao: { bvh: bvhOf([boots, { pos: suit.pos, tris: suit.tris() }]), rays: 12, maxDist: 0.05, size: texSize(256), strength: 0.7 }, normalStrength: 1.3 });
  boots.material = lib.material('gear', { albedo: bootTex.albedo, normal: bootTex.normal, orm: bootTex.orm });
  const markTex = FAST ? { albedo: flat([200, 200, 200, 255]) } : paintAtlas(marker, texSize(256), { normalStrength: 1 });
  marker.material = lib.material('gear', { albedo: markTex.albedo, normal: markTex.normal, orm: markTex.orm, color: [1, 1, 1, 1], extras: { slotTint: true } });
  marker1.material = marker.material;

  const headBone = h.skeleton.byName.head.index;
  const helmetTop = Math.max(...Array.from({ length: gear.vcount }, (_, i) => (gear.J[i * 4] === headBone ? gear.P[i * 3 + 1] : 0)));
  console.log(`soldier: gear ${gear.triCount()} tris (lod1 ${gear1.triCount()}), scalp faces hidden ${removedScalp}, shirt faces hidden ${removedSuit}, helmet top ${helmetTop.toFixed(3)} m`);

  return {
    human: h,
    parts: [body, suit, boots, gear, marker, eyes],
    budget: 9000,
    partBudget: { uniform: 2800, boots: 820, body: 1100 },
    extras: { archetype: 'operator', gender: 'male', height: +helmetTop.toFixed(3) },
    hitboxExclude: ['gear'], hitboxMargins: { head: 0.024, chest: 0.035, spine: 0.03, pelvis: 0.012 },
    // LOD1: the face needs the triangles (it went blotchy / sunken at 300), the eyes do not (172 -> ~40)
    lod1: { budget: 2500, drop: ['eyebrows'], texScale: 0.5, replace: { gear: gear1, marker: marker1 }, keepMaterials: [[eyes.material, eyes.material]], partBudget: { uniform: 640, boots: 180, body: 460, gear: 1000, eyes: 96 } },
    gear, plate, PF, plateB, PB,
    eyeR: A.eyeR, eyeL: A.eyeL,
  };
}

// ------------------------------------------------------------------------------------------------ uniform painter
function paintUniform(suit, { N, sk, S, NS, beltY, bootTop }) {
  const tris = suit.tris();
  const nrm = suit.normals();
  const r = rasterUV(tris, suit.obj.uvs, S, 8);
  // world size of a texel per triangle (m): the ripstop grid / rib knit are sized in metres, not texels
  const mpt = new Float32Array(tris.length / 6);
  for (let t = 0; t < mpt.length; t++) {
    const v = [0, 2, 4].map((k) => tris[t * 6 + k]), u = [1, 3, 5].map((k) => tris[t * 6 + k]);
    const p = v.map((i) => V3(suit.pos[i * 3], suit.pos[i * 3 + 1], suit.pos[i * 3 + 2]));
    const a3 = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).length() / 2;
    const uv = u.map((i) => [suit.obj.uvs[i * 2] * S, suit.obj.uvs[i * 2 + 1] * S]);
    const a2 = Math.abs((uv[1][0] - uv[0][0]) * (uv[2][1] - uv[0][1]) - (uv[2][0] - uv[0][0]) * (uv[1][1] - uv[0][1])) / 2;
    mpt[t] = a2 > 1e-6 ? Math.sqrt(a3 / a2) : 0.001;
  }
  const albedo = createImage(S, S, [80, 84, 66, 255]);
  const height = new Float32Array(S * S);
  const rough = new Float32Array(S * S).fill(0.86);
  const P = [0, 0, 0], Nn = [0, 0, 0];
  // cargo pockets (per thigh), shoulder pockets (per upper arm): local frames
  const legs = ['l', 'r'].map((s) => {
    const t = sk[`thigh_${s}`];
    const ax = t.tail.clone().sub(t.head).normalize();
    const sx = s === 'l' ? 1 : -1;
    const out = V3(sx, 0, 0.35).addScaledVector(ax, -sx * ax.x).normalize();
    return { s, sx, a: t.head, ax, len: t.head.distanceTo(t.tail), out };
  });
  const arms = ['l', 'r'].map((s) => {
    const u = sk[`upperarm_${s}`];
    const ax = u.tail.clone().sub(u.head).normalize();
    const sx = s === 'l' ? 1 : -1;
    const out = V3(sx, 0.2, 0.1).addScaledVector(ax, -V3(sx, 0.2, 0.1).dot(ax)).normalize();
    return { s, sx, a: u.head, ax, len: u.head.distanceTo(u.tail), out };
  });
  const rect = (p, f, t, fw, angW, along0, along1) => {
    // returns local (x across [-1,1], y along [0,1]) of point p in a pocket on limb f
    const v = V3(...p).sub(f.a);
    const along = v.dot(f.ax);
    const radial = v.clone().addScaledVector(f.ax, -along).normalize();
    const side = f.ax.clone().cross(f.out).normalize();
    const ang = Math.atan2(radial.dot(side), radial.dot(f.out));
    return { x: ang / angW, y: (along - along0) / (along1 - along0), r: radial };
  };
  const c = [0, 0, 0];
  for (let i = 0; i < S * S; i++) {
    if (!texelSurface(r, tris, suit.pos, nrm, i, P, Nn)) continue;
    const x = i % S, y = Math.floor(i / S);
    const u = x / S, v = y / S;
    // UV islands of male_casualsuit02: shirt back / front (top-left), sleeves (right column), trousers (bottom-left)
    const sleeve = u > 0.705;
    const shirt = v < 0.41 || sleeve;
    let base;
    if (!shirt) base = PAL.ranger;
    else if (sleeve) base = PAL.ranger;
    else base = PAL.tanShirt;
    c[0] = base[0]; c[1] = base[1]; c[2] = base[2];
    let h = 0, ro = 0.86;
    // dye variation + fabric: large blotches (uneven fading / washing) + a mid-scale cloud, so the olive is never flat
    scale(c, 1 + N.fbm(P[0] * 2.2 + 11, P[1] * 2.2, P[2] * 2.2, 3) * 0.12 + N.fbm(P[0] * 7, P[1] * 7, P[2] * 7, 3) * 0.06);
    const tex = mpt[r.tri[i]] || 0.001; // metres per texel here
    if (shirt && !sleeve) {
      // torso: fine vertical rib knit (~4 mm), low relief (it read as a sweater)
      const rib = Math.sin(x * Math.PI * 2 * tex / 0.004) * 0.5 + 0.5;
      scale(c, 0.985 + rib * 0.03); h += rib * 0.12;
    } else {
      // ripstop: plain weave + a reinforcement grid every 5.5 mm in world space (it was 11 texels = 1.5-2 cm and read
      // as plaid): <= 2 % albedo, a light normal ridge
      const pitch = Math.max(3, 0.0055 / tex);
      const gx = Math.abs(((x / pitch) % 1) - 0.5) * 2, gy = Math.abs(((y / pitch) % 1) - 0.5) * 2;
      const line = Math.max(ss(0.78, 0.95, gx), ss(0.78, 0.95, gy));
      scale(c, 1 + line * 0.018); h += line * 0.12;
      h += (hash2(x, y) - 0.5) * 0.22;
    }
    if (!shirt) {
      // seams: felled out- / inseams down each leg, the seat seam up the back and the fly's J-stitch in front
      // (a raised ridge with a fold shadow and two dashed stitch rows); skipped under the cargo pockets
      let pocketHere = false;
      for (const f of legs) { const q = rect(P, f, 0, 0, 0.62, f.len * 0.32, f.len * 0.72); if (Math.abs(q.x) < 1.15 && q.y > -0.1 && q.y < 1.1) pocketHere = true; }
      const seam = (dist, along) => {
        if (dist > 0.0055) return;
        h += (1 - dist / 0.0055) * 0.9;
        if (dist < 0.0009) { scale(c, 0.72); h -= 0.9; }
        if (Math.abs(dist - 0.0038) < 0.0007 && ((along * 260) % 1) < 0.6) { scale(c, 1.18); h += 0.3; }
      };
      const crotchY = sk.thigh_l.head.y - 0.07, pz = sk.pelvis.head.z;
      if (P[1] < crotchY + 0.02 && !pocketHere) {
        const s = P[0] > 0 ? 'l' : 'r';
        const kn = sk[`calf_${s}`].head, hip = sk[`thigh_${s}`].head, ank = sk[`calf_${s}`].tail;
        const [a0, a1] = P[1] > kn.y ? [hip, kn] : [kn, ank];
        const t = clamp01((P[1] - a0.y) / (a1.y - a0.y));
        const dx = P[0] - (a0.x + (a1.x - a0.x) * t), dz = P[2] - (a0.z + (a1.z - a0.z) * t);
        const rr = Math.hypot(dx, dz), ang = Math.atan2(dz, dx * Math.sign(P[0] || 1)); // 0 = outer side, pi = inner
        for (const a of [0, Math.PI]) seam(Math.abs((((ang - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) * rr, P[1]);
      }
      if (P[1] > crotchY - 0.03 && P[1] < beltY + 0.03) {
        if (P[2] < pz) seam(Math.abs(P[0]), P[1]);                                           // seat seam
        else if (P[1] < sk.pelvis.head.y + 0.02) {
          if (Math.abs(P[0]) < 0.0015) { scale(c, 0.7); h -= 0.8; }                            // fly opening
          const jy = P[1] - (crotchY + 0.05);
          const jd = jy > 0 ? Math.abs(P[0] - 0.032) : Math.abs(Math.hypot(P[0], jy) - 0.032); // J-stitch
          if (jd < 0.0008 && ((P[1] + P[0]) * 260 % 1) < 0.6) { scale(c, 1.15); h -= 0.25; }
          if (P[0] > 0 && P[0] < 0.032 && jy > 0) h += 0.4;                                   // placket
        }
      }
      // seat wear: faded, slightly lighter fabric over the buttocks
      if (P[2] < pz - 0.02 && P[1] > crotchY - 0.06 && P[1] < sk.pelvis.head.y + 0.02 && Math.abs(P[0]) < 0.15) {
        over(c, lin([126, 122, 98]), ss(0.1, 0.7, N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 2) + 0.25) * 0.09);
      }
      // cargo pockets on the outer thighs: flap + pocket body, double stitching, shadow under the flap
      for (const f of legs) {
        const q = rect(P, f, 0, 0, 0.62, f.len * 0.32, f.len * 0.72);
        if (Math.abs(q.x) < 1.15 && q.y > -0.1 && q.y < 1.1) {
          const ex = 1 - Math.abs(q.x), ey = Math.min(q.y, 1 - q.y);
          const inside = ex > 0 && ey > 0;
          if (inside) {
            h += 1.4; // pocket body sits proud
            const flap = q.y < 0.3; // q.y runs down the thigh: the flap closes the top of the pocket
            if (flap) { h += 0.9; scale(c, 1.03); }
            if (Math.abs(q.y - 0.3) < 0.02) { scale(c, 0.55); h -= 1.2; } // flap lower edge shadow
            if (q.y > 0.3 && q.y < 0.38) scale(c, 0.8 + (q.y - 0.3) * 2.5);
            const st = Math.min(ex * 0.62 * 0.12, ey * 0.16);
            if (st > 0.004 && st < 0.0065 && ((q.x * 60 + q.y * 60) % 1) < 0.6) { scale(c, 1.25); h -= 0.3; }
            // pleat in the middle of the pocket body
            if (q.y < 0.7 && Math.abs(q.x) < 0.06) { h -= 0.6; scale(c, 0.85); }
          } else if (ex > -0.08 && ey > -0.04) { scale(c, 0.72); h -= 0.5; } // contact shadow round the pocket
        }
      }
      // knee: darker reinforced patch (articulated knee panel seams)
      for (const f of legs) {
        const kn = sk[`calf_${f.s}`].head;
        const d = Math.hypot(P[0] - kn.x, (P[1] - kn.y) * 0.8, P[2] - kn.z - 0.05);
        if (d < 0.11 && Nn[2] > -0.2) {
          const k = 1 - ss(0.085, 0.11, d);
          scale(c, 1 - k * 0.1);
          if (Math.abs(d - 0.09) < 0.003) { scale(c, 0.75); h -= 0.6; }
          // abrasion: kneeling wears the dye off in patches (lighter, flatter, rougher)
          const wr = k * ss(-0.3, 0.6, N.fbm(P[0] * 70 + 5, P[1] * 70, P[2] * 70, 2));
          over(c, lin([126, 122, 100]), wr * 0.13); h -= wr * 0.2;
        }
      }
      // bloused over the boot tops: stacked folds above the collar, shadowed where they tuck in
      if (bootTop && P[1] < bootTop + 0.085) {
        const t = (P[1] - bootTop) / 0.085, env = (1 - ss(0.7, 1, t)) * ss(-0.25, 0, t);
        const fold = Math.sin((P[1] - bootTop) / 0.024 * Math.PI * 2 + N.noise(P[0] * 60, P[1] * 20, P[2] * 60) * 3.5);
        h += fold * 0.35 * env; scale(c, 1 - 0.03 * Math.max(0, -fold) * env - 0.1 * (1 - ss(-0.01, 0.015, P[1] - bootTop)));
      }
      // dust: lower legs, knees, seat
      const low = 1 - ss(0.1, 0.55, P[1]);
      const dust = clamp01(low * 0.6 + ss(0.2, 0.7, N.fbm(P[0] * 9, P[1] * 9, P[2] * 9, 3)) * 0.3);
      over(c, lin([128, 116, 94]), dust * 0.35);
      ro = 0.9;
    }
    if (sleeve) {
      // shoulder pockets with velcro fields + patches; padded elbows
      for (const f of arms) {
        const q = rect(P, f, 0, 0, 0.75, f.len * 0.12, f.len * 0.58);
        if (Math.abs(q.x) < 1.1 && q.y > -0.08 && q.y < 1.08) {
          const ex = 1 - Math.abs(q.x), ey = Math.min(q.y, 1 - q.y);
          if (ex > 0 && ey > 0) {
            h += 1.2;
            if (q.y > 0.18 && q.y < 0.92 && Math.abs(q.x) < 0.8) {
              // velcro loop field
              over(c, PAL.rangerDark, 0.6); h += 0.4; ro = 0.95;
              scale(c, 1 + N.noise(x * 0.9, y * 0.9, 2) * 0.12);
              // patch: left = subdued unit flag (three bars), right = IR square
              if (q.y > 0.4 && q.y < 0.82 && Math.abs(q.x) < 0.62) {
                const band = Math.floor((q.y - 0.4) / 0.14);
                const col = f.s === 'l' ? [lin([92, 88, 70]), lin([58, 60, 48]), lin([92, 88, 70])][Math.min(2, band)] : lin([46, 48, 40]);
                over(c, col, 0.92); h += 0.8;
                if (f.s === 'l' && q.x < -0.2 && q.y > 0.6) over(c, lin([46, 48, 38]), 0.9);
              }
            }
            if (ey < 0.03 || ex < 0.04) { scale(c, 0.8); h -= 0.4; }
          } else if (ex > -0.06 && ey > -0.03) scale(c, 0.78);
        }
        const el = sk[`lowerarm_${f.s}`].head;
        const d = Math.hypot(P[0] - el.x, P[1] - el.y, P[2] - el.z);
        if (d < 0.07) { const k = 1 - ss(0.05, 0.07, d); scale(c, 1 - k * 0.12); h += k * 0.8; }
      }
    }
    // sweat / grime: armpits, collar
    if (shirt) {
      const ap = Math.min(...['l', 'r'].map((s) => { const a = sk[`upperarm_${s}`].head; return Math.hypot(P[0] - a.x * 0.85, P[1] - (a.y - 0.08), P[2] - a.z); }));
      scale(c, 1 - (1 - ss(0.03, 0.1, ap)) * 0.25);
    }
    const di = i * 4;
    albedo.data[di] = toByte(c[0]); albedo.data[di + 1] = toByte(c[1]); albedo.data[di + 2] = toByte(c[2]);
    height[i] = h; rough[i] = ro;
  }
  return {
    albedo, height, rough,
    finish() {
      // folds: asset AO into the albedo; normal = asset normal + painted details (RNM blend)
      // the asset AO is very dark on the trousers' sides / back and the waistband (it was baked for a loose suit):
      // lighter there, with a floor, so the trousers do not read black from behind
      const ao = resize(this.aoImg, S, S);
      for (let i = 0; i < S * S; i++) {
        const u = (i % S) / S, v = Math.floor(i / S) / S;
        const trousers = !(v < 0.41 || u > 0.705);
        const a = Math.max(trousers ? 0.72 : 0.6, mix(1, ao.data[i * 4] / 255, trousers ? 0.42 : 0.65));
        for (let k = 0; k < 3; k++) albedo.data[i * 4 + k] = toByte(S2LUT[albedo.data[i * 4 + k]] * a);
      }
      const det = normalFromHeight(down(blurField(height, S, S, 1, 1), S, NS), NS, NS, 1.6 * NS / 1024);
      const base = this.normalImg;
      const nrmOut = createImage(NS, NS);
      for (let i = 0; i < NS * NS; i++) {
        const b = [base.data[i * 4] / 127.5 - 1, base.data[i * 4 + 1] / 127.5 - 1, base.data[i * 4 + 2] / 127.5 - 1];
        const d = [det.data[i * 4] / 127.5 - 1, det.data[i * 4 + 1] / 127.5 - 1, det.data[i * 4 + 2] / 127.5 - 1];
        const t = [b[0] * 0.8, b[1] * 0.8, b[2] + 1], uu = [-d[0], -d[1], d[2]];
        const dt = t[0] * uu[0] + t[1] * uu[1] + t[2] * uu[2];
        let n = [t[0] * dt / t[2] - uu[0], t[1] * dt / t[2] - uu[1], t[2] * dt / t[2] - uu[2]];
        const l = Math.hypot(...n) || 1; n = n.map((q) => q / l);
        nrmOut.data[i * 4] = Math.round((n[0] * 0.5 + 0.5) * 255); nrmOut.data[i * 4 + 1] = Math.round((n[1] * 0.5 + 0.5) * 255); nrmOut.data[i * 4 + 2] = Math.round((n[2] * 0.5 + 0.5) * 255); nrmOut.data[i * 4 + 3] = 255;
      }
      const OS = NS;
      const orm = createImage(OS, OS, [255, 230, 0, 255]);
      const aoS = resize(this.aoImg, OS, OS), rS = down(rough, S, OS);
      for (let i = 0; i < OS * OS; i++) { orm.data[i * 4] = Math.round(255 - (255 - aoS.data[i * 4]) * 0.55); orm.data[i * 4 + 1] = Math.round(clamp01(rS[i]) * 255); }
      return { albedo, normal: nrmOut, orm };
    },
  };
}

