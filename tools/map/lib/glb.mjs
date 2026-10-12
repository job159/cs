// Minimal GLB writer for the map pipeline (Node). Writes valid glTF 2.0 that any viewer opens; the
// game reads it back with game/src/world/glb.js.
//
//   writeGLB({
//     meshes: [{ name, attributes: { POSITION: { array: Float32Array, itemSize: 3 }, NORMAL, TEXCOORD_0, TEXCOORD_1,
//                COLOR_0: { array: Uint8Array, itemSize: 4, normalized: true }, _SURF: { array: Uint8Array, itemSize: 1 } },
//                indices: Uint16Array | Uint32Array, material: 0, extras: {} }],
//     materials: [{ name, pbrMetallicRoughness: {...}, extras: {...} }],   // plain glTF JSON
//     images: [{ uri }], textures: [{ source }], samplers: [...],          // optional, plain glTF JSON
//     extras: {}, meshopt: false,
//   }) -> Buffer
//
// meshopt: true compresses every view with EXT_meshopt_compression (required extension; the runtime decodes
// it with three's meshopt_decoder). Float attributes are stored losslessly (no filters) so lightmap UVs and
// positions stay exact; the codec still shrinks typical map geometry 2-4x.
import { MeshoptEncoder } from 'meshoptimizer';

const TYPE = { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4' };
function componentType(a) {
  if (a instanceof Float32Array) return 5126;
  if (a instanceof Uint32Array) return 5125;
  if (a instanceof Uint16Array) return 5123;
  if (a instanceof Int16Array) return 5122;
  if (a instanceof Uint8Array) return 5121;
  if (a instanceof Int8Array) return 5120;
  throw new Error('unsupported array type ' + a?.constructor?.name);
}
const pad4 = (n) => (n + 3) & ~3;

export async function writeGLB(doc) {
  const meshopt = !!doc.meshopt;
  if (meshopt) await MeshoptEncoder.ready;
  const json = {
    asset: { version: '2.0', generator: 'calamity-front map compiler' },
    scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [],
    buffers: [], materials: doc.materials || [],
  };
  if (doc.images?.length) json.images = doc.images;
  if (doc.textures?.length) json.textures = doc.textures;
  if (doc.samplers?.length) json.samplers = doc.samplers;
  if (doc.extras) json.extras = doc.extras;
  let rawLen = 0, binLen = 0;
  const bin = [];
  const addView = (bytes, { stride, target, mode, count, size }) => {
    const view = { buffer: meshopt ? 1 : 0, byteOffset: rawLen, byteLength: bytes.byteLength };
    if (stride) view.byteStride = stride;
    if (target) view.target = target;
    rawLen = pad4(rawLen + bytes.byteLength);
    if (meshopt) {
      const enc = MeshoptEncoder.encodeGltfBuffer(bytes, count, size, mode);
      view.extensions = { EXT_meshopt_compression: { buffer: 0, byteOffset: binLen, byteLength: enc.byteLength, byteStride: size, count, mode } };
      bin.push({ off: binLen, data: enc });
      binLen = pad4(binLen + enc.byteLength);
    } else {
      bin.push({ off: binLen, data: bytes });
      binLen = pad4(binLen + bytes.byteLength);
    }
    json.bufferViews.push(view);
    return json.bufferViews.length - 1;
  };
  for (const m of doc.meshes) {
    const prim = { attributes: {}, mode: 4 };
    let count = -1;
    for (const [sem, attr] of Object.entries(m.attributes)) {
      if (!attr) continue;
      let { array, itemSize, normalized } = attr;
      const n = array.length / itemSize;
      if (count < 0) count = n; else if (count !== n) throw new Error(`attribute ${sem} of ${m.name}: ${n} != ${count}`);
      const ct = componentType(array);
      const elem = array.BYTES_PER_ELEMENT * itemSize;
      // vertex attribute elements must be 4-byte aligned (glTF + meshopt ATTRIBUTES): pad small items
      let bytes, stride = elem;
      if (elem % 4) {
        stride = pad4(elem);
        bytes = new Uint8Array(stride * n);
        const src = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        for (let i = 0; i < n; i++) bytes.set(src.subarray(i * elem, i * elem + elem), i * stride);
      } else bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      const bv = addView(bytes, { stride: stride !== elem || meshopt ? stride : undefined, target: 34962, mode: 'ATTRIBUTES', count: n, size: stride });
      const acc = { bufferView: bv, componentType: ct, count: n, type: TYPE[itemSize] };
      if (normalized) acc.normalized = true;
      if (sem === 'POSITION') {
        const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const v = array[i * 3 + c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; }
        acc.min = mn; acc.max = mx;
      }
      json.accessors.push(acc);
      prim.attributes[sem] = json.accessors.length - 1;
    }
    if (m.indices) {
      let idx = m.indices;
      if (idx instanceof Uint32Array && count <= 65535) idx = Uint16Array.from(idx);
      const size = idx.BYTES_PER_ELEMENT;
      const bytes = new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength);
      const bv = addView(bytes, { target: 34963, mode: 'TRIANGLES', count: idx.length, size });
      json.accessors.push({ bufferView: bv, componentType: componentType(idx), count: idx.length, type: 'SCALAR' });
      prim.indices = json.accessors.length - 1;
    }
    if (m.material !== undefined) prim.material = m.material;
    const mesh = { name: m.name, primitives: [prim] };
    if (m.extras) mesh.extras = m.extras;
    json.meshes.push(mesh);
    const node = { name: m.name, mesh: json.meshes.length - 1 };
    if (m.matrix) node.matrix = m.matrix;
    if (m.nodeExtras) node.extras = m.nodeExtras;
    json.nodes.push(node);
    json.scenes[0].nodes.push(json.nodes.length - 1);
  }
  if (meshopt) {
    json.buffers = [{ byteLength: binLen }, { byteLength: rawLen, extensions: { EXT_meshopt_compression: { fallback: true } } }];
    json.extensionsUsed = ['EXT_meshopt_compression'];
    json.extensionsRequired = ['EXT_meshopt_compression'];
  } else json.buffers = [{ byteLength: binLen }];
  if (!json.materials.length) delete json.materials;
  // assemble
  const binBuf = Buffer.alloc(binLen);
  for (const c of bin) Buffer.from(c.data.buffer, c.data.byteOffset, c.data.byteLength).copy(binBuf, c.off);
  let jsonStr = JSON.stringify(json);
  while (Buffer.byteLength(jsonStr) % 4) jsonStr += ' ';
  const jsonBuf = Buffer.from(jsonStr);
  const total = 12 + 8 + jsonBuf.length + (binLen ? 8 + binLen : 0);
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12); out.writeUInt32LE(0x4e4f534a, 16); jsonBuf.copy(out, 20);
  if (binLen) {
    const o = 20 + jsonBuf.length;
    out.writeUInt32LE(binLen, o); out.writeUInt32LE(0x004e4942, o + 4); binBuf.copy(out, o + 8);
  }
  return out;
}
