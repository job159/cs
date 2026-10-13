// dev: per-mesh bounds / dominant bones of a character GLB: node inspect_glb.mjs <file>
import fs from 'node:fs';
const buf = fs.readFileSync(process.argv[2]);
const jl = buf.readUInt32LE(12);
const j = JSON.parse(buf.subarray(20, 20 + jl).toString());
const bin = buf.subarray(20 + jl + 8);
const acc = (i) => {
  const a = j.accessors[i], v = j.bufferViews[a.bufferView];
  const nc = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const C = { 5126: Float32Array, 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType];
  const stride = v.byteStride || nc * C.BYTES_PER_ELEMENT;
  const out = new C(a.count * nc);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < nc; c++) out[k * nc + c] = new C(bin.buffer.slice(bin.byteOffset + (v.byteOffset || 0) + k * stride + c * C.BYTES_PER_ELEMENT, bin.byteOffset + (v.byteOffset || 0) + k * stride + (c + 1) * C.BYTES_PER_ELEMENT))[0];
  return out;
};
const boneNames = j.skins[0].joints.map((n) => j.nodes[n].name);
for (const m of j.meshes) {
  const p = m.primitives[0];
  const P = acc(p.attributes.POSITION), J = acc(p.attributes.JOINTS_0);
  let top = -1, ti = 0;
  for (let i = 0; i < P.length / 3; i++) if (P[i * 3 + 1] > top) { top = P[i * 3 + 1]; ti = i; }
  console.log(m.name, 'verts', P.length / 3, 'tris', j.accessors[p.indices].count / 3, 'top', top.toFixed(3), 'bone', boneNames[J[ti * 4]], 'at', [P[ti * 3], P[ti * 3 + 1], P[ti * 3 + 2]].map((x) => x.toFixed(3)).join(','));
}
console.log('extras', JSON.stringify(j.scenes[0].extras).slice(0, 600));
console.log('animations', (j.animations || []).map((a) => a.name).join(','));
