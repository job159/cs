// Armory 3D (docs/PREMIUM_WEAPONS.md §1.2 item card turntable, §4.3 軍械庫 UI):
//   Stage   the inspect turntable drawn full screen by the game renderer (its HDR pipeline: ACES, bloom, grain)
//           behind the armory panels, framed into the free part of the screen with a camera view offset. Drag to
//           rotate (with inertia), wheel to zoom, inspect() plays a CS-style turn (flip to the far side, tilt to the
//           top, back), the idle sways around the playside view. A new look slides in after its programs compiled.
//   Thumbs  item-card images rendered offscreen with the same real materials (finishes with seed / float, premium
//           phases): MSAA half-float target -> ACES / sRGB pass with alpha -> async read back -> blob URL, cached for
//           the session, one at a time behind the UI.
// A look: { weapon, finish?: { id, seed, float }, counter?: { kills, boss }, premium?: cfg, grade?: '#hex' }.
// Everything GPU-side the armory made (env maps, targets, per-look materials, premium states, counters) is freed
// by dispose(); the weapon geometries stay with the shared asset cache.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { instanceGLB } from '../engine/assets.js';
import { applyHardSurface, materialUniforms, releaseMaterials } from '../gfx/materials.js';
import { tickPremium } from '../gfx/premium.js';
import { ensureNoise3D, finishDef } from '../gfx/finishes.js';
import { WEAPONS } from '../weapons/defs.js';

const D = Math.PI / 180;
const _corner = new THREE.Vector3(), _hd = new THREE.Vector3();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
let premiumKeyN = 0;

/** The look's key (thumb cache, stale-load checks). */
export function lookKey(l) {
  const f = l.finish;
  return l.weapon + (f ? `|${f.id}:${f.seed | 0}:${(f.float ?? 0).toFixed(4)}` : '') + (l.premium ? `|p:${l.premium.phase || '0'}:${l.premium.seed ?? ''}` : '') + (l.counter ? '|k' : '');
}

/**
 * Loads a weapon model and dresses it with the look's real materials (third-person class, full premium detail).
 * mats / geos collect what it uses, so the armory can free them when it closes.
 */
async function buildModel(look, mats, geos) {
  const def = WEAPONS[look.weapon];
  if (!def) return null;
  const root = await instanceGLB(`weapons/${def.model || def.id}.glb`);
  root.traverse((o) => { if (o.userData?.restHidden) o.visible = false; });
  applyHardSurface(root, {
    wear: def.wear ?? 1, melee: def.id === 'knife', lite: false, world: false,
    premium: look.premium || undefined, premiumKey: look.premium ? `armory:${++premiumKeyN}` : undefined,
    finish: look.finish ? { id: look.finish.id, seed: look.finish.seed, float: look.finish.float } : undefined,
    counter: look.counter ? { kills: look.counter.kills | 0, boss: look.counter.boss | 0 } : undefined,
  });
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (!o.name.startsWith('kc_')) geos.add(o.geometry);   // (the kill counter frees its own)
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
  });
  return root;
}
/** Frees what one built model owns (its premium state and kill counter tick globally). */
function dropModel(root) {
  if (!root) return;
  root.removeFromParent();
  root.userData.killCounter?.dispose();
  root.userData.premiumState?.dispose();
}
/** Bounds of the visible meshes (restHidden parts excluded). */
function boundsOf(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), b = new THREE.Box3();
  root.traverseVisible((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)); } });
  return box;
}

/**
 * Studio lighting shared by the stage and the thumbnails: room env (PMREM), warm key, two cool rims (side-behind and
 * above-behind: dark finishes keep an outline against the stage), soft fill.
 */
