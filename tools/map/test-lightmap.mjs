// Lightmap baker test scene + regression checks.
//   node tools/map/test-lightmap.mjs [--res 8] [--samples 64] [--workers 6] [--hdr file.hdr] [--mode indirect+mask|full]
//                                     [--out game/assets/maps/_test/lm] [--no-glb] [--town [size]]
// Scene: a ground plane, a closed concrete room (window in the sun-facing wall, door, roof slab with overhang,
// walls overlapping at the corners and standing ON the ground plane - the classic leak case), crates (one
// rotated, one stacked), a smooth cylinder + sphere (curved charts / seams), a lamp inside the room.
// Writes the atlases + scene.glb + lightmap.json for the dev viewer (index.html?view=lightmap) and
// tonemapped previews to captures/lightmap/. Exits 1 if a check fails.
// --town [size]: instead bakes a synthetic size x size m town block grid (performance / memory benchmark).
import './../assets/lib/node-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { PNG } from 'pngjs';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeLightmaps, decodeRGBM } from './lib/lightmap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = (n) => args.includes('--' + n);

const SUN = { dir: [0.38, 0.72, 0.58], color: '#ffe6c8', intensity: 3.2, angle: 0.8 };
const LAMP = { pos: [-1.6, 2.6, -1.2], color: '#ffd2a0', intensity: 3, range: 7, radius: 0.08 };

function mat(name, color, extra = {}) {
  return new THREE.MeshStandardMaterial({ name, color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...extra });
}

/** Box mesh whose bottom sits at y (centre x, z). */
function box(name, w, h, d, x, y, z, material, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.name = name;
  m.position.set(x, y + h / 2, z);
  m.rotation.y = ry;
  return m;
}

