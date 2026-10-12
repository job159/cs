// Lightmap QA viewer (dev): index.html?view=lightmap[&src=maps/_test/lm][&cam=0][&lm=1][&show=lit|lm|mask|albedo]
//   [&pos=x,y,z&look=x,y,z][&fov=70][&shadows=1][&exp=1]
// Loads <src>/scene.glb + lightmap.json + atlases (written by tools/map/test-lightmap.mjs or any bakeLightmaps()
// result), lights it with the same sun / sky as the bake and renders through the game's post chain.
//   lm=0      realtime only (sun + shadow map + environment IBL) - the "without lightmap" reference
//   show=lm   white albedo: lighting only;  show=mask: sun mask only;  show=albedo: unlit textures
// window.__lmv = { scene, camera, render(camIndex | {pos, look}), cams } for --eval scripts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadLightmapAtlases, applyLightmaps } from '../world/lightmap.js';

// same analytic sky as tools/map/lib/lightmap-hdr.mjs makeSky() without an HDRI
function analyticSky(zen = [0.55, 0.68, 0.95], hor = [0.95, 0.95, 0.92], ground = [0.2, 0.19, 0.17]) {
  const W = 128, H = 64;
  const data = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI, dy = Math.sin(lat);
    const k = (y * W + x) * 4;
    if (dy >= 0) {
      const t = Math.pow(dy, 0.6);
      for (let c = 0; c < 3; c++) data[k + c] = hor[c] + (zen[c] - hor[c]) * t;
    } else {
      const t = Math.min(1, -dy / 0.12);
      for (let c = 0; c < 3; c++) data[k + c] = hor[c] * (1 - t) + ground[c] * t;
    }
    data[k + 3] = 1;
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

const TEST_CAMS = [
  { pos: [15, 9, 15], look: [0, 0.5, 0] },          // 0 overview from the sun side
  { pos: [2.3, 1.6, -1.9], look: [-0.6, 0.6, 2.5] }, // 1 inside the room, window + sun patch
  { pos: [0.5, 1.6, 2.1], look: [-1.6, 0.8, -2.5] }, // 2 inside the room, lamp corner / north wall
  { pos: [9.5, 1.5, -9.5], look: [9.5, 0.6, -4.2] }, // 3 shed: thin walls on the ground plane, through the door
  { pos: [-1.5, 2.2, 7.5], look: [-5.2, 1.2, 3.5] }, // 4 pillar + container (curved seams)
  { pos: [-9, 6, -10], look: [0, 0.5, 0] },         // 5 overview from the shaded side
];

export async function runLightmapViewer(renderer, params) {
  const src = (params.get('src') || 'maps/_test/lm').replace(/\/$/, '');
  const base = 'assets/' + src + '/';
  const meta = await (await fetch(base + 'lightmap.json')).json();
  const gltf = await new GLTFLoader().loadAsync(base + 'scene.glb');
  const scene = new THREE.Scene();
  const model = gltf.scene;
  scene.add(model);
  const useLm = params.get('lm') !== '0';
  const show = params.get('show') || 'lit';

  // sky + environment
  const skyTex = analyticSky();
  scene.background = skyTex;
  const pmrem = new THREE.PMREMGenerator(renderer.gl);
  scene.environment = pmrem.fromEquirectangular(skyTex).texture;
  scene.environmentIntensity = 1;

  // sun as in the bake (dir = towards the sun)
  const s = meta.sun;
  const sun = new THREE.DirectionalLight(new THREE.Color(s.color), s.intensity);
  const d = new THREE.Vector3(...s.dir).normalize();
  sun.position.copy(d).multiplyScalar(60);
  sun.castShadow = params.get('shadows') !== '0';
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -25; sc.right = sc.top = 25; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  renderer.gl.shadowMap.enabled = true;
  // baked point lights: realtime stand-ins only when the lightmap is off
  if (!useLm) for (const l of meta.lights || []) {
    const pl = new THREE.PointLight(new THREE.Color(l.color), l.intensity, l.range || 0, 2);
    pl.position.set(...l.pos);
    scene.add(pl);
  }

  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    if (show === 'lm' || show === 'mask') {
      const m = o.material.clone();
      m.color.set(0xb4b4b4); m.map = null; m.metalness = 0; m.roughness = 1;
      if (show === 'mask') m.envMapIntensity = 0;
      o.material = m;
    } else if (show === 'albedo') {
      o.material = new THREE.MeshBasicMaterial({ color: o.material.color, map: o.material.map });
    }
  });
  let nLm = 0;
  if (useLm && show !== 'albedo') {
    const atlases = await loadLightmapAtlases(base, meta);
    nLm = applyLightmaps(model, atlases, meta);
    if (show === 'mask') model.traverse((o) => { if (o.isMesh && o.material.userData.lightmap) o.material.userData.lightmap.uniforms.lmRange.value = 0; });
  }
  if (show === 'mask') { scene.environment = null; sun.castShadow = false; }

  const camera = new THREE.PerspectiveCamera(+(params.get('fov') || 70), 1, 0.05, 500);
  const cams = meta.cameras || TEST_CAMS;
  const W = window.innerWidth, H = window.innerHeight;
  renderer.resize(W, H);
  renderer.fixedScale = true;
  renderer.scale = 1;
  renderer.post.vignette = 0.1; renderer.post.grain = 0;
  renderer.post.exposure = +(params.get('exp') || 1);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:6px;top:6px;z-index:6;font:12px monospace;color:#fff;background:rgba(0,0,0,.5);padding:2px 6px';
  document.getElementById('boot')?.remove();
  for (const el of document.body.children) if (el !== renderer.canvas && el.tagName !== 'SCRIPT') el.style.display = 'none'; // game HUD
  document.body.appendChild(hud);

  const render = (c) => {
    const cam = typeof c === 'number' ? cams[c % cams.length] : c;
    camera.position.set(...cam.pos);
    camera.lookAt(new THREE.Vector3(...cam.look));
    renderer.render(scene, camera, 0);
    const info = renderer.gl.info.render;
    hud.textContent = `${src}  lightmap ${useLm ? 'ON' : 'OFF'} (${nLm} meshes, range ${meta.range}, ${meta.mode})  show=${show}  ${info.calls} calls ${info.triangles} tris`;
  };
  const pos = params.get('pos'), look = params.get('look');
  render(pos && look ? { pos: pos.split(',').map(Number), look: look.split(',').map(Number) } : +(params.get('cam') || 0));
  window.__lmv = { scene, camera, render, cams, sun, model, meta };
  window.__shotReady = true;
}
