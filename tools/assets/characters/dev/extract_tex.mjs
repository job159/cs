// dev: extract a material's textures from a GLB: node extract_tex.mjs <glb> <material index|name> <outPrefix>
import fs from 'node:fs';
const [file, which, out] = process.argv.slice(2);
const buf = fs.readFileSync(file); const jl = buf.readUInt32LE(12); const j = JSON.parse(buf.subarray(20, 20 + jl).toString()); const bin = buf.subarray(20 + jl + 8);
const mats = j.materials.map((m, i) => [i, m.name]);
console.log(JSON.stringify(mats));
const m = j.materials[isNaN(+which) ? mats.find(([, n]) => n === which)[0] : +which];
for (const [k, t] of [['albedo', m.pbrMetallicRoughness.baseColorTexture], ['normal', m.normalTexture], ['orm', m.pbrMetallicRoughness.metallicRoughnessTexture]]) {
  if (!t) continue;
  const img = j.images[j.textures[t.index].source]; const v = j.bufferViews[img.bufferView];
  const ext = img.mimeType === 'image/png' ? 'png' : 'jpg';
  fs.writeFileSync(`${out}_${k}.${ext}`, bin.subarray(v.byteOffset, v.byteOffset + v.byteLength));
  console.log('wrote', `${out}_${k}.${ext}`);
}
