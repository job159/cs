// Albedo value tracing for look-dev (no effect on the output). With ZOMBIE_ALBEDO_TRACE=1 a type builder can
// snapshot an albedo at each painting stage and print, at the end, the sRGB average over the texels the part
// really paints (its kept UV triangles, alpha-cut texels excluded) — the same measure as tools/assets/zombies/
// albedo.mjs on the shipped GLB, so it shows which stage darkens a texture and by how much.
//   const tr = albedoTracer('walker_a'); tr.snap('skin: graded source', img, body); ... tr.report();
import { rasterUV } from './raster.mjs';
import { resize } from './image.mjs';

export function albedoTracer(name) {
  const on = !!process.env.ZOMBIE_ALBEDO_TRACE;
  const snaps = [];
  return {
    on,
    /** Store a downscaled copy (<= 512 px) of `img` to be measured against `part`'s UV coverage at report time. */
    snap(label, img, part) {
      if (!on || !img) return;
      const s = Math.min(512, img.width);
      snaps.push({ label, img: resize(img, s, s), part });
    },
    report() {
      if (!on) return;
      const masks = new Map();
      console.log(`albedo trace ${name} (sRGB mean of R,G,B over painted texels):`);
      for (const { label, img, part } of snaps) {
        const W = img.width, key = `${part.name}|${W}`;
        if (!masks.has(key)) masks.set(key, rasterUV(part.tris(), part.obj.uvs, W, 0).covered);
        const m = masks.get(key);
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < W * W; i++) {
          if (!m[i] || img.data[i * 4 + 3] < 128) continue;
          r += img.data[i * 4]; g += img.data[i * 4 + 1]; b += img.data[i * 4 + 2]; n++;
        }
        n = Math.max(1, n);
        console.log(`  ${label.padEnd(44)} ${((r + g + b) / 3 / n).toFixed(1).padStart(6)}   rgb ${(r / n).toFixed(0)}/${(g / n).toFixed(0)}/${(b / n).toFixed(0)}`);
      }
    },
  };
}
