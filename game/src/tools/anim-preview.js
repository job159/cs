// Zombie animation film-strip preview (dev tool, not part of the game bundle).
//   anim-preview.html?clips=walk_a,walk_b&n=8&view=side&mode=strip
// Params: clips (comma list, one row each), n (frames per row), view (side|front|quarter|back),
// mode (strip = copies side by side | onion = overlaid with root motion re-added along +Z),
// t0/t1 (time range in seconds, default whole clip), anims (GLB url), model (skinned GLB url),
// spacing (m between copies), h (row height in m), game=1 (with a model: clips retargeted onto it and its
// extras.poseOffsets applied after the clip, exactly as the game plays them), hands=1 (trail: + knuckle paths).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { retargetClips } from '../zombies/retarget.js';

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

// Foot / hand point trails over the whole clip with the treadmill speed added back (+Z): a planted
// foot shows as a tight cluster of dots, sliding shows as a smear along the ground.
function addTrails(model, clip, info, origin, scene, box, speed = info.speed || 0, applyOffs = () => {}) {
  const obj = skClone(model.scene);
  const mixer = new THREE.AnimationMixer(obj);
  mixer.clipAction(clip).play();
  const bones = {};
  obj.traverse((o) => { if (o.isBone || o.type === 'Bone' || o.name) bones[o.name] = o; });
  obj.updateMatrixWorld(true);
  const heelOff = {};
  for (const s of ['l', 'r']) {
    const foot = bones[`foot_${s}`];
    const a = new THREE.Vector3().setFromMatrixPosition(foot.matrixWorld);
    const heelW = new THREE.Vector3(a.x, 0, a.z - 0.045);
    heelOff[s] = foot.worldToLocal(heelW.clone());
  }
  const dots = { l: [], r: [] };
  const steps = Math.round(clip.duration * 60);
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * clip.duration;
    mixer.setTime(Math.min(t, clip.duration - 1e-4));
    applyOffs(obj);
    obj.updateMatrixWorld(true);
    for (const s of ['l', 'r']) {
      const heel = bones[`foot_${s}`].localToWorld(heelOff[s].clone());
      const toe = new THREE.Vector3().setFromMatrixPosition(bones[`ball_${s}`].matrixWorld);
      // (hands=1: + the middle knuckle, for the quadruped clips that plant the hands too)
      const pts = [heel, toe];
      if (qs.has('hands')) pts.push(new THREE.Vector3().setFromMatrixPosition(bones[`middle_01_${s}`].matrixWorld));
      for (const p of pts) { p.z += speed * t; p.add(origin); dots[s].push(p); }
    }
  }
  for (const s of ['l', 'r']) {
    const g = new THREE.BufferGeometry().setFromPoints(dots[s]);
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: s === 'l' ? 0x5aa0ff : 0xff9a4a, size: 4, sizeAttenuation: false }));
    scene.add(pts);
    for (const p of dots[s]) box.expandByPoint(p);
  }
}