export function buildTestScene() {
  const root = new THREE.Group();
  root.name = 'lm_test';
  const M = {
    ground: mat('ground', '#8a867c'),
    wall: mat('concrete', '#b7b1a6'),
    roof: mat('roof', '#77736c'),
    floor: mat('floor', '#9c8f7c'),
    crate: mat('crate', '#9a7148'),
    paint: mat('paint_red', '#a1382c'),
    metal: mat('metal', '#8c9196', { metalness: 1, roughness: 0.45 }),
  };
  // ground (one quad passing under everything)
  const g = new THREE.Mesh(new THREE.PlaneGeometry(36, 36).rotateX(-Math.PI / 2), M.ground);
  g.name = 'ground';
  root.add(g);

  // room: interior x [-3, 3], z [-2.5, 2.5], height 3, walls 0.25 m standing on the ground
  const T = 0.25, H = 3;
  // south wall (z = +2.5 .. +2.75) faces the sun: window 1.6 x 1.2, sill 1.0, centred at x = 0
  const sz = 2.5 + T / 2;
  root.add(box('wall_s_left', 2.2 + T, H, T, -3 - T / 2 + (2.2 + T) / 2, 0, sz, M.wall));
  root.add(box('wall_s_right', 2.2 + T, H, T, 3 + T / 2 - (2.2 + T) / 2, 0, sz, M.wall));
  root.add(box('wall_s_sill', 1.6, 1.0, T, 0, 0, sz, M.wall));
  root.add(box('wall_s_lintel', 1.6, H - 2.2, T, 0, 2.2, sz, M.wall));
  // north wall: one box overlapping both side walls (corner overlap)
  root.add(box('wall_n', 6 + 2 * T, H, T, 0, 0, -2.5 - T / 2, M.wall));
  // west wall solid, east wall with a door (1.0 x 2.1) at z = -1
  root.add(box('wall_w', T, H, 5 + 2 * T, -3 - T / 2, 0, 0, M.wall));
  const ex = 3 + T / 2;
  root.add(box('wall_e_a', T, H, 1.5 + T, ex, 0, -2.5 - T + (1.5 + T) / 2, M.wall));       // z -2.75 .. -1.5
  root.add(box('wall_e_b', T, H, 4.25 - 1 + T, ex, 0, 2.75 - (4.25 - 1 + T) / 2, M.wall)); // z -0.5 .. 2.75
  root.add(box('wall_e_top', T, H - 2.1, 1.0, ex, 2.1, -1, M.wall));
  // roof slab with a 0.4 m overhang, interior floor slab 2 cm above the ground (separate chart)
  root.add(box('roof', 6 + 2 * T + 0.8, 0.25, 5 + 2 * T + 0.8, 0, H, 0, M.roof));
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(6, 5).rotateX(-Math.PI / 2), M.floor);
  fl.name = 'room_floor'; fl.position.set(0, 0.02, 0);
  root.add(fl);
  // furniture: a table-like block in the sun patch and a cabinet against the north wall
  root.add(box('table', 1.2, 0.75, 0.7, 1.2, 0.02, 0.6, M.crate));
  root.add(box('cabinet', 0.8, 1.8, 0.45, -2.2, 0.02, -2.5 + 0.225, M.paint));

  // shed with THIN walls (0.15 m) standing directly on the ground plane, door on the shaded north side:
  // the interior floor is the same ground triangle that runs under the walls (worst case for leaks)
  const st = 0.15, sh = 2.5;
  root.add(box('shed_s', 3 + 2 * st, sh, st, 9.5, 0, -3 + st / 2, M.wall));
  root.add(box('shed_w', st, sh, 3, 8 - st / 2, 0, -4.5, M.wall));
  root.add(box('shed_e', st, sh, 3, 11 + st / 2, 0, -4.5, M.wall));
  root.add(box('shed_n_a', 1.05 + st, sh, st, 8 - st + (1.05 + st) / 2, 0, -6 - st / 2, M.wall));
  root.add(box('shed_n_b', 1.05 + st, sh, st, 11 + st - (1.05 + st) / 2, 0, -6 - st / 2, M.wall));
  root.add(box('shed_n_top', 0.9, 0.5, st, 9.5, 2.0, -6 - st / 2, M.wall));
  root.add(box('shed_roof', 3 + 2 * st + 0.4, 0.12, 3 + 2 * st + 0.4, 9.5, sh, -4.5, M.roof));

  // crates outside in the sun (one rotated, one stacked), a container-like long box
  root.add(box('crate_a', 1, 1, 1, 5.5, 0, 5, M.crate));
  root.add(box('crate_b', 1, 1, 1, 7.2, 0, 4.2, M.crate, 0.55));
  root.add(box('crate_c', 1, 1, 1, 7.2, 1, 4.2, M.crate, 0.2));
  root.add(box('container', 6, 2.6, 2.4, -6, 0, 7, M.paint, 0.25));
  // smooth cylinder (32 segments) + sphere: curved charts, smooth-normal seams
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3.5, 32, 4), M.wall);
  cyl.name = 'pillar'; cyl.position.set(-4.5, 1.75, 2.5);
  root.add(cyl);
  const sph = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 16), M.metal);
  sph.name = 'ball'; sph.position.set(3, 0.9, 7);
  root.add(sph);
  root.updateMatrixWorld(true);
  return root;
}

