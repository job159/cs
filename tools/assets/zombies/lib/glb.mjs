// Minimal glTF 2.0 binary writer for one skinned character: a root node (type name, extras), the bone
// hierarchy, skinned mesh nodes sharing one skin, PBR materials with embedded JPEG/PNG textures.
// Written directly (instead of three's GLTFExporter) so it runs in plain Node and we control the exact
// layout: JOINTS_0 u8, WEIGHTS_0 float, custom _SEG u8 (4-byte strided per the glTF alignment rule).
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { encodeJPEG, encodePNG } from './image.mjs';

/**
 * @param o.name        root node name
 * @param o.extras      root extras (also stored on the scene)
 * @param o.bones       [{name, parent, localPos:Vector3, localQuat:Quaternion, world:Quaternion, head:Vector3}]
 * @param o.meshes      [{name, render:{position,normal,uv,joints,weights,seg,index}, material, extras}]
 *                      material: {name, role, baseColor?:Image, colorFormat?:'jpg'|'png', normal?:Image,
 *                      orm?:Image, color?:[r,g,b,a], roughness, metalness, emissive?:[r,g,b], emissiveMap?:Image,
 *                      alphaMode?, alphaCutoff?, doubleSided?, normalScale?, quality?}
 */
export function writeGLB(file, o) {
  const json = {
    asset: { version: '2.0', generator: 'calamity-front zombie pipeline' },
    scene: 0, scenes: [{ name: o.name, nodes: [0], extras: o.extras }],
    nodes: [], meshes: [], materials: [], textures: [], images: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    accessors: [], bufferViews: [], buffers: [], skins: [],
  };
  const chunks = [];
  let byteLength = 0;
  const pushView = (buf, target, byteStride) => {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); byteLength += pad; }
    const view = { buffer: 0, byteOffset: byteLength, byteLength: buf.length };
    if (target) view.target = target;
    if (byteStride) view.byteStride = byteStride;
    chunks.push(buf); byteLength += buf.length;
    json.bufferViews.push(view);
    return json.bufferViews.length - 1;
  };
  const accessor = (arr, type, componentType, { target = 34962, minmax = false, stride = 0, normalized = false } = {}) => {
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    let buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    if (stride) { // re-pack with padding per element
      const es = arr.BYTES_PER_ELEMENT * comps, n = arr.length / comps;
      const b = Buffer.alloc(n * stride);
      for (let i = 0; i < n; i++) buf.copy(b, i * stride, i * es, i * es + es);
      buf = b;
    }
    const acc = { bufferView: pushView(buf, target, stride || undefined), componentType, count: arr.length / comps, type };
    if (normalized) acc.normalized = true;
    if (minmax) {
      const mn = new Array(comps).fill(Infinity), mx = new Array(comps).fill(-Infinity);
      for (let i = 0; i < arr.length; i++) { const c = i % comps; mn[c] = Math.min(mn[c], arr[i]); mx[c] = Math.max(mx[c], arr[i]); }
      acc.min = mn; acc.max = mx;
    }
    json.accessors.push(acc);
    return json.accessors.length - 1;
  };
  const imageCache = new Map();
  const texture = (img, fmt = 'jpg', quality = 88, pngBits = 8) => {
    if (!img) return undefined;
    const key = img;
    if (imageCache.has(key)) return imageCache.get(key);
    const data = fmt === 'png' ? encodePNG(pngBits < 8 ? quantize(img, pngBits) : img) : encodeJPEG(img, quality);
    json.images.push({ bufferView: pushView(data), mimeType: fmt === 'png' ? 'image/png' : 'image/jpeg' });
    json.textures.push({ sampler: 0, source: json.images.length - 1 });
    const idx = json.textures.length - 1;
    imageCache.set(key, idx);
    return idx;
  };
  const materialCache = new Map();
  const material = (m) => {
    if (materialCache.has(m)) return materialCache.get(m);
    const pbr = { metallicFactor: m.metalness ?? 0, roughnessFactor: m.roughness ?? 1 };
    if (m.color) pbr.baseColorFactor = m.color;
    const bc = texture(m.baseColor, m.colorFormat || (m.alphaMode && m.alphaMode !== 'OPAQUE' ? 'png' : 'jpg'), m.quality ?? 88, m.pngBits ?? 8);
    if (bc !== undefined) pbr.baseColorTexture = { index: bc };
    const orm = texture(m.orm, 'jpg', 90);
    if (orm !== undefined) pbr.metallicRoughnessTexture = { index: orm };
    const mat = { name: m.name, pbrMetallicRoughness: pbr, extras: { role: m.role || m.name, ...(m.extras || {}) } };
    const nm = texture(m.normal, 'jpg', 92);
    if (nm !== undefined) { mat.normalTexture = { index: nm }; if (m.normalScale !== undefined) mat.normalTexture.scale = m.normalScale; }
    if (orm !== undefined && m.ormHasAO !== false) mat.occlusionTexture = { index: orm, strength: m.aoStrength ?? 1 };
    if (m.emissive) mat.emissiveFactor = m.emissive;
    const em = texture(m.emissiveMap, 'jpg', 90);
    if (em !== undefined) mat.emissiveTexture = { index: em };
    if (m.alphaMode && m.alphaMode !== 'OPAQUE') { mat.alphaMode = m.alphaMode; if (m.alphaMode === 'MASK') mat.alphaCutoff = m.alphaCutoff ?? 0.5; }
    if (m.doubleSided) mat.doubleSided = true;
    json.materials.push(mat);
    materialCache.set(m, json.materials.length - 1);
    return json.materials.length - 1;
  };

  // nodes: 0 = root, then bones, then meshes
  const root = { name: o.name, children: [], extras: o.extras };
  json.nodes.push(root);
  const boneNode = [];
  o.bones.forEach((b) => {
    const n = { name: b.name, translation: [b.localPos.x, b.localPos.y, b.localPos.z], rotation: [b.localQuat.x, b.localQuat.y, b.localQuat.z, b.localQuat.w] };
    boneNode.push(json.nodes.length);
    json.nodes.push(n);
  });
  o.bones.forEach((b, i) => {
    if (b.parent < 0) root.children.push(boneNode[i]);
    else (json.nodes[boneNode[b.parent]].children ||= []).push(boneNode[i]);
  });
  const ibm = new Float32Array(o.bones.length * 16);
  o.bones.forEach((b, i) => {
    const m = new THREE.Matrix4().compose(b.head, b.world, new THREE.Vector3(1, 1, 1)).invert();
    ibm.set(m.elements, i * 16);
  });
  json.skins.push({ joints: boneNode, inverseBindMatrices: accessor(ibm, 'MAT4', 5126, { target: 0 }), skeleton: boneNode[o.bones.findIndex((b) => b.parent < 0)] });
  json.bufferViews[json.accessors[json.skins[0].inverseBindMatrices].bufferView].target = undefined;

  for (const m of o.meshes) {
    const r = m.render;
    const attributes = {
      POSITION: accessor(r.position, 'VEC3', 5126, { minmax: true }),
      NORMAL: accessor(r.normal, 'VEC3', 5126),
      TEXCOORD_0: accessor(r.uv, 'VEC2', 5126),
      JOINTS_0: accessor(r.joints, 'VEC4', 5121),
      WEIGHTS_0: accessor(r.weights, 'VEC4', 5126),
    };
    if (r.seg) attributes._SEG = accessor(r.seg, 'SCALAR', 5121, { stride: 4 });
    const nv = r.position.length / 3;
    const index = nv < 65536 ? Uint16Array.from(r.index) : r.index;
    const indices = accessor(index, 'SCALAR', nv < 65536 ? 5123 : 5125, { target: 34963 });
    json.meshes.push({ name: m.name, primitives: [{ attributes, indices, material: material(m.material), mode: 4 }] });
    const node = { name: m.name, mesh: json.meshes.length - 1, skin: 0 };
    if (m.extras) node.extras = m.extras;
    root.children.push(json.nodes.length);
    json.nodes.push(node);
  }

  for (const v of json.bufferViews) if (v.target === undefined) delete v.target;
  for (const k of ['textures', 'images', 'materials']) if (!json[k].length) delete json[k];
  if (!json.textures) delete json.samplers;
  const bin = Buffer.concat(chunks);
  const binPad = Buffer.alloc((4 - (bin.length % 4)) % 4);
  json.buffers.push({ byteLength: bin.length + binPad.length });
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const total = 12 + 8 + jsonBuf.length + 8 + bin.length + binPad.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length + binPad.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([header, jh, jsonBuf, bh, bin, binPad]));
  return { bytes: total, images: json.images?.length || 0 };
}

/** Reduces colour precision (and blanks fully transparent texels) so big RGBA PNGs deflate much better. */
function quantize(img, bits) {
  const step = 1 << (8 - bits);
  const d = new Uint8Array(img.data);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 0; continue; }
    d[i + 3] = 255;
    for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, Math.round(d[i + c] / step) * step);
  }
  return { width: img.width, height: img.height, data: d };
}
