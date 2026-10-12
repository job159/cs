// Signature mechanics for premium weapons (the five original "Anti-Calamity" series from
// docs/research/03-weapons-feel.md §5.3). A weapon def opts in with `special: { type, ...params }`.
// The arsenal calls these hooks; each returns modifiers or performs its own effects:
//   init(ws)                         per-weapon state on ws.sp
//   modifiers(ws) -> { rpmMul, dmgMul, infinite, split, tracer, flash, pierce, knockMul }
//   onFire(ws, ctx)                  after a shot (ctx: { game, origin, dir, muzzle })
//   onHit(ws, info, res, target)     every damaging hit
//   onSpecial(ws, game)              special button (Q / touch star)
//   onAlt(ws, game, pressed)         alt button when the weapon uses it (returns true if consumed)
//   onReloadInput(ws, game) -> true  reload pressed during a reload (active reload)
//   update(ws, dt, game)
//   meter(ws) -> { value 0..1, ready, label, color }  for the HUD
import * as THREE from 'three';
import { splash } from './ballistics.js';
import { haptic } from './arsenal.js';

const _v = new THREE.Vector3();

export const SPECIALS = {
  // ------------------------------------------------------------------ 雙相 DUALPHASE
  overphase: {
    init(ws) { ws.sp = { charge: 0, active: 0, stored: 0 }; },
    modifiers(ws) {
      const s = ws.sp, p = ws.def.special;
      return s.active > 0 ? { rpmMul: p.rpmMul ?? 1.3, infinite: true, split: p.split ?? 1, tracer: p.tracer ?? [3, 8, 9, 1], flash: 'energy', dmgMul: p.dmgMul ?? 1.15 } : {};
    },
    onHit(ws, info) {
      const s = ws.sp, p = ws.def.special;
      if (s.active > 0) return;
      s.charge = Math.min(p.hits, s.charge + (info.headshot ? 2 : 1));
      if (s.charge >= p.hits && !s.readyNotified) { s.readyNotified = true; ws.game?.audio?.play('special_ready'); haptic(25); }
    },
    onSpecial(ws, g) {
      const s = ws.sp, p = ws.def.special;
      if (s.active > 0 || s.charge < p.hits) return;
      s.active = p.duration ?? 14; s.charge = 0; s.readyNotified = false;
      g.audio?.play('special_activate');
      g.hud?.toast(`${ws.def.zh}　過相啟動`, 1600);
      g.vm.play({ tracks: { gunRot: [[0, [0, 0, 0]], [0.4, [-8, 0, 18]], [1, [0, 0, 0]]], 'fx_ring.rot': [[0, [0, 0, 0]], [1, [0, 0, 720]]] }, events: [] }, { duration: 0.6 });
      g.renderer.post.aberration = 0.25;
      setTimeout(() => { g.renderer.post.aberration = 0; }, 220);
    },
    update(ws, dt, g) {
      const s = ws.sp;
      if (s.active > 0) { s.active -= dt; ws.ammo = Math.max(ws.ammo, 1); if (s.active <= 0) { g.audio?.play('special_end'); } }
    },
    meter(ws) { const s = ws.sp, p = ws.def.special; return s.active > 0 ? { value: s.active / (p.duration ?? 14), ready: false, label: '過相', color: '#5fe0ff' } : { value: s.charge / p.hits, ready: s.charge >= p.hits, label: '相位', color: '#ffb84a' }; },
  },

  // ------------------------------------------------------------------ 熔爐 CRUCIBLE
  crucible: {
    init(ws) { ws.sp = { heat: 0, primed: false }; },
    modifiers(ws) { return ws.sp.primed ? { flash: 'magma', tracer: [9, 3, 0.6, 1] } : {}; },
    onFire(ws, ctx) {
      const s = ws.sp, p = ws.def.special, g = ctx.game;
      if (s.primed) {
        // the magma round already fired this shot: detonate at the bullet's end point
        const at = ctx.end || _v.copy(ctx.origin).addScaledVector(ctx.dir, 20);
        g.fx?.explosion(at, { radius: p.radius ?? 3, scale: 0.6, color: [1, 0.4, 0.1] });
        g.audio?.play('explosion_small', { pos: at, volume: 0.8 });
        splash(g, at, p.radius ?? 3, (p.blast ?? 120) * (g.arsenal?.dmgMul ?? 1), { knock: 6, shooter: g.localId, weapon: ws.def.id });
        s.primed = false;
        s.heat = p.keep ?? 0.5;
        return;
      }
      s.heat = Math.min(1, s.heat + 1 / (p.shots ?? 12));
      if (s.heat >= 1) { s.primed = true; g.audio?.play('special_ready', { volume: 0.6 }); }
    },
    update(ws, dt) { const s = ws.sp; if (!s.primed && ws.game?.arsenal?.sinceShot > 0.4) s.heat = Math.max(0, s.heat - dt * 0.12); },
    meter(ws) { const s = ws.sp; return { value: s.heat, ready: s.primed, label: '爐溫', color: s.primed ? '#ff5a1e' : '#ff9a3a' }; },
  },

  // ------------------------------------------------------------------ 破疫 PLAGUEBANE
  plaguebane: {
    init(ws) { ws.sp = {}; },
    onHit(ws, info, res, target) {
      const z = target?.zombie;
      if (!z || !z.alive) return;
      z.purgeT = 3;      // read by Zombie.damage via mgr.dmgTakenMul hook (team damage +10 %)
      z.purgeMul = 1 + (ws.def.special.mark ?? 0.1);
    },
    meter() { return null; },
  },

  // ------------------------------------------------------------------ 節拍 TEMPO (active reload)
  tempo: {
    init(ws) { ws.sp = { needle: 0, tried: false, perfects: 0, buff: 0, pierceMag: false }; },
    modifiers(ws) { const s = ws.sp; return { dmgMul: s.buff > 0 ? 1.15 : 1, pierce: s.pierceMag ? 3 : 0 }; },
    onReloadInput(ws, g) {
      const s = ws.sp, ar = g.arsenal;
      if (ar.state !== 'reload' || s.tried) return false;
      s.tried = true;
      const t = 1 - ar.timer / Math.max(0.01, ar.reloadTotal || 1);
      const win = ws.def.special.window ?? [0.42, 0.56];
      if (t >= win[0] && t <= win[1]) {
        // perfect: finish now, buff, chain toward a piercing magazine
        ar.timer = 0.05;
        const need = ws.def.mag - ws.ammo; const take = Math.min(need, ws.reserve); ws.ammo += take; ws.reserve -= take;
        s.buff = 4; s.perfects++;
        if (s.perfects >= 3) { s.perfects = 0; s.pierceMag = true; g.hud?.toast('三連拍！貫穿彈匣', 1500); }
        else g.hud?.toast('完美換彈！', 900);
        g.audio?.play('perfect_reload');
        haptic(20);
      } else { s.perfects = 0; ar.timer += 0.6; g.audio?.play('dryfire'); }
      return true;
    },
    onFire(ws) { const s = ws.sp; if (s.pierceMag && ws.ammo === 0) s.pierceMag = false; },
    update(ws, dt, g) {
      const s = ws.sp;
      s.buff = Math.max(0, s.buff - dt);
      if (g.arsenal.state !== 'reload') s.tried = false;
    },
    meter(ws, g) {
      const ar = g.arsenal;
      if (ar.state === 'reload') return { value: 1 - ar.timer / Math.max(0.01, ar.reloadTotal || 1), ready: false, label: '節拍', color: '#ff3fb4', window: ws.def.special.window ?? [0.42, 0.56] };
      return ws.sp.buff > 0 ? { value: ws.sp.buff / 4, ready: true, label: '強化', color: '#ff3fb4' } : null;
    },
  },

  // ------------------------------------------------------------------ 迴刃 GYRE (saw disc)
  gyre: {
    init(ws) { ws.sp = { blades: 0, disc: null }; },
    onFire(ws) { const s = ws.sp, p = ws.def.special; if (!s.disc) s.blades = Math.min(p.max ?? 12, s.blades + 1 / (p.per ?? 6)); },
    onAlt(ws, g, pressed) {
      if (!pressed) return true;
      const s = ws.sp, p = ws.def.special;
      if (s.disc) { s.disc.recall = true; return true; }
      if (s.blades < 1) { g.hud?.toast('刃片不足'); return true; }
      const cam = g.camera;
      const dir = cam.getWorldDirection(new THREE.Vector3());
      const pos = (g.vm.socketApparent('muzzle', new THREE.Vector3()) || cam.position.clone()).addScaledVector(dir, 0.3);
      const level = Math.floor(s.blades);
      s.blades = 0;
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.22 + level * 0.03, 0.03, 6, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 3.2, 0.6) }));
      const disc = { pos: pos.clone(), vel: dir.multiplyScalar(p.speed ?? 30), mesh, t: 0, hover: 0, recall: false, tick: 0, level };
      g.scene.add(mesh);
      s.disc = disc;
      g.audio?.play('saw_launch');
      return true;
    },
    update(ws, dt, g) {
      const s = ws.sp, d = s.disc, p = ws.def.special;
      if (!d) return;
      d.t += dt; d.tick -= dt;
      const col = g.world.collision;
      if (d.recall) {
        const to = _v.copy(g.camera.position);
        const dir = to.sub(d.pos);
        const dist = dir.length();
        d.pos.addScaledVector(dir.normalize(), Math.min(dist, 38 * dt));
        if (dist < 1) { g.scene.remove(d.mesh); s.disc = null; g.audio?.play('saw_catch'); return; }
      } else if (d.hover <= 0) {
        const step = d.vel.length() * dt;
        const hit = col?.raycast(d.pos, _v.copy(d.vel).normalize(), step + 0.2);
        if (hit || d.t > 0.9) { d.hover = p.hover ?? 4; if (hit) d.pos.copy(hit.point).addScaledVector(hit.normal, 0.3); }
        else d.pos.addScaledVector(d.vel, dt);
      } else {
        d.hover -= dt;
        if (d.hover <= 0) d.recall = true;
      }
      d.mesh.position.copy(d.pos);
      d.mesh.rotation.y += dt * 30;
      if (Math.random() < 0.7) g.fx?.particles.spawn({ additive: true, x: d.pos.x, y: d.pos.y, z: d.pos.z, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 6, life: 0.25, size: 0.012, color: [2, 6, 1, 1], color1: [1, 3, 0.3, 0], frame: 3, stretch: 0.02, gravity: 6 });
      if (d.tick <= 0) {
        d.tick = 0.25;
        for (const z of g.zombies?.inRadius(d.pos, 1.4 + d.level * 0.1) || []) {
          const dir = z.center(new THREE.Vector3()).sub(d.pos).normalize();
          const r = z.damage({ amount: (p.dps ?? 120) * 0.25 * (1 + d.level * 0.15) * (g.arsenal?.dmgMul ?? 1), part: 'body', dir, point: z.center(new THREE.Vector3()), knock: 0.4, stagger: 0.7, weapon: ws.def.id, shooter: g.localId });
          g.hud?.onHit?.({ amount: 0, part: 'body' }, r, { zombie: z });
        }
      }
    },
    meter(ws) { const s = ws.sp, p = ws.def.special; return { value: Math.min(1, s.blades / (p.max ?? 12)), ready: s.blades >= 1 || !!s.disc, label: s.disc ? '召回' : '刃片', color: '#8dff4a' }; },
  },
};

export function specialOf(ws) { return ws?.def?.special ? SPECIALS[ws.def.special.type] : null; }