async function main() {
  const bust = (u) => u + (u.includes('?') ? '&' : '?') + 'v=' + Date.now(); // never show a cached GLB
  const [model, anims] = await Promise.all([load(bust(qs.get('model') || 'dev/mannequin.glb')), load(bust(qs.get('anims') || 'assets/zombies/anims.glb'))]);
  const meta = anims.scene.userData?.clips || anims.parser?.json?.extras?.clips || {};
  // game=1: the game's per-model retarget + the character's pose offsets (local euler degrees after the mixer)
  const game = qs.has('game') && qs.has('model');
  if (game) anims.animations = retargetClips(anims.animations, anims.scene, model.scene);
  const offs = game ? Object.entries(model.scene.userData?.poseOffsets || {}).map(([b, e]) => [b, new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.map((v) => (v || 0) * Math.PI / 180)))]) : [];
  const pelvisY = (root) => { root.updateMatrixWorld(true); const b = root.getObjectByName('pelvis'); return b ? b.getWorldPosition(new THREE.Vector3()).y : 1; };
  const ratio = game ? pelvisY(model.scene) / pelvisY(anims.scene) : 1;   // the game's stride scale for this model
  const applyOffs = (obj) => { for (const [b, q] of offs) { const o = obj.getObjectByName(b); if (o) o.quaternion.multiply(q); } };
  const names = (qs.get('clips') || anims.animations.map((a) => a.name).join(',')).split(',');
  const { dir, right } = viewBasis();
  const spacing = num('spacing', mode === 'onion' ? 0 : view === 'front' || view === 'back' ? 0.95 : 1.25);
  const rowH = num('h', 2.3);
  const across = qs.has('across');
  const labels = [];
  const box = new THREE.Box3();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  names.forEach((name, row) => {
    const origin = across ? right.clone().multiplyScalar(row * (N * spacing + num('gap', 0.9))) : new THREE.Vector3(0, -row * rowH, 0);
    const clip = anims.animations.find((a) => a.name === name);
    if (!clip) { labels.push({ text: `missing clip ${name}`, p: origin.clone() }); return; }
    const info = meta[name] || {};
    const t0 = num('t0', 0), t1 = Math.min(num('t1', clip.duration), clip.duration);
    const loop = info.loop;
    for (let i = 0; i < N; i++) {
      const t = N === 1 ? t0 : loop ? t0 + ((t1 - t0) * i) / N : t0 + ((t1 - t0) * i) / (N - 1);
      const obj = skClone(model.scene);
      obj.traverse((o) => { if (o.isMesh) { if (!qs.has('keepMat')) o.material = mat; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      const mixer = new THREE.AnimationMixer(obj);
      mixer.clipAction(clip).play();
      mixer.setTime(Math.min(t, clip.duration - 1e-4));
      applyOffs(obj);
      const off = right.clone().multiplyScalar(i * spacing).add(origin);
      if (mode === 'onion') off.z += (info.speed || 0) * ratio * t;
      obj.position.copy(off);
      scene.add(obj);
      obj.updateMatrixWorld(true);
      box.expandByObject(obj);
      if (N > 1) labels.push({ text: `${t.toFixed(2)}`, p: off.clone().add(new THREE.Vector3(0, -0.12, 0)) });
    }
    if (mode === 'trail') addTrails(model, clip, info, origin, scene, box, (info.speed || 0) * (game ? ratio : 1), applyOffs);
    // ground strip + 0.25 m grid to judge sliding / penetration
    const len = Math.max(2, (N - 1) * spacing + 2);
    const center = right.clone().multiplyScalar(((N - 1) * spacing) / 2).add(origin);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 1 }));
    g.rotation.x = -Math.PI / 2;
    const deep = 2.4 + (mode === 'onion' ? 4 : 0);
    g.scale.set(Math.abs(right.x) > 0.5 ? len : deep, Math.abs(right.z) > 0.5 ? len : deep, 1);
    g.position.copy(center).add(new THREE.Vector3(0, -0.002, mode === 'onion' ? 1.5 : 0));
    g.receiveShadow = true;
    scene.add(g);
    // grid lines (0.25 m) to judge sliding / penetration
    const grid = new THREE.GridHelper(Math.max(len, 8), Math.max(len, 8) * 4, 0x59616b, 0x4a5058);
    grid.position.copy(g.position).add(new THREE.Vector3(0, 0.001, 0));
    scene.add(grid);
    const title = `${name}  ${clip.duration.toFixed(2)}s${loop ? ' loop' : ''}${info.speed ? `  v=${(info.speed * ratio).toFixed(2)}m/s` : ''}`;
    labels.push({ text: title, big: true, left: true, start: right.clone().multiplyScalar(-0.5).add(origin).add(new THREE.Vector3(0, 2.05, 0)) });
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
  if (qs.has('center')) { c.fromArray(qs.get('center').split(',').map(Number)); h = num('zoom', 0.5); w = 0; }
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
