// Weapon silhouette icons (CS kill-feed / HUD style) rendered from the real weapon models: an
// orthographic side view drawn in flat white, cropped and cached as data URLs.
import * as THREE from 'three';
import { instanceGLB } from '../engine/assets.js';

const cache = new Map();
const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });

export async function weaponIcon(renderer, id, { w = 256, h = 96 } = {}) {
  const key = `${id}:${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    let model;
    try { model = await instanceGLB(`weapons/${id}.glb`); } catch { return null; }
    model.traverse((o) => { if (o.isMesh) o.material = mat; if (o.userData?.restHidden) o.visible = false; });
    const scene = new THREE.Scene();
    scene.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    // orthographic side view (from +X): the muzzle (-Z) points to the right of the image
    const aspect = w / h;
    const halfW = Math.max(size.z / 2, (size.y / 2) * aspect) * 1.04;
    const cam = new THREE.OrthographicCamera(-halfW, halfW, halfW / aspect, -halfW / aspect, 0.01, 10);
    cam.position.set(c.x + 2, c.y, c.z); // right side, muzzle points right like CS kill-feed icons
    cam.lookAt(c);
    const rt = new THREE.WebGLRenderTarget(w, h);
    const gl = renderer.gl;
    const prevTarget = gl.getRenderTarget();
    const prevClear = gl.getClearColor(new THREE.Color()), prevAlpha = gl.getClearAlpha();
    gl.setRenderTarget(rt);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(scene, cam);
    const px = new Uint8Array(w * h * 4);
    gl.readRenderTargetPixels(rt, 0, 0, w, h, px);
    gl.setRenderTarget(prevTarget);
    gl.setClearColor(prevClear, prevAlpha);
    rt.dispose();
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4;
        const on = px[s] > 20;
        img.data[d] = img.data[d + 1] = img.data[d + 2] = 255;
        img.data[d + 3] = on ? 255 : 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  })();
  cache.set(key, p);
  return p;
}
