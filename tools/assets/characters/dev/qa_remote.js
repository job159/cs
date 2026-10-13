// In-game QA for the teammate model (eval body for tools/shot.mjs --eval). Parameters come from the URL hash:
//   index.html?zombies=0#clip=idle_rifle,run_rifle&t=0.3&w=akm&n=2&cy=30&cd=3&ch=1.1&sp=1.4&play=1&ryaw=180&bots=0
// n remotes side by side (clip i % clips), weapon w, clip time t (s) (play=1 keeps animating for --shots),
// camera: yaw cy (deg, 0 = in front), distance cd, target height ch, cam height offset cp; ryaw = model facing.
// wait for the game (boot is slow when the machine is loaded)
for (let i = 0; i < 900 && !(window.__cf?.game?.player && window.__cf.game.debug); i++) await new Promise((res) => setTimeout(res, 500));
const q = new URLSearchParams(location.hash.slice(1));
const num = (k, d) => (q.has(k) ? +q.get(k) : d);
const g = __cf.game;
__cf.stop();
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const hide = () => {
  if (g.vm) g.vm.visible = false;
  document.querySelectorAll('#hud, .fe-lockhint, #fe, .nametag').forEach((e) => { e.style.display = 'none'; });
};
hide();
const n = num('n', 1);
const clips = (q.get('clip') || 'idle_rifle').split(',');
const weapon = q.get('w') || 'akm';
const base = g.player.pos.clone();
const ryaw = num('ryaw', 180) * Math.PI / 180;
const sp = num('sp', 1.3);
const rs = [];
for (let k = 0; k < n; k++) rs.push(g.debug.spawnRemote({ name: 'QA' + k, slot: k + 1 }));
for (let i = 0; i < 200 && rs.some((r) => !r.mixer); i++) await wait(100);
rs.forEach((r, k) => {
  const x = base.x + (k - (n - 1) / 2) * sp, z = base.z - num('dz', 4);
  r.pos.set(x, base.y, z);
  r.buf = [];
  r.push({ x, y: base.y, z, yaw: ryaw, pitch: 0, weapon, alive: true }, 0);
  r.setWeapon(weapon);
});
await Promise.all(rs.map((r) => r.ready));
for (let i = 0; i < 100 && rs.some((r) => !r.gun); i++) await wait(100);
const T = num('t', 0);
const actions = rs.map((r, k) => r.debugPose(clips[k % clips.length], T));
if (q.get('play') === '1') rs.forEach((r) => { if (r.layered) r.lower.action.timeScale = r.upper.action.timeScale = 1; });
const target = new THREE_V(base.x, base.y + num('ch', 1.1), base.z - num('dz', 4));
function THREE_V(x, y, z) { return g.camera.position.clone().set(x, y, z); }
const cy = num('cy', 0) * Math.PI / 180, cd = num('cd', 3.2);
const frame = (dt) => {
  g.frame(1 / 60);
  hide();
  rs.forEach((r) => { r.update(0, 0); if (dt) r.mixer.update(dt); });
  g.camera.position.set(target.x + Math.sin(cy) * cd, target.y + num('cp', 0.25), target.z + Math.cos(cy) * cd);
  g.camera.lookAt(target);
  g.camera.updateMatrixWorld();
  g.render();
};
for (let i = 0; i < 3; i++) frame(0);
if (q.get('play') === '1') setInterval(() => frame(1 / 30), 33);
const info = rs.map((r) => ({ gun: !!r.gun, clips: Object.keys(r.upper?.acts || r.actions).join(','), sock: JSON.stringify(r.model.userData.handSocket || null).slice(0, 80) }));
return { info, actions: actions.map((a) => a && a.getClip().name) };
