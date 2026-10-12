// Prints the structure of a character GLB: nodes/bones, meshes (tris, attributes), materials, image sizes,
// root extras. node tools/assets/zombies/inspect.mjs game/assets/zombies/walker_a.glb [--extras]
import fs from 'node:fs';

const file = process.argv[2];
const buf = fs.readFileSync(file);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
console.log(`${file}: ${(buf.length / 1048576).toFixed(2)} MB, ${json.nodes.length} nodes, ${json.skins?.[0]?.joints.length || 0} joints`);
for (const m of json.meshes) {
  const p = m.primitives[0];
  const idx = json.accessors[p.indices];
  const mat = json.materials?.[p.material];
  console.log(`  mesh ${m.name.padEnd(10)} ${String(idx.count / 3).padStart(6)} tris  ${String(json.accessors[p.attributes.POSITION].count).padStart(6)} verts  attrs ${Object.keys(p.attributes).join(',')}  mat ${mat?.name}`);
}
(json.images || []).forEach((im, i) => {
  const bv = json.bufferViews[im.bufferView];
  const users = [];
  json.materials.forEach((m) => {
    const t = (x) => x && json.textures[x.index].source === i;
    if (t(m.pbrMetallicRoughness?.baseColorTexture)) users.push(m.name + '.color');
    if (t(m.normalTexture)) users.push(m.name + '.normal');
    if (t(m.pbrMetallicRoughness?.metallicRoughnessTexture)) users.push(m.name + '.orm');
    if (t(m.emissiveTexture)) users.push(m.name + '.emissive');
  });
  console.log(`  image ${i} ${im.mimeType.padEnd(10)} ${(bv.byteLength / 1024).toFixed(0).padStart(6)} KB  ${users.join(' ')}`);
});
if (process.argv.includes('--extras')) console.log(JSON.stringify(json.nodes[0].extras, null, 1));