function studio(renderer, { shadows = true } = {}) {
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer.gl), room = new RoomEnvironment();
  const envRT = pm.fromScene(room, 0.04), env = envRT.texture;
  pm.dispose(); room.dispose?.();
  scene.environment = env;
  scene.environmentIntensity = 0.85;
  scene.environmentRotation = new THREE.Euler(0, 0.6, 0);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1410, 0.45));
  const key = new THREE.DirectionalLight(0xfff1e0, 2.3);
  key.position.set(1.2, 2.4, 2.2);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -1.2;
    key.shadow.camera.right = key.shadow.camera.top = 1.2;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 8;
    key.shadow.bias = -0.0003; key.shadow.normalBias = 0.003;
  }
  const rim = new THREE.DirectionalLight(0xa8c8ff, 2.5);
  rim.position.set(-1.6, 1.4, -2.4);
  const top = new THREE.DirectionalLight(0xcfdcff, 1.3);
  top.position.set(0.4, 3, -1.6);
  const fill = new THREE.DirectionalLight(0xffe2c8, 0.45);
  fill.position.set(-2, 0.3, 1.5);
  scene.add(key, key.target, rim, top, fill);
  // (the PMREM's whole target goes: its framebuffer and depth buffer, not only the texture)
  return { scene, env, key, dispose() { envRT.dispose(); key.shadow.map?.dispose(); } };
}

/** Mean sRGB luminance of a finish's colours (0..1; null when unknown): dark finishes get more env light. */
function finishLum(id) {
  const c = finishDef(id)?.c;
  if (!c?.length) return null;
  const col = new THREE.Color();
  let s = 0;
  for (const h of c) { col.set(h); s += 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b; }
  return s / c.length;
}

