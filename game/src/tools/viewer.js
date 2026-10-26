// Asset QA viewer (dev): index.html?view=weapon&id=akm[&grid=1][&yaw=30&pitch=10&dist=1.2][&env=room]
// grid=1 renders a 2x2 contact sheet (right side, left side, front 3/4, top 3/4) into one image so a
// single screenshot shows the whole model. window.__shotReady flips true once rendered.
// Finishes (PREMIUM_WEAPONS §3.10): &finish=<id>&seed=<0-999>&float=<0-1>&sfx=pearl:0.2,glitter:0.8&side=play&flat=1
//   &counter=<kills>[&boss=1] mounts a 斬數計.
// Premium presets (§1.5) on any model: &pv=auto | <matKey>:<preset>,... | all:<preset>  &remap=<key>:<newKey>,...
//   &elem=<element> &charge=0..1 &ready=1 &t=<time s> &dissolve=0..1 &core=<mode> &pvp=<json per-preset params>
//   A weapon whose def has a `premium` block shows that look by default (&pv=off for the bare model).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { instanceGLB } from '../engine/assets.js';
import { applyHardSurface, materialUniforms } from '../gfx/materials.js';
import { tickPremium } from '../gfx/premium.js';
import { WEAPONS } from '../weapons/defs.js';

