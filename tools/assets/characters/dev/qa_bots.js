// In-game QA: AI teammates (BotSquad -> RemotePlayer with soldier.glb) fighting a few zombies. Eval body for
// tools/shot.mjs. Hash params: bots (n), z (zombies), steps (frames of 1/60 s simulated before the shot),
// cy / cd / ch (camera yaw deg around the squad centre, distance, height), walk=1 (the leader walks forward).
const q = new URLSearchParams(location.hash.slice(1));
const num = (k, d) => (q.has(k) ? +q.get(k) : d);
const g = __cf.game;
__cf.stop();
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const hide = () => {
  if (g.vm) g.vm.visible = false;
  document.querySelectorAll('#hud, .fe-lockhint, #fe').forEach((e) => { e.style.display = 'none'; });
};
hide();
const bots = g.debug.addBots(num('bots', 3));
await wait(300);
const views = bots.bots ? bots.bots.map((b) => b.view) : [];
for (let i = 0; i < 100 && views.some((v) => !v.mixer || !v.gun); i++) await wait(100);
await Promise.all(views.map((v) => v.ready));
const p = g.player.pos.clone();
const nz = num('z', 4);
for (let i = 0; i < nz; i++) {
  const a = -0.6 + (i / Math.max(1, nz - 1)) * 1.2;
  g.zombies.spawn(q.get('zt') || 'walker', { x: p.x + Math.sin(a) * 16, y: p.y, z: p.z - Math.cos(a) * 16 });
}
const steps = num('steps', 120);
for (let i = 0; i < steps; i++) { g.frame(1 / 60); hide(); }
// camera: orbit the squad centre
const c = views.reduce((acc, v) => acc.add(v.pos), p.clone()).multiplyScalar(1 / (views.length + 1));
const cy = num('cy', 160) * Math.PI / 180, cd = num('cd', 6), ch = num('ch', 1.6);
g.camera.position.set(c.x + Math.sin(cy) * cd, c.y + ch, c.z + Math.cos(cy) * cd);
g.camera.lookAt(c.x, c.y + 0.9, c.z);
g.camera.updateMatrixWorld();
g.render();
return views.map((v) => ({ gun: !!v.gun, pos: v.pos.toArray().map((x) => +x.toFixed(2)), lo: v.lower?.cur, up: v.upper?.cur, ts: +(v.lower?.action?.timeScale ?? 0).toFixed(2), speed: +v.speed.toFixed(2), downed: v.downed, far: v.isFar }));
