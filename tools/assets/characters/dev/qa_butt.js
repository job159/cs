// In-game QA (eval body for tools/shot.mjs --eval): the reviewer's stock test on a live RemotePlayer. For each clip x
// weapon x time, every vertex of the weapon's stock (weapon space z > 0.18 behind S_grip_r) is ray-cast along the
// teammate's facing through the skinned soldier meshes (vertices skinned with SkinnedMesh.getVertexPosition); a point
// is inside when the first hits forward and backward are both back faces, the forward distance is the penetration.
//   index.html?zombies=0&match=0#clips=idle_rifle,walk_rifle&w=akm,m4&ts=0,0.3,0.6,0.9
// wait for the game (boot is slow when the machine is loaded)
for (let i = 0; i < 900 && !(window.__cf?.game?.player && window.__cf.game.debug); i++) await new Promise((res) => setTimeout(res, 500));
const q = new URLSearchParams(location.hash.slice(1));
const g = __cf.game;
__cf.stop();
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const V = g.camera.position.constructor, M4 = g.camera.matrixWorld.constructor;
const clips = (q.get('clips') || 'idle_rifle,walk_rifle,run_rifle,crouch_idle,crouch_walk,aim_rifle,fire_rifle').split(',');
const weapons = (q.get('w') || 'akm,m4').split(',');
const ts = (q.get('ts') || '0,0.3,0.6,0.9').split(',').map(Number);
const r = g.debug.spawnRemote({ name: 'QA', slot: 1 });
await r.ready;
const base = g.player.pos.clone();
r.pos.set(base.x, base.y, base.z - 5);
r.buf = []; r.yaw = 0;
// skinned triangles of the LOD0 meshes (world space) for the current pose
const skinTris = () => {
  const T = []; skinTris.names = [];
  const v = new V();
  for (const m of r.lod0) {
    if (/eyes|eyebrows/.test(m.name)) continue;
    const pos = m.geometry.attributes.position, idx = m.geometry.index;
    const W = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); W[i * 3] = v.x; W[i * 3 + 1] = v.y; W[i * 3 + 2] = v.z; }
    for (let k = 0; k < idx.count; k++) { T.push(W[idx.getX(k) * 3], W[idx.getX(k) * 3 + 1], W[idx.getX(k) * 3 + 2]); if (k % 3 === 0) skinTris.names.push(m.name); }
  }
  return Float32Array.from(T);
};
// first hit along d: [distance, back face?] (Moller-Trumbore, both sides)
const first = (T, o, d, far) => {
  let best = far, back = false, bt = -1;
  for (let t = 0; t < T.length; t += 9) {
    const e1x = T[t + 3] - T[t], e1y = T[t + 4] - T[t + 1], e1z = T[t + 5] - T[t + 2];
    const e2x = T[t + 6] - T[t], e2y = T[t + 7] - T[t + 1], e2z = T[t + 8] - T[t + 2];
    const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det, tx = o.x - T[t], ty = o.y - T[t + 1], tz = o.z - T[t + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const w = (d.x * qx + d.y * qy + d.z * qz) * inv;
    if (w < 0 || u + w > 1) continue;
    const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (dist > 1e-5 && dist < best) { best = dist; back = det < 0; bt = t / 9; } // det < 0: the ray meets the back of the face
  }
  return best < far ? [best, back, bt] : null;
};
const out = [];
for (const w of weapons) {
  r.weaponId = null;
  await r.setWeapon(w);
  for (let i = 0; i < 100 && !r.gun; i++) await wait(50);
  const grip = r.gun.getObjectByName('S_grip_r').position;
  const pts = [];
  r.gun.updateMatrixWorld(true);
  const inv = new M4().copy(r.gun.matrixWorld).invert();
  r.gun.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, v = new V();
    const toGun = new M4().multiplyMatrices(inv, o.matrixWorld);
    for (let k = 0; k < pos.count; k += 2) { v.fromBufferAttribute(pos, k).applyMatrix4(toGun); if (v.z - grip.z > 0.18) pts.push(v.clone()); }
  });
  for (const c of clips) for (const t of ts) {
    r.debugPose(c, t);
    r.update(0, 0);
    r.root.updateMatrixWorld(true);
    const T = skinTris();
    const fwd = new V(0, 0, -1), bwd = new V(0, 0, 1); // yaw 0: the teammate faces -Z
    let worst = 0, wm = '', wpnt = null;
    for (const p of pts) {
      const wp = p.clone().applyMatrix4(r.gun.matrixWorld);
      const h = first(T, wp, fwd, 0.6);
      if (!h || !h[1]) continue;
      const b = first(T, wp, bwd, 0.6);
      if (b && b[1] && h[0] > worst) { worst = h[0]; wm = skinTris.names[h[2]] + '/' + skinTris.names[b[2]]; wpnt = p.toArray().map((x) => +x.toFixed(3)); }
    }
    out.push(`${w} ${c} t=${t}: ${(worst * 100).toFixed(1)} cm (${pts.length} stock points) ${wm} ${wpnt || ''}`);
  }
}
return out.join('\n');