function radialTexture(stops, size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- stage

const POST_KEYS = ['bloomStrength', 'exposure', 'sharpen', 'lift', 'gamma', 'gain', 'saturation', 'contrast', 'shadowTint', 'highlightTint', 'vignette', 'damage',
  'lowHealth', 'flashColor', 'aberration', 'grain', 'scopeMask', 'edge'];

export class Stage {
  constructor(renderer) {
    this.r = renderer;
    ensureNoise3D();
    const s = this.studio = studio(renderer);
    this.scene = s.scene;
    this.camera = new THREE.PerspectiveCamera(24, 16 / 9, 0.02, 40);
    this.camera.position.set(0, 0.06, 2);
    this.mats = new Set(); this.geos = new Set();
    // backdrop: a vignetted gradient (redrawn for the free region and the grade tint), a contact shadow, an aura
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = 512; this.bgCanvas.height = 288;
    this.bgTex = new THREE.CanvasTexture(this.bgCanvas);
    this.bgTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.bgTex;
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.32 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.contactTex = radialTexture([[0, 'rgba(0,0,0,0.55)'], [0.55, 'rgba(0,0,0,0.18)'], [1, 'rgba(0,0,0,0)']]);
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.contactTex, transparent: true, depthWrite: false }));
    this.contact.rotation.x = -Math.PI / 2;
    this.auraTex = radialTexture([[0, 'rgba(255,255,255,0.55)'], [0.35, 'rgba(255,255,255,0.16)'], [1, 'rgba(255,255,255,0)']]);
    this.aura = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.auraTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x000000 }));
    this.aura.renderOrder = -1;
    // a soft pool of light on the floor under the weapon (a lit pedestal: the stage reads as a space, not a void)
    this.spotTex = radialTexture([[0, 'rgba(255,255,255,0.16)'], [0.4, 'rgba(255,255,255,0.06)'], [1, 'rgba(255,255,255,0)']]);
    this.spot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.spotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xc8d2e0 }));
    this.spot.rotation.x = -Math.PI / 2;
    this.spot.renderOrder = -2;
    this.scene.add(this.floor, this.spot, this.contact, this.aura);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.model = null; this.size = 0.8; this.radius = 0.5; this.token = 0;
    // motion: base pose shows the playside (-X) with the muzzle to the left, a little from the front and above
    this.base = { yaw: 90 * D - 16 * D, pitch: 5 * D };
    this.user = { yaw: 0, pitch: 0, vy: 0, vp: 0, idle: 10, drag: false };
    this.zoom = 1; this.zoomT = 1;
    this.inspT = -1; this.inT = 1; this.t = 0;
    this.region = { x: 0.45, y: 0.1, w: 0.53, h: 0.62 };   // free area (fractions of the canvas), set by the screen
    this.bounds = null;                                     // where the weapon may draw at all (zoomed / turned)
    this.grade = '#8b9099';
    this.weapon = null;
    this.veiled = false;                                    // the crate reel runs over the stage: no weapon
    this._bgKey = '';
    this.post = null;
  }

  /**
   * Free part of the screen (CSS px rect of the stage element) the weapon is framed into; bounds: the larger rect it
   * may reach when zoomed or turned (the stage element below its tip line), never the panels' gaps or the header.
   */
  setRegion(rect, bounds = null) {
    const W = window.innerWidth || 1, H = window.innerHeight || 1;
    const fr = (r) => ({ x: r.left / W, y: r.top / H, w: Math.max(0.1, r.width / W), h: Math.max(0.1, r.height / H) });
    this.region = fr(rect);
    this.bounds = bounds ? fr(bounds) : null;
  }

  /** Shows a look (async: model load + program compile; the newest call wins). grade: '#hex' aura / backdrop tint. */
  async show(look, { grade = '#8b9099' } = {}) {
    const tok = ++this.token;
    this.grade = grade;
    this.loading = true;
    let model = null;
    try { model = await buildModel(look, this.mats, this.geos); } catch (e) { console.warn('armory model', e); }
    if (tok !== this.token || this.disposed) { dropModel(model); return false; }
    if (!model) { this.loading = false; return false; }
    // icon framing hints of long upright weapons (bows): lie them along the stage like the item cards
    const iv = WEAPONS[look.weapon]?.icon;
    const holder = new THREE.Group();
    holder.add(model);
    if (iv?.roll) model.rotation.x = iv.roll * D;
    const box = boundsOf(model);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    model.position.sub(c);
    holder.visible = false;
    this.pivot.add(holder);
    try { await this.r.compileScene(this.scene, this.camera, { budget: 8, maxMs: 4000 }); } catch { /* first frame compiles */ }
    if (tok !== this.token || this.disposed) { dropModel(holder); return false; }
    if (this.model) dropModel(this.model);
    this.model = holder;
    holder.visible = !this.veiled;
    this.size = Math.max(sz.x, sz.y, sz.z);
    this.dims = sz;
    this.radius = sz.length() * 0.5;
    this.inT = 0;
    this.loading = false;
    // another weapon starts from the home view (a zoom / turn of the last one would crop it); another look of the same
    // weapon (finishes, 相 previews) keeps the zoom and most of the turn, to compare
    const u = this.user;
    if (look.weapon !== this.weapon) { u.yaw = u.pitch = u.vy = u.vp = 0; this.zoomT = 1; this.inspT = -1; }
    else { u.yaw *= 0.3; u.pitch *= 0.3; }
    if (this.inspAfter) this.inspT = 0;   // (an inspect asked for while this loaded: the crate reveal, a 合成)
    this.inspAfter = false;
    this.weapon = look.weapon;
    // dark finishes (night camo, carbon) keep their highlights: more environment light the darker the paint
    const lum = look.finish ? finishLum(look.finish.id) : null;
    this.scene.environmentIntensity = 0.85 * (1 + 0.75 * Math.max(0, Math.min(1, lum == null ? 0 : (0.06 - lum) / 0.05)));
    return true;
  }

  /** Hides the weapon while the crate reel runs over the stage (veil(false): back, or the next look shows). */
  veil(on) { this.veiled = !!on; if (this.model) this.model.visible = !on; }

  inspect() { if (this.loading) this.inspAfter = true; if (this.model) this.inspT = 0; }
  get inspecting() { return this.inspT >= 0; }

  /** Pointer / wheel controls on the stage element (drag rotates, wheel zooms, double-click resets). Returns off(). */
  bind(el) {
    let last = null;
    const down = (e) => {
      if (e.button !== 0 || e.target.closest('button, input, .av-info')) return;
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.user.drag = true; this.user.vy = this.user.vp = 0;
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('drag');
    };
    const move = (e) => {
      if (!last) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y, t = performance.now(), dt = Math.max(1, t - last.t) / 1000;
      this.user.yaw += dx * 0.0085; this.user.pitch = Math.max(-1.1, Math.min(1.1, this.user.pitch + dy * 0.006));
      this.user.vy = (dx * 0.0085) / dt; this.user.vp = (dy * 0.006) / dt;
      this.user.idle = 0;
      if (this.inspT >= 0) this.inspT = -1;
      last = { x: e.clientX, y: e.clientY, t };
    };
    const up = () => { if (!last) return; last = null; this.user.drag = false; el.classList.remove('drag'); };
    const wheel = (e) => {
      if (e.target.closest('.av-info')) return;
      e.preventDefault();
      this.zoomT = Math.max(0.6, Math.min(1.5, this.zoomT * Math.exp(-e.deltaY * 0.0012)));
      this.user.idle = Math.min(this.user.idle, 1);
    };
    const dbl = (e) => { if (e.target.closest('button, .av-info')) return; this.user.yaw = this.user.pitch = 0; this.zoomT = 1; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('dblclick', dbl);
    return () => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up); el.removeEventListener('wheel', wheel); el.removeEventListener('dblclick', dbl);
    };
  }

  /** The armory's look for the renderer's post chain; the map's own grade comes back in restorePost(). */
  takePost() {
    if (this.post) return;
    const p = this.r.post;
    this.post = Object.fromEntries(POST_KEYS.map((k) => [k, p[k]?.clone ? p[k].clone() : p[k]]));
    this.r.setGrade(null, 1);
    Object.assign(p, { bloomStrength: 0.07, sharpen: 0, vignette: 0.32, damage: 0, lowHealth: 0, aberration: 0, grain: 0.012, scopeMask: 0, edge: 0, contrast: 1.05, saturation: 1.02 });
    p.flashColor.set(0, 0, 0);
  }
  restorePost() {
    if (!this.post) return;
    const p = this.r.post;
    for (const [k, v] of Object.entries(this.post)) { if (p[k]?.copy && v?.isVector3) p[k].copy(v); else if (p[k]?.copy && v?.isColor) p[k].copy(v); else p[k] = v; }
    this.post = null;
  }

  _backdrop() {
    const rg = this.region, key = `${this.grade}|${rg.x.toFixed(3)}|${rg.y.toFixed(3)}|${rg.w.toFixed(3)}`;
    if (key === this._bgKey) return;
    this._bgKey = key;
    const cv = this.bgCanvas, g = cv.getContext('2d'), W = cv.width, H = cv.height;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a2f37'); bg.addColorStop(0.55, '#1a1d22'); bg.addColorStop(1, '#0c0d0f');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const cx = (rg.x + rg.w * 0.5) * W, cy = (rg.y + rg.h * 0.46) * H;
    const tint = new THREE.Color(this.grade);
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W * rg.w * 0.75, 120));
    const rgb = (k) => `rgba(${Math.round(tint.r * 255)},${Math.round(tint.g * 255)},${Math.round(tint.b * 255)},${k})`;
    glow.addColorStop(0, rgb(0.16)); glow.addColorStop(0.5, rgb(0.06)); glow.addColorStop(1, rgb(0));
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    const spot = g.createRadialGradient(cx, cy - H * 0.08, 0, cx, cy, W * rg.w * 0.55);
    spot.addColorStop(0, 'rgba(220,230,255,0.1)'); spot.addColorStop(1, 'rgba(220,230,255,0)');
    g.fillStyle = spot; g.fillRect(0, 0, W, H);
    this.bgTex.needsUpdate = true;
    this.aura.material.color.set(this.grade).multiplyScalar(0.14);
  }

  /** Advances the motion and draws the stage to the canvas. */
  frame(dt, time) {
    const r = this.r, cam = this.camera, u = this.user;
    this.t += dt;
    materialUniforms.time.value += dt;
    tickPremium(dt);
    // user rotation: inertia while free, then the idle sway takes over after a pause
    if (!u.drag) {
      u.yaw += u.vy * dt; u.pitch = Math.max(-1.1, Math.min(1.1, u.pitch + u.vp * dt));
      const k = Math.exp(-4.5 * dt); u.vy *= k; u.vp *= k;
      u.idle += dt;
      if (u.idle > 3.5) { const a = 1 - Math.exp(-1.2 * dt); u.yaw += (Math.round(u.yaw / (2 * Math.PI)) * 2 * Math.PI - u.yaw) * a; u.pitch -= u.pitch * a; }
    }
    this.zoom += (this.zoomT - this.zoom) * (1 - Math.exp(-10 * dt));
    let yaw = this.base.yaw + u.yaw, pitch = this.base.pitch + u.pitch, roll = 0, lift = 0;
    const sway = Math.min(1, Math.max(0, u.idle - 2.5) / 2);
    yaw += sway * 15 * D * Math.sin(this.t * 0.33);
    pitch += sway * 4 * D * Math.sin(this.t * 0.27 + 1.3);
    // inspect: one full turn (the far side passes the camera), a tilt to the top half way, a roll, back home
    if (this.inspT >= 0) {
      this.inspT += dt / 3.8;
      const t = Math.min(1, this.inspT), e = ease(t);
      yaw += e * 2 * Math.PI;
      pitch += Math.sin(Math.PI * t) * 24 * D;
      roll += Math.sin(2 * Math.PI * t) * 10 * D;
      lift += Math.sin(Math.PI * t) * 0.04;
      if (this.inspT >= 1) this.inspT = -1;
    }
    // a new look slides in
    if (this.inT < 1) {
      this.inT = Math.min(1, this.inT + dt / 0.55);
      const e = easeOut(this.inT);
      yaw -= (1 - e) * 55 * D;
      lift -= (1 - e) * 0.03;
      if (this.model) this.model.scale.setScalar(0.94 + 0.06 * e);
    }
    this.pivot.rotation.set(pitch, yaw, roll, 'XYZ');   // roll about the barrel, yaw, then the tilt about the screen's x
    this.pivot.position.y = lift * this.size;
    // camera: fit the weapon into the free region (view offset puts the region's centre on the axis)
    const W = r.width, H = r.height, rg = this.region;
    cam.aspect = W / H;
    const tanV = Math.tan((cam.fov * D) / 2), tanH = tanV * cam.aspect;
    const L = this.size || 0.8, Ht = this.dims ? Math.max(this.dims.y, Math.min(this.dims.x, this.dims.z) * 0.5) : L * 0.35;
    const distW = (L * 0.5) / (0.78 * rg.w * tanH), distH = (Math.max(Ht, L * 0.3) * 0.5) / (0.62 * rg.h * tanV);
    const cx = (rg.x + rg.w / 2) * W, cy = (rg.y + rg.h * 0.47) * H;
    let dist = Math.max(distW, distH, 0.25) / this.zoom;
    dist = Math.max(dist, this._fitBounds(cx, cy, W, H, tanH, tanV));
    cam.position.set(0, dist * 0.06, dist);
    cam.lookAt(0, 0, 0);
    cam.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // floor just under the weapon's lowest point at rest, contact shadow and aura sized to it
    const floorY = -(this.dims ? Math.max(this.dims.y * 0.5, 0.05) : 0.1) - L * 0.12;
    this.floor.position.y = floorY;
    this.contact.position.y = floorY + 0.001;
    this.spot.position.y = floorY + 0.0005;
    this.spot.scale.set(L * 2.6, L * 1.5, 1);
    this.contact.scale.set(L * 1.1, L * 0.45, 1);
    // the contact shadow and floor shadow fade out while the weapon turns over (it would dip through them)
    const ground = this.inspT >= 0 ? 1 - Math.sin(Math.PI * Math.min(1, this.inspT)) : 1;
    this.contact.material.opacity = ground; this.floor.material.opacity = 0.32 * ground; this.spot.material.opacity = 0.5 + 0.5 * ground;
    this.aura.position.set(0, 0, -this.radius * 1.1);
    this.aura.scale.setScalar(L * 1.9);
    this.aura.quaternion.copy(cam.quaternion);
    this.studio.key.target.position.set(0, 0, 0);
    this._backdrop();
    if (!r.fixedScale || Math.abs(r.scale - 1) > 1e-3) r.pinScale(1);
    r.render(this.scene, cam, time);
  }

  /**
   * Closest camera distance at which the weapon, as it is turned right now (its box corners through the pivot), stays
   * inside the bounds: zoom and inspect turns pull the camera back instead of drawing into the panels' gaps.
   */
  _fitBounds(cx, cy, W, H, tanH, tanV) {
    const b = this.bounds;
    if (!b || !this.dims || !this.model) return 0;
    // room from the view axis (the region's centre) to each edge, in tan units
    const l = ((cx - b.x * W) / (W / 2)) * tanH, r = (((b.x + b.w) * W - cx) / (W / 2)) * tanH;
    const t = ((cy - b.y * H) / (H / 2)) * tanV, d = (((b.y + b.h) * H - cy) / (H / 2)) * tanV;
    if (!(l > 0 && r > 0 && t > 0 && d > 0)) return 0;
    this.pivot.updateMatrix();
    const m = this.pivot.matrix, s = this.model.scale.x || 1, h = _hd.copy(this.dims).multiplyScalar(0.5 * s);
    let need = 0;
    for (let i = 0; i < 8; i++) {
      const p = _corner.set(i & 1 ? h.x : -h.x, i & 2 ? h.y : -h.y, i & 4 ? h.z : -h.z).applyMatrix4(m);
      // x / (dist - z) <= room  ->  dist >= z + |x| / room (the camera looks down -z from +z)
      need = Math.max(need, p.z + (p.x > 0 ? p.x / r : -p.x / l), p.z + (p.y > 0 ? p.y / t : -p.y / d));
    }
    return need * 1.03;
  }

  dispose() {
    this.disposed = true;
    this.token++;
    dropModel(this.model);
    this.model = null;
    this.restorePost();
    releaseMaterials(this.mats);
    this.mats.clear();
    // the weapon models' GPU buffers (the asset cache keeps the geometry: a match uploads what it uses again)
    for (const g of this.geos) g.dispose();
    this.geos.clear();
    this.studio.dispose();
    this.bgTex.dispose(); this.contactTex.dispose(); this.auraTex.dispose(); this.spotTex.dispose();
    for (const m of [this.floor, this.spot, this.contact, this.aura]) { m.geometry.dispose(); m.material.dispose(); }
    this.scene.clear();
  }
}

