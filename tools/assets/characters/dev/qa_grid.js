// In-game QA sheet for the teammate model (eval body for tools/shot.mjs --eval): one RemotePlayer with a weapon,
// several (clip, time, camera) views rendered into a grid with labels. URL hash parameters:
//   index.html?zombies=0&match=0#w=akm&cols=3&views=idle_rifle:0.2:30:2.4:1.1;fire_rifle:0:-60:2:1.4;...
// view = clip : time (s) : camera yaw (deg, 0 = in front of the model) : distance (m) : target height (m) [: cam height]
const q = new URLSearchParams(location.hash.slice(1));
const g = __cf.game;
__cf.stop();
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const hide = () => {
  if (g.vm) g.vm.visible = false;
  document.querySelectorAll('#hud, .fe-lockhint, #fe, .nametag').forEach((e) => { e.style.display = 'none'; });
};
hide();
const weapon = q.get('w') || 'akm';
const base = g.player.pos.clone();
const r = g.debug.spawnRemote({ name: 'QA', slot: 1 });
await r.ready;
const pos = { x: base.x, y: base.y, z: base.z - 4 };
r.pos.set(pos.x, pos.y, pos.z);
r.buf = [];
r.push({ ...pos, yaw: Math.PI, pitch: 0, weapon, alive: true }, 0);
r.setWeapon(weapon);
for (let i = 0; i < 100 && !r.gun; i++) await wait(100);
const views = (q.get('views') || 'idle_rifle:0:30:2.6:1.1').split(';').map((v) => { const a = v.split(':'); return { clip: a[0], t: +a[1], cy: +a[2], cd: +a[3], ch: +a[4], cp: a[5] !== undefined && a[5] !== '' ? +a[5] : 0.15, bone: a[6] }; });
const cols = +(q.get('cols') || Math.min(3, views.length)), rows = Math.ceil(views.length / cols);
const W = innerWidth, H = innerHeight;
const out = document.createElement('canvas');
out.width = W; out.height = H;
out.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:50;background:#000';
document.body.appendChild(out);
const ctx = out.getContext('2d');
const canvas = g.renderer.canvas || document.querySelector('canvas');
const cw = W / cols, chh = H / rows;
const cam = g.camera;
const res = [];
for (let k = 0; k < views.length; k++) {
  const v = views[k];
  const a = r.debugPose(v.clip, v.t);
  g.frame(1 / 60);
  hide();
  r.update(0, 0);
  // root yaw = PI + PI: model faces +Z (towards the default camera side)
  let tx = pos.x, ty = pos.y + v.ch, tz = pos.z;
  if (v.bone) { const b = r.model.getObjectByName(v.bone); r.root.updateMatrixWorld(true); const w = b.getWorldPosition(cam.position.clone()); tx = w.x; ty = w.y + (v.ch || 0); tz = w.z; }
  const yaw = v.cy * Math.PI / 180;
  cam.position.set(tx + Math.sin(yaw) * v.cd, ty + v.cp, tz + Math.cos(yaw) * v.cd);
  cam.lookAt(tx, ty, tz);
  cam.updateMatrixWorld();
  g.render();
  // centre crop of the rendered frame with the cell's aspect
  const CW = canvas.width, CH = canvas.height, asp = cw / chh;
  let sw = CH * asp, sh = CH;
  if (sw > CW) { sw = CW; sh = CW / asp; }
  ctx.drawImage(canvas, (CW - sw) / 2, (CH - sh) / 2, sw, sh, (k % cols) * cw, Math.floor(k / cols) * chh, cw, chh);
  ctx.font = 'bold 15px monospace'; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect((k % cols) * cw, Math.floor(k / cols) * chh, 300, 22);
  ctx.fillStyle = '#ffd27a'; ctx.fillText(`${v.clip} t=${v.t} yaw=${v.cy}`, (k % cols) * cw + 6, Math.floor(k / cols) * chh + 16);
  res.push(a ? a.getClip().duration.toFixed(2) : 'missing');
}
return { gun: !!r.gun, views: res };
