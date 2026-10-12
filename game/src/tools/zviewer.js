// Zombie / character QA viewer (dev):
//   index.html?view=zombie&id=walker_a[&lod=1][&grid=1][&anim=walk_a&t=0.3][&cam=face|upper|feet][&yaw=35&pitch=5]
//             [&pose=upperarm_l:0,0,-60;lowerarm_l:0,0,-90][&wpose=test | &wpose=upperarm_l:0,0,80]
//             [&noOffsets=1][&bg=#55595e][&wire=1][&seg=1][&bones=1][&play=1]
// grid=1 renders a 2x2 sheet (front, front 3/4, side, back). anim/t poses a clip from assets/zombies/anims.glb
// (retargeted on load if that file's rest frames differ, see zretarget.js). pose= adds local euler rotations
// (degrees, XYZ, applied after the clip), wpose= rotations about WORLD axes (wpose=test: stress pose with
// raised arms, bent elbows/knees, twisted torso) for skinning QA. extras.poseOffsets are applied like the game
// would (after the clip). seg=1 colours vertices by the _seg dismemberment attribute, bones=1 draws the skeleton.
// window.__shotReady flips true once rendered; window.__zv exposes the scene for --eval scripts.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadGLB } from '../engine/assets.js';
import { retargetClips } from './zretarget.js';

// Skinning stress pose, as WORLD-axis rotations (degrees about world X, Y, Z; applied parent-first):
// left arm raised sideways above the shoulder with the elbow bent 100 deg forward and the forearm twisted,
// right arm reaching forward-up with a bent elbow, left leg lifted forward with a deep knee bend,
// torso twisted and the head turned.
const TEST_WPOSE = {
  spine_02: [0, 12, 0], spine_03: [8, 14, 0], neck_01: [0, 15, 0], head: [-10, 20, 0],
  upperarm_l: [0, 0, 95], lowerarm_l: [0, -100, 0], hand_l: [60, 0, 0],
  upperarm_r: [-100, 0, 0], lowerarm_r: [-70, 0, 0], hand_r: [0, 0, -40],
  thigh_l: [-85, 0, 0], calf_l: [110, 0, 0], foot_l: [-20, 0, 0],
  thigh_r: [20, 0, 0], calf_r: [45, 0, 0],
};

const SEG_COLORS = [0x9a9a9a, 0xff4040, 0x40a0ff, 0x2050c0, 0x40ff80, 0x20a040, 0xffc040, 0xc08020, 0xff60ff, 0xa030a0];

function parsePose(s) {
  if (!s) return {};
  const out = {};
  for (const part of s.split(';')) {
    const [bone, v] = part.split(':');
    if (bone && v) out[bone.trim()] = v.split(',').map(Number);
  }
  return out;
}

async function tryLoad(path) {
  try { return await loadGLB(path); } catch { return null; }
}