export async function runViewer(renderer, params) {
  const kind = params.get('view');
  if (kind === 'lightmap') { // baked lightmap QA (tools/map/test-lightmap.mjs, docs/MAP_KIT.md)
    const { runLightmapViewer } = await import('./lmviewer.js');
    return runLightmapViewer(renderer, params);
  }
  const id = params.get('id') || 'akm';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(params.get('bg') || '#5d6166');
  const pmrem = new THREE.PMREMGenerator(renderer.gl);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = +(params.get('envi') || 0.9);
  const key = new THREE.DirectionalLight(0xfff1e0, +(params.get('key') || (params.get('flat') ? 0.6 : 2.2)));
  if (params.get('flat')) scene.environmentIntensity = 1.4;
  key.position.set(1.5, 2.5, 1.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -1;
  key.shadow.camera.right = key.shadow.camera.top = 1;
  key.shadow.bias = -0.0002; key.shadow.normalBias = 0.002;
  scene.add(key);
  renderer.gl.shadowMap.enabled = true;

  const path = kind === 'weapon' ? `weapons/${id}.glb` : `${kind}/${id}.glb`;
  const model = await instanceGLB(path);
  // parts the weapon logic shows only in action (GLB extras.restHidden: a sword's full projected blade) stay hidden
  model.traverse((o) => { if (o.userData?.restHidden) o.visible = false; });
  const fin = params.get('finish');
  const list = (k) => (params.get(k) || '').split(',').filter(Boolean).map((e) => e.split(':'));
  // material remap (premium preview on an existing gun) + preset assignment
  const remap = Object.fromEntries(list('remap'));
  const keys = new Set();
  model.traverse((o) => { if (o.isMesh) { const k = o.userData.mat || o.material?.name; if (remap[k]) o.userData.mat = remap[k]; keys.add(o.userData.mat || k); } });
  let premium;
  if (params.get('pv') && params.get('pv') !== 'off') {
    const presets = {};
    for (const [k, p] of list('pv')) { if (k === 'all') for (const kk of keys) presets[kk] = p; else if (p) presets[k] = p; }
    premium = { element: params.get('elem') || 'radiant', presets, pv: JSON.parse(params.get('pvp') || '{}'), seed: +(params.get('kiln') || 0) };
  } else if (!params.get('pv') && kind === 'weapon') premium = Object.values(WEAPONS).find((w) => (w.model || w.id) === id && w.premium)?.premium;
  const sfx = params.get('sfx') ? Object.fromEntries(list('sfx').map(([k, v]) => [k, k === 'glitter' ? { amt: +(v || 0.8), scale: 1000, rainbow: 0.2 } : +(v || 0.2)])) : undefined;
  const fl = params.get('float') ?? (params.get('fwear') ? +params.get('fwear') / 2 : null);
  applyHardSurface(model, {
    wear: +(params.get('wear') || 1), melee: id === 'knife', premium, lite: false, world: false,   // preview the first-person look
    finish: fin ? { id: fin, seed: +(params.get('seed') || 0), float: fl === null ? undefined : +fl, sfx } : undefined,
    counter: params.get('counter') !== null ? { kills: +params.get('counter'), boss: +(params.get('boss') || 0) } : undefined,
  });
  const st = model.userData.premiumState;
  if (st) {
    if (params.get('charge') !== null) st.setMeter(+params.get('charge'));
    if (params.get('ready')) st.setReady(true);
    if (params.get('dissolve')) st.setDissolve(+params.get('dissolve'));
    if (params.get('core')) st.setCoreMode(+params.get('core'));
    for (let i = 0; i < 40; i++) tickPremium(0.05);
  }
  if (params.get('t')) materialUniforms.time.value = +params.get('t');
  // centre on bounds
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  scene.add(model);
  const radius = size.length() * 0.5;
  let meta = {};
  model.traverse((o) => { if (o.userData?.weapon) meta = o.userData; });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.25 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -size.y / 2 - 0.002; floor.receiveShadow = true;
  scene.add(floor);

  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  const W = window.innerWidth, H = window.innerHeight;
  // grid: right side, left side, front-right 3/4, rear-right 3/4 from above
  // fp:   roughly what the player sees in first person (behind, above and right of the grip)
  const views = params.get('grid')
    ? [[90, 6], [-90, 6], [35, 18], [150, 35]]
    : params.get('fp') ? [['fp', 0]]
    : params.get('side') === 'play' ? [[-90, 0]]
    : [[+(params.get('yaw') || 90), +(params.get('pitch') || 8)]];
  const dist = +(params.get('dist') || 0) || (params.get('fp') ? radius * 1.5 : (radius / Math.tan((15 * Math.PI) / 180)) * 1.02);
  const look = params.get('fp') ? new THREE.Vector3(0, 0, -radius * 0.5) : new THREE.Vector3();
  // close-ups: look=x,y,z (m, from the model centre) and fov=deg
  if (params.get('look')) look.fromArray(params.get('look').split(',').map(Number));
  if (params.get('fov')) cam.fov = +params.get('fov');
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  out.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:5';
  const ctx = out.getContext('2d');
  const cols = views.length > 1 ? 2 : 1, rows = views.length > 1 ? 2 : 1;
  const vw = W / cols, vh = H / rows;
  renderer.resize(vw, vh);
  cam.aspect = vw / vh;
  cam.updateProjectionMatrix();
  renderer.fixedScale = true;
  renderer.post.vignette = 0.15;
  renderer.post.grain = 0.0;
  const info = { size: size.toArray().map((v) => +v.toFixed(3)), tris: 0 };
  model.traverse((o) => { if (o.isMesh) info.tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  const draw = (spin = 0) => {
    views.forEach(([yaw, pitch], i) => {
      if (yaw === 'fp' && meta.grip === 'bow') {
        // bows (long axis = y): from behind the nock along the arrow, a little right and above, onto the riser
        const b = meta.brace ?? -0.19;
        cam.position.set(0.05, 0.05, 0.3 - b).add(model.position);
        cam.lookAt(new THREE.Vector3(0, 0.07, 0).add(model.position));
        cam.fov = 45; cam.updateProjectionMatrix();
      } else if (yaw === 'fp') {
        // close rear-right-high 3/4: the receiver/sight area the player stares at in first person
        cam.position.set(size.z * 0.28, size.z * 0.2, size.z * 0.22);
        cam.lookAt(0, size.y * 0.15, -size.z * 0.12);
        cam.fov = 40; cam.updateProjectionMatrix();
      } else {
        const y = ((yaw + spin) * Math.PI) / 180, p = (pitch * Math.PI) / 180;
        cam.position.set(Math.sin(y) * Math.cos(p) * dist, Math.sin(p) * dist, Math.cos(y) * Math.cos(p) * dist);
        if (params.get('look')) cam.position.add(look);
        cam.lookAt(look);
      }
      renderer.render(scene, cam, 0);
      ctx.drawImage(renderer.canvas, (i % cols) * vw, Math.floor(i / cols) * vh, vw, vh);
    });
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, 360, 22);
    ctx.fillStyle = '#fff'; ctx.font = '13px monospace';
    ctx.fillText(`${id}  ${info.size.join(' x ')} m  ${Math.round(info.tris)} tris`, 6, 15);
  };
  document.body.appendChild(out);
  document.getElementById('boot')?.remove();
  draw();
  window.__viewer = { scene, model, cam, draw, info, renderer, apply: (o) => applyHardSurface(model, o), premium: st, counter: model.userData.killCounter, tick: tickPremium, time: materialUniforms.time };
  window.__shotReady = true;
  if (params.get('spin')) {
    let a = 0;
    const loop = () => { a += 0.5; materialUniforms.time.value += 1 / 60; tickPremium(1 / 60); draw(a); requestAnimationFrame(loop); };
    loop();
  }
}
