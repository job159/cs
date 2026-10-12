// Wavefront OBJ loader for MakeHuman meshes (base.obj, proxies, clothes, eyes, hair...).
// Keeps the original vertex indexing (targets, weights and .mhclo bindings refer to it) and the per-corner
// UV indices separately; toRender() later splits vertices on UV seams for the GPU.
import fs from 'node:fs';

/**
 * @returns {{ positions: Float32Array, uvs: Float32Array, faces: {v:number[], t:number[], g:number}[],
 *             groups: string[], groupVerts(name): Set<number> }}
 */
export function loadOBJ(file) {
  const text = fs.readFileSync(file, 'utf8');
  const pos = [], uv = [], faces = [], groups = ['default'];
  let g = 0;
  const groupIndex = new Map([['default', 0]]);
  for (const line of text.split('\n')) {
    const c0 = line.charCodeAt(0);
    if (c0 === 118) { // v, vt, vn
      if (line.charCodeAt(1) === 32) {
        const p = line.trim().split(/\s+/);
        pos.push(+p[1], +p[2], +p[3]);
      } else if (line.charCodeAt(1) === 116) {
        const p = line.trim().split(/\s+/);
        uv.push(+p[1], +p[2]);
      }
    } else if (c0 === 102 && line.charCodeAt(1) === 32) { // f
      const p = line.trim().split(/\s+/).slice(1);
      const v = [], t = [];
      for (const corner of p) {
        const [a, b] = corner.split('/');
        v.push(+a - 1);
        t.push(b ? +b - 1 : -1);
      }
      faces.push({ v, t, g });
    } else if (c0 === 103 && line.charCodeAt(1) === 32) { // g
      const name = line.slice(2).trim();
      if (!groupIndex.has(name)) { groupIndex.set(name, groups.length); groups.push(name); }
      g = groupIndex.get(name);
    }
  }
  const mesh = {
    positions: new Float32Array(pos),
    uvs: new Float32Array(uv),
    faces,
    groups,
    groupVerts(name) {
      const gi = groupIndex.get(name);
      const s = new Set();
      if (gi === undefined) return s;
      for (const f of faces) if (f.g === gi) for (const v of f.v) s.add(v);
      return s;
    },
    groupIndex,
  };
  return mesh;
}
