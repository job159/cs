// Zombie animation film-strip preview (dev tool, not part of the game bundle).
//   anim-preview.html?clips=walk_a,walk_b&n=8&view=side&mode=strip
// Params: clips (comma list, one row each), n (frames per row), view (side|front|quarter|back),
// mode (strip = copies side by side | onion = overlaid with root motion re-added along +Z),
// t0/t1 (time range in seconds, default whole clip), anims (GLB url), model (skinned GLB url),
// spacing (m between copies), h (row height in m).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

window.__shotReady = false;
const qs = new URLSearchParams(location.search);
const num = (k, d) => (qs.has(k) ? +qs.get(k) : d);
const view = qs.get('view') || 'side';
const mode = qs.get('mode') || 'strip';
const N = num('n', 8);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const overlay = document.createElement('canvas');
overlay.width = innerWidth; overlay.height = innerHeight;
overlay.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none';
document.body.appendChild(overlay);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2126);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x403830, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(4, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
scene.add(sun, sun.target);

const loader = new GLTFLoader();
const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));

function viewBasis() {
  // returns camera direction (from target to camera) and the screen-right axis in world space
  switch (view) {
    case 'front': return { dir: new THREE.Vector3(0, 0.05, 1), right: new THREE.Vector3(1, 0, 0) };
    case 'back': return { dir: new THREE.Vector3(0, 0.05, -1), right: new THREE.Vector3(-1, 0, 0) };
    case 'quarter': return { dir: new THREE.Vector3(1, 0.25, 1).normalize(), right: new THREE.Vector3(1, 0, -1).normalize() };
    case 'top': return { dir: new THREE.Vector3(0.01, 1, 0.3).normalize(), right: new THREE.Vector3(-1, 0, 0) };
    default: return { dir: new THREE.Vector3(1, 0.05, 0).normalize(), right: new THREE.Vector3(0, 0, -1) };
  }
}

async function main() {
  const [model, anims] = await Promise.all([load(qs.get('model') || 'dev/mannequin.glb'), load(qs.get('anims') || 'assets/zombies/anims.glb')]);
  const meta = anims.scene.userData?.clips || anims.parser?.json?.extras?.clips || {};
  const names = (qs.get('clips') || anims.animations.map((a) => a.name).join(',')).split(',');
  const { dir, right } = viewBasis();
  const spacing = num('spacing', mode === 'onion' ? 0 : view === 'front' || view === 'back' ? 0.95 : 1.25);
  const rowH = num('h', 2.3);
  const labels = [];
  const box = new THREE.Box3();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  names.forEach((name, row) => {
    const clip = anims.animations.find((a) => a.name === name);
    if (!clip) { labels.push({ text: `missing clip ${name}`, p: new THREE.Vector3(0, -row * rowH, 0) }); return; }
    const info = meta[name] || {};
    const t0 = num('t0', 0), t1 = Math.min(num('t1', clip.duration), clip.duration);
    const loop = info.loop;
    for (let i = 0; i < N; i++) {
      const t = N === 1 ? t0 : loop ? t0 + ((t1 - t0) * i) / N : t0 + ((t1 - t0) * i) / (N - 1);
      const obj = skClone(model.scene);
      obj.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      const mixer = new THREE.AnimationMixer(obj);
      mixer.clipAction(clip).play();
      mixer.setTime(Math.min(t, clip.duration - 1e-4));
      const off = right.clone().multiplyScalar(i * spacing);
      if (mode === 'onion') off.z += (info.speed || 0) * t;
      off.y -= row * rowH;
      obj.position.copy(off);
      scene.add(obj);
      obj.updateMatrixWorld(true);
      box.expandByObject(obj);
      labels.push({ text: `${t.toFixed(2)}`, p: off.clone().add(new THREE.Vector3(0, -0.12, 0)) });
    }
    // ground strip for the row (raised slightly so rows do not overlap)
    const len = Math.max(2, (N - 1) * spacing + 2);
    const center = right.clone().multiplyScalar(((N - 1) * spacing) / 2);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 1 }));
    g.rotation.x = -Math.PI / 2;
    g.scale.set(Math.abs(right.x) > 0.5 ? len : 2.4 + (mode === 'onion' ? 4 : 0), Math.abs(right.z) > 0.5 ? len : 2.4 + (mode === 'onion' ? 4 : 0), 1);
    g.position.copy(center).add(new THREE.Vector3(0, -row * rowH - 0.002, mode === 'onion' ? 1.5 : 0));
    g.receiveShadow = true;
    scene.add(g);
    // grid lines (0.25 m) to judge sliding / penetration
    const grid = new THREE.GridHelper(Math.max(len, 8), Math.max(len, 8) * 4, 0x59616b, 0x4a5058);
    grid.position.copy(g.position).add(new THREE.Vector3(0, 0.001, 0));
    scene.add(grid);
    labels.push({ text: `${name}  ${clip.duration.toFixed(2)}s${loop ? ' loop' : ''}${info.speed ? `  v=${info.speed.toFixed(2)}m/s` : ''}`, p: center.clone().add(new THREE.Vector3(0, -row * rowH + 2.05, 0)), big: true, left: true, start: right.clone().multiplyScalar(-0.5).add(new THREE.Vector3(0, -row * rowH + 2.05, 0)) });
  });
  // fit an orthographic camera to the content
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const aspect = innerWidth / innerHeight;
  const up = new THREE.Vector3().crossVectors(dir, right).normalize().negate();
  // extents along screen axes
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  let w = 0, h = 0;
  for (const p of corners) { const d = p.clone().sub(c); w = Math.max(w, Math.abs(d.dot(right))); h = Math.max(h, Math.abs(d.y)); }
  h += 0.25; w += 0.3;
  if (w / h > aspect) h = w / aspect; else w = h * aspect;
  window.__dbg = { box: box.min.toArray().concat(box.max.toArray()), w, h };
  const cam = new THREE.OrthographicCamera(-w, w, h, -h, 0.1, 100);
  cam.position.copy(c).addScaledVector(dir, 30);
  cam.up.set(0, 1, 0);
  cam.lookAt(c);
  sun.position.copy(c).add(new THREE.Vector3(3, 10, 6));
  sun.target.position.copy(c);
  const sc = sun.shadow.camera;
  const ext = Math.max(size.x, size.y, size.z) * 0.75 + 2;
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 0.1; sc.far = 40;
  sc.updateProjectionMatrix();
  renderer.render(scene, cam);
  const ctx = overlay.getContext('2d');
  ctx.textAlign = 'center';
  for (const l of labels) {
    const s = (l.start || l.p).clone().project(cam);
    const x = (s.x * 0.5 + 0.5) * innerWidth, y = (-s.y * 0.5 + 0.5) * innerHeight;
    ctx.font = l.big ? 'bold 18px sans-serif' : '12px monospace';
    ctx.fillStyle = l.big ? '#ffd27a' : '#b8c0ca';
    ctx.textAlign = l.left ? 'left' : 'center';
    ctx.fillText(l.text, Math.max(6, x), Math.max(18, y));
  }
  void up;
  window.__shotReady = true;
}

window.addEventListener("error", (e) => { window.__err = String(e.message); });
window.addEventListener("unhandledrejection", (e) => { window.__err = String(e.reason?.stack || e.reason); });
main().catch((e) => {
  window.__err = String(e.stack || e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;position:fixed;top:0;left:0">${e.stack || e}</pre>`);
  window.__shotReady = true;
});