// ---------------------------------------------------------------- thumbnails

const THUMB_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform float exposure;
varying vec2 vUv;
vec3 acesFitted(vec3 c) {
  const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c = inM * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return clamp(outM * (a / b), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec4 s = texture2D(tSrc, vUv);
  float a = clamp(s.a, 0.0, 1.0);
  vec3 c = a > 0.002 ? max(s.rgb, 0.0) / a : vec3(0.0);   // MSAA edges resolved against a clear of 0 (premultiplied)
  c = acesFitted(c * exposure);
  c = clamp((c - 0.5) * 1.05 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(toSRGB(c), a);
}`;
const THUMB_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const thumbCache = new Map();   // look key + size -> { p: Promise<url | null>, owner } (kept for the session)
const thumbDone = new Map();    // look key + size -> url, once rendered (cards re-render with it at once)

// Rendered card images outlive the session in Cache Storage (a later visit shows them at once). The cache is named
// after the build -- the bundle's ETag / Last-Modified / size -- so a new build renders again; older builds' caches
// are dropped. THUMB_REV forces a new set by hand.
const THUMB_REV = 2, DISK = 'cf-thumbs';
let diskP = null;
function disk() {
  if (!diskP) {
    diskP = (async () => {
      if (typeof caches === 'undefined' || !globalThis.isSecureContext) return null;
      const r = await fetch(new URL('game.js', location.href), { method: 'HEAD', cache: 'no-cache' });
      const tag = [r.headers.get('etag'), r.headers.get('last-modified'), r.headers.get('content-length')].filter(Boolean).join('|');
      if (!r.ok || !tag) return null;
      let h = 0;
      for (let i = 0; i < tag.length; i++) h = (Math.imul(h, 31) + tag.charCodeAt(i)) | 0;
      const name = `${DISK}:${THUMB_REV}:${(h >>> 0).toString(36)}`;
      for (const k of await caches.keys()) if (k.startsWith(DISK + ':') && k !== name) caches.delete(k).catch(() => {});
      return caches.open(name);
    })().catch(() => null);
  }
  return diskP;
}
const diskUrl = (key) => new URL(`__thumb/${encodeURIComponent(key)}.png`, location.href).href;
async function diskGet(key) {
  try { const c = await disk(); const r = c && await c.match(diskUrl(key)); return r ? await r.blob() : null; } catch { return null; }
}
function diskPut(key, blob) {
  disk().then((c) => c?.put(diskUrl(key), new Response(blob, { headers: { 'content-type': 'image/png' } }))).catch(() => {});
}
/**
 * Fills the session cache from the disk for these looks (no rendering): the armory's first grid already has them.
 * Resolves with how many were found.
 */
export async function primeThumbs(looks, { w = 384, h = 192 } = {}) {
  let n = 0;
  await Promise.all(looks.map(async (l) => {
    const key = lookKey(l) + `@${w}x${h}`;
    if (thumbDone.has(key) || thumbCache.has(key)) return;
    const b = await diskGet(key);
    if (b && !thumbDone.has(key)) { const u = URL.createObjectURL(b); thumbDone.set(key, u); thumbCache.set(key, { p: Promise.resolve(u), owner: null }); n++; }
  }));
  return n;
}

export class Thumbs {
  /** gate(): false holds the queue (the menu warm-up waits while a match loads or plays). */
  constructor(renderer, { w = 384, h = 192, gate = null } = {}) {
    this.r = renderer;
    this.w = w; this.h = h;
    this.gate = gate;
    this.queue = [];
    this.busy = false;
    this.mats = new Set(); this.geos = new Set();
  }
  _init() {
    if (this.s) return;
    ensureNoise3D();
    this.s = studio(this.r, { shadows: false });
    this.s.scene.environmentIntensity = 1.0;
    this.cam = new THREE.PerspectiveCamera(18, this.w / this.h, 0.02, 40);
    const hdr = this.r.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.rt = new THREE.WebGLRenderTarget(this.w, this.h, { type: hdr, samples: 4, depthBuffer: true });
    this.out = new THREE.WebGLRenderTarget(this.w, this.h, { depthBuffer: false });
    this.mat = new THREE.ShaderMaterial({ vertexShader: THUMB_VERT, fragmentShader: THUMB_FRAG, uniforms: { tSrc: { value: this.rt.texture }, exposure: { value: 1.05 } }, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.mat);
  }

  /**
   * Blob URL of the look's card image (null when the model is missing). Cached; renders queue one at a time.
   * front: ahead of the queue (the crate reel's winner and the cards it stops among).
   */
  get(look, { front = false } = {}) {
    const key = lookKey(look) + `@${this.w}x${this.h}`;
    const had = thumbCache.get(key);
    // (a job of a closed instance -- the menu warm-up the armory replaced -- is taken over)
    if (had && (thumbDone.has(key) || !had.owner?.disposed)) return had.p;
    const ent = { owner: this };
    ent.p = (async () => {
      const b = await diskGet(key);
      if (b) return URL.createObjectURL(b);
      if (this.disposed) return null;
      return new Promise((res) => { const job = { look, res, key }; if (front) this.queue.unshift(job); else this.queue.push(job); this._pump(); });
    })();
    thumbCache.set(key, ent);
    ent.p.then((u) => { if (u) thumbDone.set(key, u); else if (thumbCache.get(key) === ent) thumbCache.delete(key); });
    return ent.p;
  }
  /** The look's image if it is already rendered (else undefined). */
  now(look) { return thumbDone.get(lookKey(look) + `@${this.w}x${this.h}`); }

  async _pump() {
    if (this.busy || this.disposed) return;
    this.busy = true;
    while (this.queue.length && !this.disposed) {
      if (this.gate && !this.gate()) { await new Promise((r) => setTimeout(r, 500)); continue; }
      const job = this.queue.shift();
      let url = null;
      try {
        const blob = await this._render(job.look);
        if (blob) { url = URL.createObjectURL(blob); diskPut(job.key, blob); }
      } catch (e) { console.warn('thumb', e); }
      job.res(url);
      await new Promise((r) => setTimeout(r, this.gate ? 250 : 16));   // the UI keeps its frame rate between renders
    }
    this.busy = false;
  }
  /** Jobs waiting (the warm-up's progress). */
  get pending() { return this.queue.length + (this.busy ? 1 : 0); }

  async _render(look) {
    this._init();
    const model = await buildModel(look, this.mats, this.geos);
    if (!model || this.disposed) { dropModel(model); return null; }
    const iv = WEAPONS[look.weapon]?.icon;
    const holder = new THREE.Group();
    holder.add(model);
    if (iv?.roll) model.rotation.x = iv.roll * D;
    // playside, muzzle left, a little from the front and above (the card angle)
    holder.rotation.set(7 * D, 90 * D - 12 * D, 0, 'XYZ');
    const box = boundsOf(holder);
    holder.position.sub(box.getCenter(new THREE.Vector3()));
    const sz = box.getSize(new THREE.Vector3());
    const cam = this.cam, tanV = Math.tan((cam.fov * D) / 2), tanH = tanV * cam.aspect;
    const dist = Math.max((sz.x * 0.5) / (0.9 * tanH), (sz.y * 0.5) / (0.84 * tanV)) + sz.z * 0.5;
    cam.position.set(0, 0, dist); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    const scene = this.s.scene;
    scene.add(holder);
    const gl = this.r.gl;
    try {
      await this.r.compileScene(scene, cam, { budget: 8, maxMs: 6000 });
      if (this.disposed) return null;
      const prevT = gl.getRenderTarget(), prevC = gl.getClearColor(new THREE.Color()), prevA = gl.getClearAlpha(), ac = gl.autoClear;
      gl.setRenderTarget(this.rt);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, true, false);
      gl.autoClear = false;
      try { gl.render(scene, cam); } finally { gl.autoClear = ac; }
      gl.setRenderTarget(this.out);
      this.quad.render(gl);
      gl.setRenderTarget(prevT);
      gl.setClearColor(prevC, prevA);
    } finally {
      scene.remove(holder);
      dropModel(model);
    }
    const w = this.w, h = this.h, px = new Uint8Array(w * h * 4);
    await this.r.gpuDrain?.(800);
    await gl.readRenderTargetPixelsAsync(this.out, 0, 0, w, h, px);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    ctx.putImageData(img, 0, 0);
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }

  dispose() {
    this.disposed = true;
    for (const j of this.queue) j.res(null);
    this.queue.length = 0;
    releaseMaterials(this.mats);
    this.mats.clear();
    for (const g of this.geos) g.dispose();
    this.geos.clear();
    if (!this.s) return;
    this.s.dispose();
    this.rt.dispose(); this.out.dispose(); this.mat.dispose();   // (the quad's geometry is FullScreenQuad's shared one)
    this.s.scene.clear();
  }
}