/** Synthetic town (benchmark): street grid with blocks of box buildings with window cut-outs, sidewalks, props. */
export function buildTown(size = 200) {
  const root = new THREE.Group();
  root.name = 'lm_town';
  const M = {
    asphalt: mat('asphalt', '#3d3d3d'), walk: mat('sidewalk', '#8c887e'),
    brick: mat('brick', '#8a4b36'), plaster: mat('plaster', '#b9b2a2'), roof: mat('roof', '#5a5752'),
    crate: mat('crate', '#9a7148'), metal: mat('metal', '#7c8288', { metalness: 1, roughness: 0.5 }),
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 8, 8).rotateX(-Math.PI / 2), M.asphalt);
  g.name = 'road';
  root.add(g);
  const block = 40, street = 12;
  const n = Math.floor(size / block);
  const half = (n * block) / 2;
  // buildings per block are merged per material (like the real map pipeline: one mesh per material and zone)
  for (let bx = 0; bx < n; bx++) for (let bz = 0; bz < n; bz++) {
    const x0 = -half + bx * block + street / 2, z0 = -half + bz * block + street / 2, L = block - street;
    const parts = { walk: [], brick: [], plaster: [], roof: [], crate: [] };
    const add = (k, w, h, d, x, y, z, ry = 0) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      geo.applyMatrix4(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y + h / 2, z));
      parts[k].push(geo);
    };
    add('walk', L, 0.15, L, x0 + L / 2, 0, z0 + L / 2);
    // 2 x 2 buildings per block: one enterable hollow shell with window holes and floors, three closed volumes
    // with proud window frames and a roof parapet (like most CS / CSO town blocks)
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const w = 11 + rnd() * 3, d = 11 + rnd() * 3, floors = 1 + Math.floor(rnd() * 3), h = floors * 3.2;
      const cx = x0 + 2 + i * (L / 2) + w / 2, cz = z0 + 2 + j * (L / 2) + d / 2;
      const k = rnd() < 0.5 ? 'brick' : 'plaster', t = 0.3;
      if ((i + j * 2 + bx + bz) % 4 !== 0) {
        add(k, w, h, d, cx, 0.15, cz);
        add('roof', w + 0.3, 0.6, d + 0.3, cx, 0.15 + h, cz);
        for (let f = 0; f < floors; f++) {
          const y = 0.15 + f * 3.2 + 0.9;
          for (const [len, alongX, off] of [[w, true, d / 2], [w, true, -d / 2], [d, false, w / 2], [d, false, -w / 2]]) {
            const nwin = Math.max(1, Math.floor(len / 3));
            for (let q = 0; q < nwin; q++) {
              const c = -len / 2 + (q + 0.5) * (len / nwin), o2 = off + Math.sign(off) * 0.04;
              if (alongX) add('crate', 1.3, 1.6, 0.08, cx + c, y, cz + o2); else add('crate', 0.08, 1.6, 1.3, cx + o2, y, cz + c);
            }
          }
        }
        continue;
      }
      // walls with window columns: piers + spandrels per floor
      const facade = (len, alongX, off) => {
        const nwin = Math.max(1, Math.floor(len / 3));
        const pitch = len / nwin;
        for (let f = 0; f < floors; f++) {
          const y = 0.15 + f * 3.2;
          for (let q = 0; q < nwin; q++) {
            const c = -len / 2 + (q + 0.5) * pitch;
            const pw = pitch - 1.4; // pier width
            const px = c - pitch / 2 + pw / 4, px2 = c + pitch / 2 - pw / 4;
            for (const p of [px, px2]) {
              if (alongX) add(k, pw / 2, 3.2, t, cx + p, y, cz + off); else add(k, t, 3.2, pw / 2, cx + off, y, cz + p);
            }
            if (alongX) { add(k, 1.4, 1.0, t, cx + c, y, cz + off); add(k, 1.4, 0.7, t, cx + c, y + 2.5, cz + off); }
            else { add(k, t, 1.0, 1.4, cx + off, y, cz + c); add(k, t, 0.7, 1.4, cx + off, y + 2.5, cz + c); }
          }
        }
      };
      facade(w, true, d / 2 - t / 2); facade(w, true, -d / 2 + t / 2);
      facade(d - 2 * t, false, w / 2 - t / 2); facade(d - 2 * t, false, -w / 2 + t / 2);
      for (let f = 1; f <= floors; f++) add(f === floors ? 'roof' : 'plaster', w, 0.25, d, cx, 0.15 + f * 3.2 - 0.25, cz);
      add('walk', w - 2 * t, 0.05, d - 2 * t, cx, 0.15, cz); // ground floor slab
    }
    for (let c = 0; c < 6; c++) add('crate', 1.2, 1.2, 1.2, x0 - street / 2 + 2 + rnd() * (street - 4), 0, z0 + rnd() * L, rnd() * 3);
    for (const [k, list] of Object.entries(parts)) {
      if (!list.length) continue;
      const m = new THREE.Mesh(mergeGeometries(list, false), M[k === 'walk' ? 'walk' : k]);
      m.name = `blk${bx}_${bz}_${k}`;
      root.add(m);
      for (const geo of list) geo.dispose();
    }
  }
  root.updateMatrixWorld(true);
  return root;
}

