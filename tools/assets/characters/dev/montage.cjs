// dev: tiles PNGs into a grid: node montage.cjs out.png cols a.png b.png ...
const fs = require('fs');
const { PNG } = require('pngjs');
const [out, colsS, ...files] = process.argv.slice(2);
const cols = +colsS;
const imgs = files.map((f) => PNG.sync.read(fs.readFileSync(f)));
const w = Math.max(...imgs.map((i) => i.width)), h = Math.max(...imgs.map((i) => i.height));
const rows = Math.ceil(imgs.length / cols);
const o = new PNG({ width: w * cols, height: h * rows });
imgs.forEach((im, k) => {
  const x0 = (k % cols) * w, y0 = Math.floor(k / cols) * h;
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
    const s = (y * im.width + x) * 4, d = ((y0 + y) * o.width + x0 + x) * 4;
    for (let c = 0; c < 4; c++) o.data[d + c] = im.data[s + c];
  }
});
fs.writeFileSync(out, PNG.sync.write(o));
console.log(out, o.width, o.height);
