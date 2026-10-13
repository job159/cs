// In-game QA of the teammate clip state machine (eval body for tools/shot.mjs --eval): one RemotePlayer per scenario,
// driven through RemotePlayer.update() the way a bot drives it (moveSpeed, flags, fired()), simulated for `sim`
// seconds at 60 Hz, then a labelled grid of views (one cell per scenario, camera on that teammate).
//   index.html?zombies=0&match=0#s=idle,walk,run,crouch,crouchwalk,fire,reload,downed,revive,dead,pfire,preload
//     &w=akm&wp=glock&sim=1.6&cols=4&cy=35&cd=3.2&ch=1.0&pitch=0
// scenarios: idle walk run crouch crouchwalk fire reload downed revive dead aim, combined with '+' (crouch+fire,
// run+aim, crouchwalk+reload); a 'p' token (p+fire) holds the pistol wp instead of w.
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
const S = (q.get('s') || 'idle,walk,run,crouch,crouchwalk,fire,reload,downed,revive,dead,pfire,preload').split(',');
const w = q.get('w') || 'akm', wp = q.get('wp') || 'glock';
const base = g.player.pos.clone();
const rs = S.map((s, k) => g.debug.spawnRemote({ name: s, slot: k % 4 }));
await Promise.all(rs.map((r) => r.ready));
await Promise.all(rs.map((r) => r.lodReady));
rs.forEach((r, k) => {
  r.pos.set(base.x + (k - (S.length - 1) / 2) * 3, base.y, base.z - 6);
  r.buf = [];
  r.yaw = 0;
  r.setWeapon(S[k].split(/[+ ]/).includes('p') ? wp : w);
});
for (let i = 0; i < 100 && rs.some((r) => !r.gun); i++) await wait(100);
const T = num('sim', 1.6), dt = 1 / 60;
const pitch = num('pitch', 0) * Math.PI / 180;
for (let f = 0; f < T / dt; f++) {
  const t = f * dt;
  rs.forEach((r, k) => {
    const tk = new Set(S[k].split(/[+ ]/));
    r.moveSpeed = tk.has('walk') ? 1.3 : tk.has('run') ? 5.0 : tk.has('crouchwalk') ? 1.0 : 0;
    r.crouch = tk.has('crouch') || tk.has('crouchwalk');
    r.reloading = tk.has('reload') && t > 0.2;
    r.reviving = tk.has('revive');
    r.downed = tk.has('downed') || (tk.has('dead') && t < 0.4);
    r.alive = !(tk.has('dead') && t >= 0.4);
    r.aiming = tk.has('aim');
    r.pitch = tk.has('fire') || tk.has('aim') ? pitch : 0;
    if (tk.has('fire') && f % 6 === 0) r.fired(r.weaponId, null);
    r.update(dt, 0);
  });
  if (f % 30 === 0) { g.frame(1 / 60); hide(); }
}
const cols = num('cols', 4), rows = Math.ceil(S.length / cols);
const W = innerWidth, H = innerHeight;
const out = document.createElement('canvas');
out.width = W; out.height = H;
out.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:50;background:#000';
document.body.appendChild(out);
const ctx = out.getContext('2d');
const canvas = g.renderer.canvas || document.querySelector('canvas');
const cw = W / cols, chh = H / rows, cam = g.camera;
const info = [];
for (let k = 0; k < S.length; k++) {
  const r = rs[k];
  const lowBody = /downed|dead|revive/.test(S[k]);
  const yawK = num('cy', 35);
  const cy = yawK * Math.PI / 180, cd = num('cd', lowBody ? 3.0 : 2.4), ch = num('ch', lowBody ? 0.4 : S[k].includes('crouch') ? 0.7 : 1.0);
  // models face +Z in model space; root yaw = yaw + PI, so with yaw 0 the teammate faces -Z (away from +Z cameras)
  cam.position.set(r.pos.x - Math.sin(cy) * cd, r.pos.y + ch + 0.25, r.pos.z - Math.cos(cy) * cd);
  cam.lookAt(r.pos.x, r.pos.y + ch, r.pos.z);
  cam.updateMatrixWorld();
  r.update(0, 0); // LOD for this camera
  g.render();
  const CW = canvas.width, CH = canvas.height, asp = cw / chh;
  let sw = CH * asp, sh = CH;
  if (sw > CW) { sw = CW; sh = CW / asp; }
  ctx.drawImage(canvas, (CW - sw) / 2, (CH - sh) / 2, sw, sh, (k % cols) * cw, Math.floor(k / cols) * chh, cw, chh);
  const label = `${S[k]}: ${r.lower?.cur}/${r.upper?.cur}`;
  ctx.font = 'bold 14px monospace'; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect((k % cols) * cw, Math.floor(k / cols) * chh, Math.min(cw, 9 * label.length + 12), 22);
  ctx.fillStyle = '#ffd27a'; ctx.fillText(label, (k % cols) * cw + 6, Math.floor(k / cols) * chh + 16);
  // muzzle direction relative to where the teammate looks (yaw 0 = straight ahead, pitch + = up)
  let aim = null;
  const mz = r.gun?.getObjectByName('S_muzzle');
  if (mz) {
    r.root.updateMatrixWorld(true);
    const d = mz.getWorldDirection(cam.position.clone()).negate(); // Object3D.getWorldDirection is +Z; the muzzle is -Z
    const fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw);
    aim = [+(Math.atan2(d.x * fz - d.z * fx, d.x * fx + d.z * fz) * -180 / Math.PI).toFixed(1), +(Math.asin(d.y) * 180 / Math.PI).toFixed(1)];
  }
  info.push({ aim, s: S[k], lo: r.lower?.cur, up: r.upper?.cur, ts: +(r.lower?.action?.timeScale ?? 0).toFixed(2), uts: +(r.upper?.action?.timeScale ?? 0).toFixed(2), gunDropped: r.gunDropped, far: r.isFar, lod1: r.lod1?.length });
}
return info;
