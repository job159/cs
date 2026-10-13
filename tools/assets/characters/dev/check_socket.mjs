// dev: reads soldier.glb, evaluates a clip frame with three's AnimationMixer in node, attaches the socket and prints
// the weapon frame axes in model space.
import fs from 'node:fs';
import * as THREE from 'three';
const file = process.argv[2] || 'game/assets/characters/soldier.glb', clipName = process.argv[3] || 'fire_rifle', T = +(process.argv[4] || 0);
const buf = fs.readFileSync(file); const jl = buf.readUInt32LE(12); const j = JSON.parse(buf.subarray(20, 20 + jl).toString()); const bin = buf.subarray(20 + jl + 8);
const acc = (i) => { const a = j.accessors[i], v = j.bufferViews[a.bufferView]; const nc = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type]; return new Float32Array(bin.buffer.slice(bin.byteOffset + (v.byteOffset || 0), bin.byteOffset + (v.byteOffset || 0) + a.count * nc * 4)); };
const nodes = j.nodes.map((n) => { const o = new THREE.Bone(); o.name = n.name; if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); return o; });
j.nodes.forEach((n, i) => (n.children || []).forEach((c) => nodes[i].add(nodes[c])));
const root = nodes[0];
const anim = j.animations.find((a) => a.name === clipName);
for (const ch of anim.channels) {
  const s = anim.samplers[ch.sampler]; const times = acc(s.input), vals = acc(s.output);
  // sample at T (linear)
  const n = times.length; let k = 0; while (k < n - 1 && times[k + 1] <= T) k++;
  const u = n > 1 && k < n - 1 ? (T - times[k]) / (times[k + 1] - times[k]) : 0; const o = nodes[ch.target.node];
  if (ch.target.path === 'rotation') { const a = new THREE.Quaternion().fromArray(vals, k * 4); if (k < n - 1) a.slerp(new THREE.Quaternion().fromArray(vals, (k + 1) * 4), Math.max(0, Math.min(1, u))); o.quaternion.copy(a); }
  else { const a = new THREE.Vector3().fromArray(vals, k * 3); if (k < n - 1) a.lerp(new THREE.Vector3().fromArray(vals, (k + 1) * 3), Math.max(0, Math.min(1, u))); o.position.copy(a); }
}
root.updateMatrixWorld(true);
const s = j.scenes[0].extras.handSocket;
const hand = root.getObjectByName('hand_r');
const gun = new THREE.Object3D(); gun.quaternion.fromArray(s.quaternion); gun.position.fromArray(s.position); hand.add(gun); root.updateMatrixWorld(true);
const q = gun.getWorldQuaternion(new THREE.Quaternion()), p = gun.getWorldPosition(new THREE.Vector3());
const f = (v) => v.toArray().map((x) => x.toFixed(3)).join(',');
console.log(clipName, T, 'grip', f(p), 'muzzle dir', f(new THREE.Vector3(0, 0, -1).applyQuaternion(q)), 'gun up', f(new THREE.Vector3(0, 1, 0).applyQuaternion(q)), 'gun right', f(new THREE.Vector3(1, 0, 0).applyQuaternion(q)));
console.log('hand_l', f(root.getObjectByName('hand_l').getWorldPosition(new THREE.Vector3())), 'hand_r', f(hand.getWorldPosition(new THREE.Vector3())));