export async function runZombieViewer(renderer, params) {
  const id = params.get('id') || 'walker_a';
  const lod = params.get('lod') === '1';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(params.get('bg') || '#585c61');
  const pmrem = new THREE.PMREMGenerator(renderer.gl);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = +(params.get('envi') || 0.55);
  const key = new THREE.DirectionalLight(0xfff0e0, +(params.get('key') || 2.6));
  key.position.set(1.6, 3.2, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 2.2, bottom: -0.4, near: 0.5, far: 10 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc8d8ff, +(params.get('rim') || 1.4));
  rim.position.set(-2, 2.2, -2.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-2.5, 1.2, 2);
  scene.add(fill);
  renderer.gl.shadowMap.enabled = true;
  renderer.gl.shadowMap.type = THREE.PCFSoftShadowMap;

  const gltf = await loadGLB(`zombies/${id}${lod ? '_lod1' : ''}.glb`);
  const model = gltf.scene; // viewer owns it (single use)
  const info = { id, tris: 0, meshes: [], materials: new Set(), bones: 0, extras: model.userData };
  let skeleton = null;
  model.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = false;
      skeleton = o.skeleton;
      info.tris += o.geometry.index.count / 3;
      info.meshes.push(o.name);
      info.materials.add(o.material.name);
      if (params.get('wire')) o.material.wireframe = true;
      if (params.get('seg')) {
        const seg = o.geometry.getAttribute('_seg');
        const col = new Float32Array(o.geometry.attributes.position.count * 3);
        const c = new THREE.Color();
        for (let i = 0; i < col.length / 3; i++) { c.setHex(SEG_COLORS[seg ? seg.getX(i) : 0]); c.toArray(col, i * 3); }
        o.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
        o.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
      }
    }
  });
  info.bones = skeleton ? skeleton.bones.length : 0;
  scene.add(model);
  if (params.get('bones') && skeleton) {
    const helper = new THREE.SkeletonHelper(model);
    helper.material.depthTest = false;
    helper.material.linewidth = 2;
    scene.add(helper);
  }

  // animation
  let mixer = null, clipInfo = '';
  const animName = params.get('anim');
  if (animName) {
    const lib = await tryLoad('zombies/anims.glb');
    if (!lib) clipInfo = 'anims.glb missing';
    else {
      const clips = retargetClips(lib.animations, lib.scene, model);
      const clip = clips.find((c) => c.name === animName);
      if (!clip) clipInfo = `clip ${animName} missing (${clips.map((c) => c.name).join(',')})`;
      else {
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(clip).play();
        mixer.setTime(Math.min(0.999, +(params.get('t') || 0)) * clip.duration);
        clipInfo = `${animName} ${(+(params.get('t') || 0)).toFixed(2)} / ${clip.duration.toFixed(2)}s`;
      }
    }
  }
  // extras.poseOffsets (e.g. the 'hunched' preset) are additive local rotations the game applies after the
  // animation mixer each frame; pose= adds debug rotations on top. noOffsets=1 shows the raw clip.
  const applyPose = () => {
    const e = new THREE.Euler(), q = new THREE.Quaternion();
    const add = (pose) => {
      for (const [bone, deg] of Object.entries(pose || {})) {
        const b = model.getObjectByName(bone);
        if (!b) continue;
        e.set(deg[0] * Math.PI / 180, (deg[1] || 0) * Math.PI / 180, (deg[2] || 0) * Math.PI / 180);
        b.quaternion.multiply(q.setFromEuler(e));
      }
    };
    if (!params.get('noOffsets')) add(model.userData.poseOffsets);
    add(parsePose(params.get('pose')));
    // world-axis rotations: new local = P^-1 * R * P * local (P = parent world rotation), parents first
    const wp = params.get('wpose') === 'test' || params.get('pose') === 'test' ? TEST_WPOSE : parsePose(params.get('wpose'));
    const P = new THREE.Quaternion(), R = new THREE.Quaternion();
    for (const b of skeleton ? skeleton.bones : []) {
      const deg = wp[b.name];
      if (!deg) continue;
      b.parent.updateWorldMatrix(true, false);
      b.parent.getWorldQuaternion(P);
      R.setFromEuler(e.set(deg[0] * Math.PI / 180, (deg[1] || 0) * Math.PI / 180, (deg[2] || 0) * Math.PI / 180));
      b.quaternion.premultiply(P.clone().invert().multiply(R).multiply(P));
    }
  };
  applyPose();
  model.updateMatrixWorld(true);

  // framing
  const height = model.userData.height || 1.75;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: 0x4a4d50, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
  const camMode = params.get('cam') || 'full';
  const head = model.getObjectByName('head');
  const headPos = head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, height - 0.12, 0);
  const frames = {
    full: { target: new THREE.Vector3(0, height * 0.5, 0), dist: height * 2.15, fov: 30 },
    upper: { target: new THREE.Vector3(0, height * 0.74, 0), dist: height * 1.05, fov: 30 },
    face: { target: headPos.clone().add(new THREE.Vector3(0, 0.07, 0)), dist: 0.62, fov: 30 },
    feet: { target: new THREE.Vector3(0, 0.2, 0), dist: 1.1, fov: 30 },
  };
  const fr = frames[camMode] || frames.full;
  const cam = new THREE.PerspectiveCamera(fr.fov, 1, 0.02, 50);
  const views = params.get('grid')
    ? [[0, 4], [35, 6], [90, 4], [180, 6]]
    : [[+(params.get('yaw') || 25), +(params.get('pitch') || 4)]];
  const W = window.innerWidth, H = window.innerHeight;
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
  renderer.post.vignette = 0.12;
  renderer.post.grain = 0;
  renderer.post.bloomStrength = 0.03;

  const draw = () => {
    views.forEach(([yaw, pitch], i) => {
      const y = (yaw * Math.PI) / 180, p = (pitch * Math.PI) / 180;
      const d = fr.dist / Math.max(0.6, Math.min(1, cam.aspect));
      cam.position.set(Math.sin(y) * Math.cos(p) * d, Math.sin(p) * d, Math.cos(y) * Math.cos(p) * d).add(fr.target);
      cam.lookAt(fr.target);
      renderer.render(scene, cam, 0);
      ctx.drawImage(renderer.canvas, (i % cols) * vw, Math.floor(i / cols) * vh, vw, vh);
    });
    const label = `${id}${lod ? ' LOD1' : ''}  ${Math.round(info.tris)} tris  ${info.bones} bones  [${[...info.materials].join(',')}]  h=${height.toFixed(2)}m  ${clipInfo}`;
    ctx.font = '13px monospace';
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, ctx.measureText(label).width + 12, 22);
    ctx.fillStyle = '#fff'; ctx.fillText(label, 6, 15);
  };
  document.body.appendChild(out);
  document.getElementById('boot')?.remove();
  for (const el of document.querySelectorAll('#hud,#ui')) el.style.display = 'none';
  draw();
  window.__zv = { scene, model, cam, draw, info, mixer, applyPose };
  window.__shotReady = true;
  if (params.get('play') && mixer) {
    let last = performance.now();
    const loop = (t) => { mixer.update((t - last) / 1000); last = t; applyPose(); draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}
