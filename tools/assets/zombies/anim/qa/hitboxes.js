// Hitbox / dismemberment QA on posed clips: an eval script for tools/shot.mjs on the game page, e.g.
//   node tools/shot.mjs "http://127.0.0.1:5190/?map=test&match=0&zt=crawler&clips=crawl_quad,pounce"
//     --eval tools/assets/zombies/anim/qa/hitboxes.js --out captures/anim/hb.png --w 800 --h 450
// For 5 phases of each clip, rays from 5 m (front, side, 45 deg, back; 1.2 m above the aim point) at 10 body points:
// how many hit the zombie and how many hit the intended box (the rest: a nearer capsule in the way). Then severs an
// arm and a leg mid-gallop and kills it with a headshot, checking the death clip and that every bone stays finite.
__cf.stop();
const g = __cf.game, Z = g.zombies;
const q = new URLSearchParams(location.search);
const type = q.get('zt') || 'crawler';
const clips = (q.get('clips') || 'crawl_quad,crawl_quad_attack,pounce,death_quad,idle_quad').split(',');
if (g.match) { g.match.state = 'round'; g.match.queue = []; g.match.spawnT = 1e9; }
g.damagePlayer = () => {};
for (const o of [...Z.list]) { o.alive = false; o.root.parent?.remove(o.root); }
Z.list.length = 0;
const V = g.player.pos.constructor;
const z = Z.spawn(type, new V(0, 0, 0), { puppet: true });
z.pos.set(0, 0, 0); z.yaw = 0; z.root.rotation.y = 0;
const targets = {
  head: ['head', null, 0.4], chest: ['spine_03', null, 0], pelvis: ['pelvis', null, 0], spine: ['spine_01', null, 0],
  hand_r: ['hand_r', 'middle_01_r', 0.5], hand_l: ['hand_l', 'middle_01_l', 0.5], lowerarm_l: ['lowerarm_l', 'hand_l', 0.5], upperarm_r: ['upperarm_r', 'lowerarm_r', 0.5],
  thigh_l: ['thigh_l', 'calf_l', 0.5], calf_r: ['calf_r', 'foot_r', 0.5],
};
const pose = (name, t) => {
  z.mixer.stopAllAction();
  const a = z.actions[name];
  a.reset(); a.setEffectiveWeight(1); a.play();
  a.time = t; z.mixer.update(0);
  if (z.poseQ) for (const [b, qq] of z.poseQ) b.quaternion.multiply(qq);
  z.root.updateMatrixWorld(true);
  z.updateHitboxes(); z.hbFrame = Z.frame;
};
const res = {};
const views = [[0, 5], [Math.PI / 2, 5], [Math.PI / 4, 5], [Math.PI, 5]];
const a = new V(), b = new V();
for (const name of clips) {
  if (!z.actions[name]) { res[name] = 'missing'; continue; }
  const dur = z.actions[name].getClip().duration;
  let hit = 0, exact = 0, n = 0;
  const miss = {};
  for (const u of [0.05, 0.3, 0.5, 0.7, 0.95]) {
    pose(name, u * dur);
    for (const [box, [b0, b1, w]] of Object.entries(targets)) {
      z.bones[b0].getWorldPosition(a);
      if (b1) { z.bones[b1].getWorldPosition(b); a.lerp(b, w); } else if (w) a.y += 0.0;
      for (const [ang, d] of views) {
        const o = new V(a.x + Math.sin(ang) * d, a.y + 1.2, a.z + Math.cos(ang) * d);
        const dir = a.clone().sub(o).normalize();
        const r = Z.raycast(o, dir, 20);
        n++;
        const h = r.find((x) => x.target.zombie === z);
        if (h) { hit++; if (h.box === box) exact++; else miss[box] = (miss[box] || 0) + 1; } else miss[box + '!'] = (miss[box + '!'] || 0) + 1;
      }
    }
  }
  res[name] = `${hit}/${n} hit, ${exact} exact; off: ${JSON.stringify(miss)}`;
}
// dismemberment mid-gallop: sever an arm, a leg and the head, keep animating, check every bone stays finite
z.puppet = false;
z.mixer.stopAllAction();
const loco = z.actions[z.locoClip]; loco.reset(); loco.play(); z.action = loco; z.loco = loco;
const dir = new V(0, 0, -1);
for (const box of ['lowerarm_r', 'calf_l']) { z.limbDamage[box] = 1e9; z.damage({ amount: z.maxHp * 0.46, part: 'limb', box, dir, pellets: 1 }); z.hp = z.maxHp; }
const severed = [...z.severed];
for (let i = 0; i < 30; i++) { z.mixer.update(1 / 30); z.root.updateMatrixWorld(true); }
let finite = true;
z.root.traverse((o) => { if (o.isBone && !o.matrixWorld.elements.every(Number.isFinite)) finite = false; });
z.damage({ amount: 1e6, part: 'head', box: 'head', dir, headshot: true });
for (let i = 0; i < 45; i++) { z.mixer.update(1 / 30); z.root.updateMatrixWorld(true); }
z.root.traverse((o) => { if (o.isBone && !o.matrixWorld.elements.every(Number.isFinite)) finite = false; });
res.sever = { severed, afterHeadshot: [...z.severed], headless: !!z.headless, deathClip: z.action?.getClip().name, deathT: +z.action?.time.toFixed(2), finite };
return JSON.stringify(res);
