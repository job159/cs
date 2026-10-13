// Perf probe for package maps (tools/map/mapshots.mjs <id> --eval tools/map/perfprobe.js, page loaded with ?q=<quality>):
// per view the draw calls / triangles with and without the sun shadow pass (post-processing quads included, ~10) and
// the GPU-synced render time of the full frame (shadow map updated every frame like in game).
for (let i = 0; i < 600 && !(__cf.game && __cf.game.player && __cf.game.world && __cf.game.world.def); i++) await new Promise((r) => setTimeout(r, 500));
__cf.stop();
const g = __cf.game, R = __cf.renderer, gl = R.gl;
const ctx = gl.getContext();
const views = [
  ['deck_n', [0, 2.59, -3], 0, 0.03], ['deck_w', [-3, 2.59, 0], 1.5708, 0.02], ['deck_e', [3, 2.59, 0], -1.5708, 0.02], ['deck_s', [0, 2.59, 3], 3.1416, 0.02],
  ['deck_nw', [-2, 2.59, -2], 0.785, 0.0], ['deck_se', [2, 2.59, 2], -2.356, 0.0],
  ['north_back', [-4, 0, -54], 3.1416, 0.06], ['plaza_sw', [-12, 0.15, 12], -0.785, 0.0], ['plaza_ne', [12, 0.15, -12], 2.356, 0.0],
  ['west_end', [-50, 0, 0], -1.5708, 0.0], ['east_end', [50, 0, 0], 1.5708, 0.0], ['south_end', [0, 0, 56], 0, 0.0],
];
const quality = [R.qualityName];   // the quality the page was loaded with (?q=), so textures / shadow size match
const out = {};
const sync = () => { const px = new Uint8Array(4); ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px); };
for (const q of quality) {
  R.setQuality(q);
  R.fixedScale = true; R.scale = 1; R._applyScale?.();
  const rows = [];
  for (const [name, p, yaw, pitch] of views) {
    g.player.pos.set(p[0], p[1], p[2]); g.player.yaw = yaw; g.player.pitch = pitch;
    for (let i = 0; i < 3; i++) g.frame(1 / 60);
    g.player.pos.set(p[0], p[1], p[2]); g.player.yaw = yaw; g.player.pitch = pitch;
    g.frame(1 / 60);
    gl.shadowMap.autoUpdate = true;
    g.render(); sync();
    const all = { calls: gl.info.render.calls, tris: gl.info.render.triangles };
    // main pass only: freeze the shadow map
    gl.shadowMap.autoUpdate = false;
    g.render(); sync();
    const main = { calls: gl.info.render.calls, tris: gl.info.render.triangles };
    gl.shadowMap.autoUpdate = true;
    // timing (GPU synced), shadow map updating every frame like the game
    let t = performance.now();
    const N = 12;
    for (let i = 0; i < N; i++) { g.render(); sync(); }
    const ms = (performance.now() - t) / N;
    rows.push(`${name.padEnd(11)} all ${String(all.calls).padStart(4)} calls ${(all.tris / 1000).toFixed(0).padStart(5)}k | main ${String(main.calls).padStart(4)} calls ${(main.tris / 1000).toFixed(0).padStart(5)}k | ${ms.toFixed(1)} ms`);
  }
  out[q] = rows;
}
const mem = gl.info.memory;
// breakdown of the main pass in the last view: visible renderables by top-level group (map meshes, viewmodel, fx ...)
// (two-pass = transparent double-sided materials, which three draws as back + front)
const cam = g.camera;
const groups = {};
const m4 = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
const planesOk = (o) => {
  if (o.frustumCulled === false || !o.geometry) return true;
  if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
  const s = o.geometry.boundingSphere, c = s.center.clone().applyMatrix4(o.matrixWorld);
  const r = s.radius * o.matrixWorld.getMaxScaleOnAxis();
  const e = m4.elements;
  const P = [[e[3] + e[0], e[7] + e[4], e[11] + e[8], e[15] + e[12]], [e[3] - e[0], e[7] - e[4], e[11] - e[8], e[15] - e[12]], [e[3] + e[1], e[7] + e[5], e[11] + e[9], e[15] + e[13]], [e[3] - e[1], e[7] - e[5], e[11] - e[9], e[15] - e[13]], [e[3] + e[2], e[7] + e[6], e[11] + e[10], e[15] + e[14]], [e[3] - e[2], e[7] - e[6], e[11] - e[10], e[15] - e[14]]];
  for (const p of P) { const l = Math.hypot(p[0], p[1], p[2]); if ((p[0] * c.x + p[1] * c.y + p[2] * c.z + p[3]) / l < -r) return false; }
  return true;
};
g.scene.traverseVisible((o) => {
  if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
  if (!planesOk(o)) return;
  let top = o; while (top.parent && top.parent !== g.scene) top = top.parent;
  let key = top.name || top.type;
  if (key === 'world') { let t = o; while (t.parent && t.parent.name !== 'world') t = t.parent; key = 'world/' + (t.name || t.type); }
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  const two = mats.filter((m) => m && m.transparent && m.side === 2 && !m.forceSinglePass).length;
  const gr = groups[key] || (groups[key] = { n: 0, twoPass: 0 });
  gr.n += mats.length; gr.twoPass += two;
});
return JSON.stringify({ out, mem, programs: gl.info.programs?.length, size: [R.fullW, R.fullH, R.dpr], lastViewGroups: groups }, null, 1);