// ------------------------------------------------------------------------------------------ checks
/** Decoded lightmap value at a world point on a given mesh (nearest triangle facing `normal`). */
function makeSampler(res, atlasesDecoded) {
  const tmp = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tri = new THREE.Triangle(), bc = new THREE.Vector3(), cp = new THREE.Vector3(), nrm = new THREE.Vector3();
  return (mesh, p, normal) => {
    const g = mesh.geometry, pos = g.attributes.position, uv = g.attributes.uv1, idx = g.index;
    const P = new THREE.Vector3(...p), N = new THREE.Vector3(...normal);
    let best = Infinity, bu = 0, bv = 0;
    const nt = (idx ? idx.count : pos.count) / 3;
    for (let t = 0; t < nt; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
      tri.set(a, b, c);
      tri.getNormal(nrm);
      if (nrm.dot(N) < 0.9) continue;
      tri.closestPointToPoint(P, cp);
      const d = cp.distanceTo(P);
      if (d < best) {
        best = d;
        tri.getBarycoord(cp, bc);
        bu = uv.getX(i0) * bc.x + uv.getX(i1) * bc.y + uv.getX(i2) * bc.z;
        bv = uv.getY(i0) * bc.x + uv.getY(i1) * bc.y + uv.getY(i2) * bc.z;
      }
    }
    if (best > 0.05) throw new Error(`sample point ${p} not on mesh ${mesh.name} (${best.toFixed(3)} m)`);
    const A = atlasesDecoded[mesh.userData.lightmapAtlas];
    const x = bu * A.width - 0.5, y = bv * A.height - 0.5;
    const x0 = Math.max(0, Math.min(A.width - 2, Math.floor(x))), y0 = Math.max(0, Math.min(A.height - 2, Math.floor(y)));
    const fx = Math.min(1, Math.max(0, x - x0)), fy = Math.min(1, Math.max(0, y - y0));
    const out = [0, 0, 0, 0];
    for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const k = (y0 + dy) * A.width + x0 + dx;
      for (let ch = 0; ch < 3; ch++) out[ch] += A.E[k * 3 + ch] * w;
      out[3] += A.M[k] * w;
    }
    tmp.set(out[0], out[1], out[2]);
    return { E: out.slice(0, 3), L: 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2], mask: out[3], uv: [bu, bv] };
  };
}

