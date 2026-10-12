// Minimal glTF 2.0 / GLB reader for animation work (Node, no three.js loaders needed).
// Reads the node hierarchy (rest TRS), skins and animations, and resamples clips into
// per-node local TRS frames at a fixed rate.
import fs from 'node:fs';

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

export function readGLB(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB: ' + file);
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  return new GLTFDoc(json, bin);
}

export class GLTFDoc {
  constructor(json, bin) {
    this.json = json;
    this.bin = bin;
    this.nodes = json.nodes.map((n, i) => ({
      index: i,
      name: n.name || `node${i}`,
      children: n.children || [],
      parent: -1,
      t: n.translation ? [...n.translation] : [0, 0, 0],
      r: n.rotation ? [...n.rotation] : [0, 0, 0, 1],
      s: n.scale ? [...n.scale] : [1, 1, 1],
      matrix: n.matrix || null,
      mesh: n.mesh,
      skin: n.skin,
    }));
    for (const n of this.nodes) for (const c of n.children) this.nodes[c].parent = n.index;
    if (this.nodes.some((n) => n.matrix)) throw new Error('matrix nodes not supported');
  }

  /** Typed array view of an accessor, de-normalized to floats when needed. */
  accessor(i) {
    const a = this.json.accessors[i];
    const bv = this.json.bufferViews[a.bufferView];
    const C = COMP[a.componentType];
    const nc = NCOMP[a.type];
    const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const stride = bv.byteStride || 0;
    const elem = C.BYTES_PER_ELEMENT * nc;
    let out;
    if (!stride || stride === elem) {
      const copy = Buffer.from(this.bin.subarray(start, start + a.count * elem));
      out = new C(copy.buffer, copy.byteOffset, a.count * nc);
    } else {
      out = new C(a.count * nc);
      const dv = new DataView(this.bin.buffer, this.bin.byteOffset);
      for (let k = 0; k < a.count; k++) for (let c = 0; c < nc; c++) {
        const p = start + k * stride + c * C.BYTES_PER_ELEMENT;
        out[k * nc + c] = C === Float32Array ? dv.getFloat32(p, true) : C === Uint16Array ? dv.getUint16(p, true) : C === Uint8Array ? dv.getUint8(p) : C === Int16Array ? dv.getInt16(p, true) : C === Int8Array ? dv.getInt8(p) : dv.getUint32(p, true);
      }
    }
    if (a.normalized && NORM[a.componentType]) {
      const f = new Float32Array(out.length);
      for (let k = 0; k < out.length; k++) f[k] = Math.max(out[k] / NORM[a.componentType], -1);
      return f;
    }
    return out;
  }

  nodeByName(name) { return this.nodes.find((n) => n.name === name); }

  animationNames() { return (this.json.animations || []).map((a) => a.name); }

  /**
   * Samples animation `name` at `fps`. Returns { name, fps, frames, duration, tracks: Map<nodeName, {t?,r?,s?}> }
   * where each channel is an array of frames ([x,y,z] / [x,y,z,w]). Nodes without a channel keep rest values.
   */
  sampleAnimation(name, fps = 30) {
    const anim = (this.json.animations || []).find((a) => a.name === name);
    if (!anim) throw new Error('no animation ' + name);
    let tMax = 0;
    const chans = anim.channels.map((ch) => {
      const s = anim.samplers[ch.sampler];
      const times = this.accessor(s.input);
      const vals = this.accessor(s.output);
      tMax = Math.max(tMax, times[times.length - 1]);
      return { node: ch.target.node, path: ch.target.path, times, vals, interp: s.interpolation || 'LINEAR' };
    });
    const frames = Math.max(2, Math.round(tMax * fps) + 1);
    const tracks = new Map();
    for (const c of chans) {
      if (c.path === 'weights') continue;
      const key = c.path === 'translation' ? 't' : c.path === 'rotation' ? 'r' : 's';
      const nc = key === 'r' ? 4 : 3;
      const nodeName = this.nodes[c.node].name;
      const tr = tracks.get(nodeName) || {};
      const out = [];
      for (let f = 0; f < frames; f++) out.push(sampleChannel(c, nc, Math.min(f / fps, tMax)));
      tr[key] = out;
      tracks.set(nodeName, tr);
    }
    return { name, fps, frames, duration: (frames - 1) / fps, tracks };
  }
}

function sampleChannel(c, nc, t) {
  const { times, vals, interp } = c;
  const cubic = interp === 'CUBICSPLINE';
  const get = (k) => {
    const base = cubic ? (k * 3 + 1) * nc : k * nc;
    return Array.from(vals.subarray(base, base + nc));
  };
  if (t <= times[0]) return get(0);
  const n = times.length;
  if (t >= times[n - 1]) return get(n - 1);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; }
  const a = get(lo), b = get(hi);
  if (interp === 'STEP') return a;
  const u = (t - times[lo]) / (times[hi] - times[lo]);
  if (nc === 4) return slerp(a, b, u);
  return a.map((v, i) => v + (b[i] - v) * u);
}

export function slerp(a, b, u) {
  let [ax, ay, az, aw] = a;
  let [bx, by, bz, bw] = b;
  let d = ax * bx + ay * by + az * bz + aw * bw;
  if (d < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; d = -d; }
  let k0, k1;
  if (d > 0.9995) { k0 = 1 - u; k1 = u; } else {
    const th = Math.acos(d), s = Math.sin(th);
    k0 = Math.sin((1 - u) * th) / s; k1 = Math.sin(u * th) / s;
  }
  const r = [ax * k0 + bx * k1, ay * k0 + by * k1, az * k0 + bz * k1, aw * k0 + bw * k1];
  const l = Math.hypot(...r);
  return r.map((v) => v / l);
}
