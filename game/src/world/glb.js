// Minimal glTF 2.0 / GLB reader shared by the browser runtime and the Node map tools.
// Reads exactly what the map pipeline writes (and what Poly Haven glTFs contain): meshes with indexed
// triangle primitives, any accessor component type (normalized or not, interleaved or not), node
// transforms, materials as plain JSON, extras, and EXT_meshopt_compression (decoder passed in).
// No three.js dependency: callers turn the typed arrays into BufferGeometry themselves.

const GLB_MAGIC = 0x46546c67, CHUNK_JSON = 0x4e4f534a, CHUNK_BIN = 0x004e4942;
const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/** Splits a .glb into { json, buffers: [Uint8Array] } (buffer 0 = the BIN chunk). */
export function parseGLB(arrayBuffer) {
  const ab = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : arrayBuffer.buffer.slice(arrayBuffer.byteOffset, arrayBuffer.byteOffset + arrayBuffer.byteLength);
  const dv = new DataView(ab);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a GLB file');
  const length = dv.getUint32(8, true);
  let off = 12, json = null, bin = null;
  while (off < length) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const body = new Uint8Array(ab, off + 8, len);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === CHUNK_BIN) bin = body;
    off += 8 + len;
  }
  if (!json) throw new Error('GLB without JSON chunk');
  const buffers = (json.buffers || []).map((b, i) => (i === 0 && !b.uri ? bin : null));
  return { json, buffers };
}

/**
 * Decodes EXT_meshopt_compression bufferViews in place (replaces them with plain views on a new buffer).
 * `decoder` = MeshoptDecoder (three/addons/libs/meshopt_decoder.module.js or the meshoptimizer package).
 */
export async function decodeMeshopt(doc, decoder) {
  const { json, buffers } = doc;
  const views = json.bufferViews || [];
  if (!views.some((v) => v.extensions?.EXT_meshopt_compression)) return doc;
  if (!decoder) throw new Error('GLB uses EXT_meshopt_compression but no decoder was given');
  await decoder.ready;
  for (const v of views) {
    const ext = v.extensions?.EXT_meshopt_compression;
    if (!ext) continue;
    const src = buffers[ext.buffer];
    const source = new Uint8Array(src.buffer, src.byteOffset + (ext.byteOffset || 0), ext.byteLength);
    const target = new Uint8Array(ext.count * ext.byteStride);
    decoder.decodeGltfBuffer(target, ext.count, ext.byteStride, source, ext.mode, ext.filter || 'NONE');
    buffers.push(target);
    v.buffer = buffers.length - 1;
    v.byteOffset = 0;
    v.byteLength = target.byteLength;
    if (ext.mode === 'ATTRIBUTES') v.byteStride = ext.byteStride; else delete v.byteStride;
    delete v.extensions.EXT_meshopt_compression;
  }
  return doc;
}

/** Accessor -> { array (tightly packed typed array), itemSize, normalized, count, min, max }. */
export function readAccessor(doc, index) {
  const { json, buffers } = doc;
  const acc = json.accessors[index];
  const Type = COMPONENT[acc.componentType];
  const itemSize = SIZE[acc.type];
  const n = acc.count * itemSize;
  if (acc.bufferView === undefined) return { array: new Type(n), itemSize, normalized: !!acc.normalized, count: acc.count };
  const view = json.bufferViews[acc.bufferView];
  const buf = buffers[view.buffer];
  if (!buf) throw new Error(`buffer ${view.buffer} not loaded`);
  const base = buf.byteOffset + (view.byteOffset || 0) + (acc.byteOffset || 0);
  const elem = Type.BYTES_PER_ELEMENT * itemSize;
  const stride = view.byteStride || elem;
  let array;
  if (stride === elem && base % Type.BYTES_PER_ELEMENT === 0) {
    array = new Type(buf.buffer, base, n).slice();
  } else {
    array = new Type(n);
    const bytes = new Uint8Array(array.buffer);
    const src = new Uint8Array(buf.buffer);
    for (let i = 0; i < acc.count; i++) bytes.set(src.subarray(base + i * stride, base + i * stride + elem), i * elem);
  }
  return { array, itemSize, normalized: !!acc.normalized, count: acc.count, min: acc.min, max: acc.max };
}

const ATTR_NAMES = { POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv', TEXCOORD_1: 'uv1', COLOR_0: 'color', TANGENT: 'tangent' };
/** glTF attribute semantic -> three.js attribute name (`_SURF` -> `surf`). */
export function attributeName(sem) { return ATTR_NAMES[sem] || sem.replace(/^_/, '').toLowerCase(); }

function mul(a, b) { // column-major 4x4
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/**
 * Flattens the default scene into a list of mesh instances:
 *   [{ name, matrix (column-major, world), extras, primitives: [{ attributes: { position: acc, ... }, index: acc|null,
 *      material: index|undefined, mode }] }]
 */
export function readScene(doc) {
  const { json } = doc;
  const out = [];
  const meshCache = new Map();
  const getMesh = (mi) => {
    if (meshCache.has(mi)) return meshCache.get(mi);
    const m = json.meshes[mi];
    const prims = m.primitives.map((p) => {
      const attributes = {};
      for (const [sem, ai] of Object.entries(p.attributes)) attributes[attributeName(sem)] = readAccessor(doc, ai);
      return { attributes, index: p.indices !== undefined ? readAccessor(doc, p.indices) : null, material: p.material, mode: p.mode ?? 4 };
    });
    const res = { name: m.name || `mesh${mi}`, extras: m.extras || {}, primitives: prims };
    meshCache.set(mi, res);
    return res;
  };
  const visit = (ni, parent) => {
    const n = json.nodes[ni];
    const mat = mul(parent, nodeMatrix(n));
    if (n.mesh !== undefined) {
      const m = getMesh(n.mesh);
      out.push({ name: n.name || m.name, matrix: mat, extras: { ...m.extras, ...(n.extras || {}) }, primitives: m.primitives });
    }
    for (const c of n.children || []) visit(c, mat);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const scene = json.scenes?.[json.scene ?? 0];
  if (scene) for (const ni of scene.nodes) visit(ni, I);
  else (json.nodes || []).forEach((_, i) => visit(i, I));
  return out;
}

/** Normalized integer -> float conversion factor for a typed array class. */
export function normScale(array) {
  if (array instanceof Int8Array) return 1 / 127;
  if (array instanceof Uint8Array) return 1 / 255;
  if (array instanceof Int16Array) return 1 / 32767;
  if (array instanceof Uint16Array) return 1 / 65535;
  return 1;
}