function previewPNG(file, A, range) {
  // filmic-ish preview of the decoded irradiance (E * 0.35 albedo-ish, Reinhard, sRGB); sun mask in the alpha-less right half
  const W = A.width, H = A.height;
  const png = new PNG({ width: W * 2, height: H });
  const srgb = (v) => Math.round(255 * Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, o = (y * W * 2 + x) * 4, o2 = (y * W * 2 + W + x) * 4;
    for (let c = 0; c < 3; c++) { const v = A.E[k * 3 + c] * 0.25; png.data[o + c] = srgb(v / (1 + v)); }
    png.data[o + 3] = 255;
    const m = Math.round(A.M[k] * 255);
    png.data[o2] = m; png.data[o2 + 1] = m; png.data[o2 + 2] = m; png.data[o2 + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(png));
}

/** Writes a flat (non-RLE) Radiance RGBE sky: blue gradient, warm horizon, a bright sun disc at `sunDir`. */
function writeSynthHDR(file, sunDir) {
  const W = 512, H = 256;
  const l = Math.hypot(...sunDir), sd = sunDir.map((v) => v / l);
  const head = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`, 'ascii');
  const px = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, v = 1 - (y + 0.5) / H;
    const phi = (u - 0.5) * 2 * Math.PI, lat = (v - 0.5) * Math.PI;
    const d = [Math.cos(phi) * Math.cos(lat), Math.sin(lat), Math.sin(phi) * Math.cos(lat)];
    const t = Math.pow(Math.max(0, d[1]), 0.5);
    let c = d[1] >= 0 ? [1.1 - 0.6 * t, 1.05 - 0.4 * t, 0.95 + 0.05 * t] : [0.25, 0.22, 0.2];
    const cs = d[0] * sd[0] + d[1] * sd[1] + d[2] * sd[2];
    if (cs > Math.cos((1.2 * Math.PI) / 180)) c = [20000, 18000, 15000];       // sun disc
    else if (cs > 0.9) c = c.map((q) => q * (1 + 4 * (cs - 0.9) / 0.1));     // glow
    const m = Math.max(...c), o = (y * W + x) * 4;
    if (m < 1e-32) continue;
    const e = Math.ceil(Math.log2(m) + 1e-9), sc = 256 / Math.pow(2, e);
    px[o] = Math.min(255, Math.floor(c[0] * sc)); px[o + 1] = Math.min(255, Math.floor(c[1] * sc)); px[o + 2] = Math.min(255, Math.floor(c[2] * sc)); px[o + 3] = e + 128;
  }
  fs.writeFileSync(file, Buffer.concat([head, px]));
}

async function main() {
  const town = flag('town');
  const outDir = path.resolve(ROOT, opt('out', town ? 'captures/lightmap/town' : 'game/assets/maps/_test/lm'));
  const capDir = path.join(ROOT, 'captures', 'lightmap');
  fs.mkdirSync(capDir, { recursive: true });
  const scene = town ? buildTown(+opt('town', 200) || 200) : buildTestScene();
  let hdr = opt('hdr', null);
  if (flag('synth-hdr')) { hdr = path.join(capDir, 'synth_sky.hdr'); writeSynthHDR(hdr, SUN.dir); }
  const lights = town ? [] : [LAMP];
  const t0 = performance.now();
  const mem0 = process.memoryUsage().rss;
  let peak = mem0;
  const memTimer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 250);
  const res = await bakeLightmaps(scene, {
    sun: SUN, skyHdr: hdr || undefined, resolution: +opt('res', town ? 6 : 10), samples: +opt('samples', 64),
    bounces: +opt('bounces', 1), lights, workers: +opt('workers', 6), mode: opt('mode', 'indirect+mask'),
    maxAtlas: +opt('max-atlas', 2048), denoise: !flag('no-denoise'),
  });
  clearInterval(memTimer);
  peak = Math.max(peak, process.memoryUsage().rss);
  const secs = (performance.now() - t0) / 1000;
  console.log(`bake: ${secs.toFixed(1)} s, peak RSS ${(peak / 1048576).toFixed(0)} MB, ${res.stats.texels} texels, ${res.atlases.length} atlas(es)`);
  const meta = res.write(outDir, 'lm');
  const decoded = res.atlases.map((a) => decodeRGBM(a.rgbm, a.sun, res.range));
  decoded.forEach((A, i) => previewPNG(path.join(capDir, `${town ? 'town_' : ''}atlas_${i}.png`), A, res.range));

  if (!flag('no-glb') && !town) {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const glb = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false });
    fs.writeFileSync(path.join(outDir, 'scene.glb'), Buffer.from(glb));
  }
  fs.writeFileSync(path.join(outDir, 'lightmap.json'), JSON.stringify({
    ...meta, sun: { ...SUN, dir: res.sun.dir }, lights, sky: res.sky, stats: res.stats,
    meshes: Object.fromEntries(res.meshes.map((m) => [m.mesh.name, m.atlas])),
  }, null, 1));
  if (town) return;

  // ---- checks
  const S = makeSampler(res, decoded);
  const byName = (n) => { let f = null; scene.traverse((o) => { if (o.name === n && o.isMesh) f = o; }); if (!f) throw new Error('no mesh ' + n); return f; };
  const ground = byName('ground'), floor = byName('room_floor');
  const up = [0, 1, 0];
  const results = [];
  const check = (name, ok, info) => { results.push({ name, ok, info }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${info}`); };
  const fmt = (s) => `E ${s.L.toFixed(3)} mask ${s.mask.toFixed(2)}`;

  const openGround = S(ground, [12, 0, -10], up);
  check('open ground fully sunlit', openGround.mask > 0.97, fmt(openGround));
  const sunPatch = S(floor, [-0.83, 0.02, 1.35], up);
  check('window sun patch on the room floor', sunPatch.mask > 0.9, fmt(sunPatch));
  const darkFloor = S(floor, [-1.5, 0.02, -0.5], up);
  check('room floor out of the sun patch is in shadow', darkFloor.mask < 0.05, fmt(darkFloor));
  // leak checks at the wall bases: inside texels right next to the walls must not see the outside
  for (const [label, p, outside] of [
    ['south wall base (sunlit outside)', [-2, 0.02, 2.47], [-2, 0, 2.9]],
    ['north wall base', [1, 0.02, -2.47], [1, 0, -2.95]],
    ['west wall base', [-2.97, 0.02, 1.8], [-3.4, 0, 1.8]],
  ]) {
    const a = S(floor, p, up), b = S(ground, outside, up);
    check(`no leak at the ${label}`, a.mask < 0.05 && a.L < Math.max(0.6 * b.L, 0.05) + 0.25 * darkFloor.L, `inside ${fmt(a)} / outside ${fmt(b)}`);
  }
  for (const [label, p, outside] of [
    ['thin shed wall facing the sun (ground runs under the wall)', [9.5, 0, -3.03], [9.5, 0, -2.6]],
    ['thin shed wall, side', [10.97, 0, -4.2], [11.4, 0, -4.2]],
  ]) {
    const a = S(ground, p, up), b = S(ground, outside, up);
    check(`no leak at the ${label}`, a.mask < 0.05 && a.L < 0.35 * b.L, `inside ${fmt(a)} / outside ${fmt(b)}`);
  }
  const southOut = S(ground, [-2, 0, 2.95], up);
  check('ground hugging the sunlit south wall stays lit (no dark halo)', southOut.mask > 0.8, fmt(southOut));
  // crate shadow on the ground (sun from +x +z: shadow falls towards -x -z)
  const cs = S(ground, [5.5 - 0.55 * 0.38 / 0.72 * 1.4, 0, 5 - 0.55 * 0.58 / 0.72 * 1.4], up);
  check('crate casts a sun shadow on the ground', cs.mask < 0.3, fmt(cs));
  // lamp: brighter under the lamp than the far corner of the room
  const lampFloor = S(floor, [-1.6, 0.02, -1.2], up), farFloor = S(floor, [2.6, 0.02, -2.2], up);
  check('static point light is baked', lampFloor.L > farFloor.L * 1.5, `under lamp ${lampFloor.L.toFixed(3)} / far corner ${farFloor.L.toFixed(3)}`);
  // seams: smooth cylinder - compare the lightmap on both sides of every chart boundary at the same world point
  const cyl = byName('pillar');
  let worst = 0, n = 0;
  for (let k = 0; k < 64; k++) {
    const ang = (k / 64) * Math.PI * 2;
    const p = [-4.5 + Math.cos(ang) * 0.6, 1.2, 2.5 + Math.sin(ang) * 0.6];
    const nn = [Math.cos(ang), 0, Math.sin(ang)];
    const s1 = S(cyl, p, nn);
    const p2 = [-4.5 + Math.cos(ang + 0.01) * 0.6, 1.2, 2.5 + Math.sin(ang + 0.01) * 0.6];
    const s2 = S(cyl, p2, [Math.cos(ang + 0.01), 0, Math.sin(ang + 0.01)]);
    const du = Math.abs(s1.uv[0] - s2.uv[0]) + Math.abs(s1.uv[1] - s2.uv[1]);
    if (du > 0.01) { // the two points sit in different charts: values must still match
      const d = Math.abs(s1.L - s2.L) / Math.max(0.05, (s1.L + s2.L) / 2);
      worst = Math.max(worst, d); n++;
    }
  }
  check('smooth seams on the cylinder', worst < 0.12, `${n} chart boundaries, worst relative step ${(worst * 100).toFixed(1)} %`);
  // blotches: relative std-dev of the irradiance over an evenly lit wall area (outside of the west wall, in shade)
  const wallW = byName('wall_w');
  const vals = [];
  for (let y = 0.6; y < 2.6; y += 0.1) for (let z = -0.6; z < 0.6; z += 0.1) vals.push(S(wallW, [-3.25, y, z], [-1, 0, 0]).L);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  // a smooth vertical gradient is expected (more sky higher up); detrend by row
  const rows = new Map();
  let ri = 0;
  for (let y = 0.6; y < 2.6; y += 0.1, ri++) for (let z = 0; z < 12; z++) { if (!rows.has(ri)) rows.set(ri, []); rows.get(ri).push(vals[ri * 12 + z]); }
  let noise = 0, cnt = 0;
  for (const r of rows.values()) { const m = r.reduce((s, v) => s + v, 0) / r.length; for (const v of r) { noise += (v - m) ** 2; cnt++; } }
  noise = Math.sqrt(noise / cnt) / mean;
  check('no blotches on a shaded wall', noise < 0.04, `mean ${mean.toFixed(3)} sd ${(sd / mean * 100).toFixed(1)} %, row-detrended noise ${(noise * 100).toFixed(1)} %`);
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `${failed.length} check(s) FAILED` : 'all checks passed');
  console.log(`outputs: ${path.relative(ROOT, outDir)}/ (viewer: index.html?view=lightmap), previews: captures/lightmap/`);
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((e) => { console.error(e); process.exit(1); });
