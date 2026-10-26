// 睚眥．裂魂 third-person model (teammates' hands, def.tpModel): the sabre alone from yazi.mjs -- the scabbard (posed in
// the left hand in first person only) and the rest-hidden edge light are left out; plain melee grip. A real LOD: built
// without the sub-millimetre domes (ray-skin field, bead lines, granulation; yazi({ lod })), then every part decimated
// (QEM, absolute error in mm): frets, wires and fine relief collapse, the silhouette and the material zoning stay.
import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { merge } from '../lib/gunkit.mjs';
import yazi from './yazi.mjs';

await MeshoptSimplifier.ready;

function decimate(list, err, ratio) {
  const g0 = merge(list.map((g) => { const c = (g.index ? g.toNonIndexed() : g).clone(); for (const k of Object.keys(c.attributes)) if (k !== 'position') c.deleteAttribute(k); return c; }));
  const g = mergeVertices(g0, 1e-3), pos = g.attributes.position.array, idx = Uint32Array.from(g.index.array);
  const [I] = MeshoptSimplifier.simplify(idx, pos, 3, Math.max(3, Math.floor(idx.length * ratio / 3) * 3), err, ['ErrorAbsolute']);
  const P = new Float32Array(I.length * 3);
  for (let i = 0; i < I.length; i++) for (let c = 0; c < 3; c++) P[i * 3 + c] = pos[I[i] * 3 + c];
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  return toCreasedNormals(out, 40 * Math.PI / 180);
}

export default async function build() {
  const g = await yazi({ lod: true });
  g.id = 'yazi_tp';
  for (const name of [...g.parts.keys()]) if (name.startsWith('L_') || name === 'R_fx_edge') g.parts.delete(name);
  for (const k of Object.keys(g.sockets)) if (/_l$/.test(k)) delete g.sockets[k];
  for (const part of g.parts.values()) for (const [mat, list] of part.geos) {
    if (!list.length) continue;
    // the head and the eyes are the focus even at a distance: a lighter hand there
    const head = /fx_(head|jaw|eyes)/.test(part.name);
    part.geos.set(mat, [decimate(list, head ? 0.18 : /^leather/.test(mat) ? 0.7 : 0.4, head ? 0.45 : 0.2)]);
  }
  g.meta({ grip: 'melee', support: 'none', notes: 'M02 睚眥．裂魂 third-person LOD: the sabre only (yazi.mjs R_* parts), micro detail dropped, decimated.' });
  return g;
}
