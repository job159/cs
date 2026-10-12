// Placeholder test arena used while the real map is being built: floor, crates, ramps, stairs, a wall.
import * as THREE from 'three';
import { SURF } from '../collision.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

function gridTexture(c1, c2, lines = 8) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = c1; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = c2; g.lineWidth = 2;
  for (let i = 0; i <= lines; i++) {
    const p = (i / lines) * 256;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(256, p); g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export async function build({ root, game }) {
  if (game) {
    const pmrem = new THREE.PMREMGenerator(game.renderer.gl);
    game.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    game.scene.environmentIntensity = 0.55;
  }
  const colliders = [];
  const floorTex = gridTexture('#6b6a64', '#55544f', 4);
  floorTex.repeat.set(40, 40);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0 }));
  floor.receiveShadow = true;
  root.add(floor);
  colliders.push(floor);

  const crateTex = gridTexture('#8a6a43', '#5e462b', 2);
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.8 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8d8a80, roughness: 0.95 });
  const add = (w, h, d, x, y, z, mat = crateMat, surf = SURF.wood, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    m.userData.surf = surf;
    root.add(m);
    colliders.push(m);
    return m;
  };
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 9 + (i % 3) * 5;
    add(1.2, 1.2, 1.2, Math.cos(a) * r, 0, Math.sin(a) * r, crateMat, SURF.wood, a);
    if (i % 2) add(1.2, 1.2, 1.2, Math.cos(a) * r, 1.2, Math.sin(a) * r, crateMat, SURF.wood, a + 0.3);
  }
  // perimeter wall
  for (let i = 0; i < 4; i++) {
    const s = i < 2 ? 1 : -1;
    if (i % 2 === 0) add(80, 6, 1, 0, 0, s * 40, wallMat, SURF.concrete);
    else add(1, 6, 80, s * 40, 0, 0, wallMat, SURF.concrete);
  }
  // raised platform with stairs (collision ramp under visual steps)
  add(8, 2.2, 8, -18, 0, -18, wallMat, SURF.concrete);
  for (let i = 0; i < 8; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(3, 0.275 * (i + 1), 0.4), wallMat);
    st.position.set(-18, 0.1375 * (i + 1), -13.8 + i * -0.0 + (7 - i) * 0.4 + 0.0);
    st.castShadow = st.receiveShadow = true;
    root.add(st);
  }
  const ramp = new THREE.Mesh(new THREE.PlaneGeometry(3, Math.hypot(3.2, 2.2)), new THREE.MeshBasicMaterial({ visible: false }));
  ramp.rotation.x = -Math.PI / 2 + Math.atan2(2.2, 3.2);
  ramp.position.set(-18, 1.1, -12.4);
  root.add(ramp);
  colliders.push(ramp);

  // lighting
  const hemi = new THREE.HemisphereLight(0xbcd2ff, 0x4a3f33, 0.9);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2bf, 3.2);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  root.add(sun, sun.target);

  return {
    colliders,
    playerSpawns: [new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(2, 0.05, 0), new THREE.Vector3(-2, 0.05, 0), new THREE.Vector3(0, 0.05, 2)],
    zombieSpawns: [new THREE.Vector3(30, 0, 30), new THREE.Vector3(-30, 0, 30), new THREE.Vector3(30, 0, -30), new THREE.Vector3(-30, 0, -30)],
    sun,
  };
}
