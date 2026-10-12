// .proxy / .mhclo fitting. Every proxy (low-poly body) or clothing vertex is bound to a triangle of hm08
// base-mesh vertices: position = w1*V[a] + w2*V[b] + w3*V[c] + offset * scale, where scale per axis is
// the current distance between two reference base vertices divided by the distance recorded in the file
// (x_scale / y_scale / z_scale lines). Because the binding is barycentric, morphs, skin weights and our
// dismemberment segments all transfer from the base mesh by the same interpolation.
import fs from 'node:fs';
import path from 'node:path';
import { loadOBJ } from './obj.mjs';

/** Parses a .proxy or .mhclo file. */
export function parseBinding(file) {
  const text = fs.readFileSync(file, 'utf8');
  const out = { file, name: path.basename(file).replace(/\.\w+$/, ''), scale: {}, ref: [], deleteVerts: new Set(), material: null, objFile: null, zDepth: 50, tags: [] };
  let mode = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const p = line.split(/\s+/);
    const k = p[0];
    if (/^-?\d/.test(k)) {
      if (mode === 'verts') {
        if (p.length >= 9) out.ref.push(p.slice(0, 9).map(Number));
        else if (p.length === 1) out.ref.push([+p[0], +p[0], +p[0], 1, 0, 0, 0, 0, 0]);
      } else if (mode === 'delete') {
        for (let i = 0; i < p.length; i++) {
          if (p[i + 1] === '-') { for (let v = +p[i]; v <= +p[i + 2]; v++) out.deleteVerts.add(v); i += 2; }
          else if (/^\d+$/.test(p[i])) out.deleteVerts.add(+p[i]);
        }
      }
      continue;
    }
    switch (k) {
      case 'verts': mode = 'verts'; break;
      case 'delete_verts': mode = 'delete'; break;
      case 'weights': case 'offsets': mode = k; break;
      case 'name': out.name = p[1]; break;
      case 'obj_file': out.objFile = p[1]; break;
      case 'material': out.material = p[1]; break;
      case 'z_depth': out.zDepth = +p[1]; break;
      case 'tag': out.tags.push(p.slice(1).join(' ')); break;
      case 'x_scale': case 'y_scale': case 'z_scale': out.scale[k[0]] = [+p[1], +p[2], +p[3]]; break;
      default: if (mode !== 'verts' && mode !== 'delete') mode = null;
    }
  }
  return out;
}

/** Loads binding + its OBJ. */
export function loadBinding(file) {
  const b = parseBinding(file);
  const obj = loadOBJ(path.join(path.dirname(file), b.objFile || b.name + '.obj'));
  const n = obj.positions.length / 3;
  if (b.ref.length !== n) throw new Error(`${b.name}: ${b.ref.length} bindings for ${n} vertices`);
  b.obj = obj;
  b.refIdx = new Int32Array(n * 3);
  b.refW = new Float32Array(n * 3);
  b.refOff = new Float32Array(n * 3);
  b.ref.forEach((r, i) => {
    b.refIdx.set(r.slice(0, 3), i * 3);
    b.refW.set(r.slice(3, 6), i * 3);
    b.refOff.set(r.slice(6, 9), i * 3);
  });
  return b;
}

/** Fits the binding onto base positions (same units as the file: MakeHuman decimetres). */
export function fitBinding(b, base) {
  const sc = [1, 1, 1];
  ['x', 'y', 'z'].forEach((ax, a) => {
    const s = b.scale[ax];
    if (s) sc[a] = Math.abs(base[s[0] * 3 + a] - base[s[1] * 3 + a]) / s[2];
  });
  const n = b.refIdx.length / 3;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      let v = 0;
      for (let k = 0; k < 3; k++) v += b.refW[i * 3 + k] * base[b.refIdx[i * 3 + k] * 3 + a];
      out[i * 3 + a] = v + b.refOff[i * 3 + a] * sc[a];
    }
  }
  return out;
}
