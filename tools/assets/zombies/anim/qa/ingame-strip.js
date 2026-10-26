// In-game motion strips for animation QA: an eval script for tools/shot.mjs on the game page, e.g.
//   node tools/shot.mjs "http://127.0.0.1:5190/?map=losttown&match=0&zt=crawler&runs=front:5,side:5:3&N=7"
//     --eval tools/assets/zombies/anim/qa/ingame-strip.js --out captures/anim/x.png --w 1680 --h 700
// Each run spawns ?zt (crawler) S m ahead of the player's spawn, lets the host AI run it at the player and films it
// with a free camera D m away: one row of ?N tiles every `every` frames (1/60 s), cropped ?span m around it, labelled
// with the playing clip, its time and rate. ?runs=mode:D[:every[:S]],... modes:
//   front (camera between it and the player) | side (tracking profile shot; ?sd=-1 the other side) |
//   pounce / pouncef (forced pounce, side / front view) | attack / attackf (spawned 3 m out) |
//   death (killed after ?pre frames) | still (walk speed 0: the idle switch)
// ?loco=<clip> forces its locomotion clip, ?ws=<m/s> its walk speed, ?hb=1 overlays the hitbox capsules (red head,
// blue limbs, yellow body). Free roam (?match=0) recommended; the player takes no damage.
__cf.stop();
for (const e of document.querySelectorAll('.fe-lockhint,#hud,#ui')) e.style.display = 'none';
const g = __cf.game;
const q = new URLSearchParams(location.search);
const type = q.get('zt') || 'crawler', N = +(q.get('N') || 8), span = +(q.get('span') || 2.2);
const runs = (q.get('runs') || 'front:15').split(',').map((r) => r.split(':'));
const Z = g.zombies;
if (g.match) { g.match.state = 'round'; g.match.round = 1; g.match.queue = []; g.match.spawnT = 1e9; }
g.damagePlayer = () => {};
const V = g.player.pos.constructor;
const p = g.player.pos, p0 = p.clone(), yawP = g.player.yaw;
const fx = -Math.sin(yawP), fz = -Math.cos(yawP);
const W = innerWidth, H = innerHeight;
const out = document.createElement('canvas');
out.width = W; out.height = H;
out.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99;background:#000';
const ctx = out.getContext('2d');
const canvas = __cf.renderer.canvas || document.querySelector('canvas');
const info = [];
const cols = N, rows = runs.length;
const tw = Math.floor(W / cols), th = Math.floor(H / rows);
const cam = g.camera;
for (const [row, [mode, Ds, ev, Ss]] of runs.entries()) {
  const D = +Ds, every = +(ev || q.get('every') || 4);
  const S = +(Ss || (mode.startsWith('attack') ? 3 : mode.startsWith('pounce') ? 14 : mode === 'still' ? 9 : 22));
  for (const o of [...Z.list]) { o.alive = false; o.root.parent?.remove(o.root); }
  Z.list.length = 0; Z.alive = 0;
  p.copy(p0); g.player.yaw = yawP;
  const z = Z.spawn(type, new V(p0.x + fx * S, p0.y, p0.z + fz * S), {});
  z.yaw = Math.atan2(-fx, -fz); z.root.rotation.y = z.yaw;
  z.specialCd = 99;
  if (q.get('loco')) { z.locoClip = z.runClip = q.get('loco'); z.running = false; z.action = null; z.setLoco(false); }
  if (q.get('ws')) z.walkSpeed = +q.get('ws');
  if (mode === 'still') { z.running = false; z.walkSpeed = 0; }
  const shoot = () => {
    // free camera: in front of it (towards the player) or beside its path, eye height above its ground
    const side = !/front|still|pouncef|attackf/.test(mode);
    const sd = +(q.get('sd') || 1);
    const ox = side ? -fz * sd : -fx, oz = side ? fx * sd : -fz;
    cam.position.set(z.pos.x + ox * D, z.pos.y + 1.6, z.pos.z + oz * D);
    cam.lookAt(z.center());
    cam.updateMatrixWorld();
  };
  for (let i = 0; i < 4; i++) __cf.step(1, 1 / 60);
  // pounce / attack: run the AI until the move starts (the strip begins on its first frame)
  for (let i = 0; i < 400 && ((mode.startsWith('pounce') && z.state !== 'special') || (mode.startsWith('attack') && z.state !== 'attack')); i++) {
    if (mode.startsWith('pounce') && z.state === 'chase') z.specialCd = 0;
    g.frame(1 / 60);
  }
  const pre = +(q.get('pre') || 6);
  let killed = false;
  for (let k = 0; k < N; k++) {
    for (let i = 0; i < (k ? every : 1); i++) {
      if (mode.startsWith('pounce') && z.state === 'chase') z.specialCd = 0;
      g.frame(1 / 60);
      if (mode === 'death' && !killed && k * every + i >= pre) { killed = true; z.damage({ amount: 1e6, part: 'chest', dir: new V(fx, 0, fz), knock: 0.5 }); }
    }
    shoot();
    g.renderer.render(g.scene, cam, g.time);
    const c = z.center().project(cam);
    const dist = cam.position.distanceTo(z.center());
    const sh = (span / dist) * (H / 2) / Math.tan((cam.fov * Math.PI) / 360), sw = sh * (tw / th);
    const sc = canvas.width / W;
    const cx = (c.x * 0.5 + 0.5) * W, cy = (-c.y * 0.5 + 0.5) * H;
    const tx = k * tw, ty = row * th;
    ctx.drawImage(canvas, (cx - sw) * sc, (cy - sh) * sc, 2 * sw * sc, 2 * sh * sc, tx, ty, tw, th);
    if (q.get('hb') === '1') {
      z.updateHitboxes();
      ctx.save();
      ctx.beginPath(); ctx.rect(tx, ty, tw, th); ctx.clip();
      const map = (v) => { const s = v.clone().project(cam); return [tx + (((s.x * 0.5 + 0.5) * W - (cx - sw)) / (2 * sw)) * tw, ty + (((-s.y * 0.5 + 0.5) * H - (cy - sh)) / (2 * sh)) * th]; };
      for (const h of z.hitboxes) {
        const [x0, y0] = map(h.p0), [x1, y1] = map(h.p1);
        const rpx = (h.r / dist) * (H / 2) / Math.tan((cam.fov * Math.PI) / 360) * (th / (2 * sh));
        ctx.strokeStyle = h.part === 'head' ? '#ff3c3c' : h.part === 'limb' ? '#50c8ff' : '#ffdc50';
        ctx.lineWidth = Math.max(1, 2 * rpx); ctx.lineCap = 'round'; ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.restore();
    }
    const an = z.action?.getClip()?.name || '-';
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(tx, ty, Math.min(tw, 260), 16);
    ctx.fillStyle = '#fff'; ctx.font = '11px monospace';
    ctx.fillText(`${an} ${(z.action?.time ?? 0).toFixed(2)} x${(z.action?.timeScale ?? 0).toFixed(2)} ${dist.toFixed(0)}m`, tx + 3, ty + 12);
    info.push(`${mode}:${an}@${(z.action?.time ?? 0).toFixed(2)}x${(z.action?.timeScale ?? 0).toFixed(2)} y=${(z.pos.y - (z.groundY ?? 0)).toFixed(2)} st=${z.state}`);
  }
}
document.body.appendChild(out);
return JSON.stringify({ type, frames: info });
