// Weapon silhouette icons (CS kill-feed / HUD style) rendered from the real weapon models: an
// orthographic side view drawn in flat white, cropped and cached as data URLs.
import * as THREE from 'three';
import { instanceGLB } from '../engine/assets.js';
import { WEAPONS } from '../weapons/defs.js';

const cache = new Map();
const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });

export async function weaponIcon(renderer, id, { w = 256, h = 96 } = {}) {
  const key = `${id}:${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    let model;
    try { model = await instanceGLB(`weapons/${id}.glb`); } catch { return null; }
    model.traverse((o) => { if (o.isMesh) o.material = mat; if (o.userData?.restHidden) o.visible = false; });
    // def.icon { roll (deg about the side axis), zoom }: framing for shapes a side view loses (a 1.9 m upright bow is a
    // hairline in a 256 x 96 strip; rolled 90 deg it lies along the strip)
    const iv = Object.values(WEAPONS).find((d) => (d.model || d.id) === id && d.icon)?.icon;
    if (iv?.roll) { model.rotation.x = iv.roll * Math.PI / 180; model.updateMatrixWorld(true); }
    const scene = new THREE.Scene();
    scene.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    // orthographic side view (from +X): the muzzle (-Z) points to the right of the image
    const aspect = w / h;
    const halfW = Math.max(size.z / 2, (size.y / 2) * aspect) * 1.04 / (iv?.zoom || 1);
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
    // Read back without blocking: the GPU finishes the frame first (gpuDrain, a polled fence), then the read itself is
    // async too. A sync read waited on the main thread for the whole GPU queue -- in a match load, its uploads and
    // shader builds: 0.5-1.8 s per icon.
    gl.setRenderTarget(prevTarget);
    gl.setClearColor(prevClear, prevAlpha);
    try {
      await renderer.gpuDrain?.();
      await gl.readRenderTargetPixelsAsync(rt, 0, 0, w, h, px);
    } finally { rt.dispose(); }
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    // (a CPU canvas: toDataURL of a GPU-backed one waits for the GPU process as well)
    const ctx = cv.getContext('2d', { willReadFrequently: true });
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
