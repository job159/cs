// Minimal baseline JPEG encoder (pure JS, no dependencies) for the map texture pipeline.
//   encodeJPEG({ width, height, data, channels = 4 }, { quality = 85, subsample = true }) -> Buffer
// `data` is 8-bit RGB(A) in row-major order (row 0 = top). subsample=true -> 4:2:0 chroma (diffuse maps);
// use subsample=false (4:4:4) for normal / ARM maps where chroma carries data.
// Standard IJG quantisation tables scaled by quality and the Annex K Huffman tables.

const ZIGZAG = (() => {
  // natural index for each zig-zag position
  const out = [];
  for (let s = 0; s < 15; s++) {
    const cells = [];
    for (let y = 0; y < 8; y++) { const x = s - y; if (x >= 0 && x < 8) cells.push([x, y]); }
    if (s % 2 === 0) cells.reverse(); // even diagonals run bottom-left -> top-right
    for (const [x, y] of cells) out.push(y * 8 + x);
  }
  return out;
})();

const STD_LUM_Q = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const STD_CHR_Q = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99, ...new Array(32).fill(99),
];

const DC_LUM_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_LUM_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const DC_CHR_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const DC_CHR_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_LUM_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_LUM_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];
const AC_CHR_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
const AC_CHR_VALS = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
  0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
  0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
  0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
  0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

/** Huffman code table: symbol -> [code, length]. Also validates the table covers every AC/DC symbol. */
function buildHuff(bits, vals, isAC) {
  const table = new Array(256);
  let code = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < bits[len - 1]; i++) table[vals[k++]] = [code++, len];
    code <<= 1;
  }
  if (k !== vals.length) throw new Error('jpeg: huffman table size mismatch');
  if (isAC) {
    const need = [0x00, 0xf0];
    for (let r = 0; r < 16; r++) for (let s = 1; s <= 10; s++) need.push((r << 4) | s);
    for (const s of need) if (!table[s]) throw new Error('jpeg: AC table misses symbol ' + s.toString(16));
  }
  return table;
}
const H_DC_LUM = buildHuff(DC_LUM_BITS, DC_LUM_VALS, false);
const H_DC_CHR = buildHuff(DC_CHR_BITS, DC_CHR_VALS, false);
const H_AC_LUM = buildHuff(AC_LUM_BITS, AC_LUM_VALS, true);
const H_AC_CHR = buildHuff(AC_CHR_BITS, AC_CHR_VALS, true);

// DCT basis: C[u*8+x] = c(u)/2 * cos((2x+1) u pi / 16)
const DCT = new Float64Array(64);
for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) {
  DCT[u * 8 + x] = (u === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
}

function scaleQ(base, quality) {
  quality = Math.max(1, Math.min(100, quality));
  const s = quality < 50 ? 5000 / quality : 200 - quality * 2;
  return base.map((q) => Math.max(1, Math.min(255, Math.floor((q * s + 50) / 100))));
}

class BitWriter {
  constructor(cap) { this.buf = Buffer.alloc(cap); this.n = 0; this.acc = 0; this.bits = 0; }
  _byte(b) {
    if (this.n + 2 > this.buf.length) { const nb = Buffer.alloc(this.buf.length * 2); this.buf.copy(nb); this.buf = nb; }
    this.buf[this.n++] = b;
    if (b === 0xff) this.buf[this.n++] = 0;
  }
  write(code, len) {
    this.acc = (this.acc << len) | (code & ((1 << len) - 1));
    this.bits += len;
    while (this.bits >= 8) { this.bits -= 8; this._byte((this.acc >>> this.bits) & 0xff); }
    this.acc &= (1 << this.bits) - 1;
  }
  flush() { if (this.bits > 0) this.write(0x7f, 8 - this.bits); }
  out() { return this.buf.subarray(0, this.n); }
}

const _tmp = new Float64Array(64);
const _coef = new Float64Array(64);
function fdct(block) {
  // rows
  for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) {
    let s = 0;
    for (let x = 0; x < 8; x++) s += DCT[u * 8 + x] * block[y * 8 + x];
    _tmp[y * 8 + u] = s;
  }
  // columns
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) {
    let s = 0;
    for (let y = 0; y < 8; y++) s += DCT[v * 8 + y] * _tmp[y * 8 + u];
    _coef[v * 8 + u] = s;
  }
  return _coef;
}

function catBits(v) { let a = v < 0 ? -v : v, n = 0; while (a) { n++; a >>= 1; } return n; }

function encodeBlock(w, block, q, prevDC, hdc, hac) {
  const c = fdct(block);
  const zz = new Int32Array(64);
  for (let k = 0; k < 64; k++) { const i = ZIGZAG[k]; zz[k] = Math.round(c[i] / q[i]); }
  const diff = zz[0] - prevDC;
  const s = catBits(diff);
  w.write(hdc[s][0], hdc[s][1]);
  if (s) w.write(diff < 0 ? diff + (1 << s) - 1 : diff, s);
  let run = 0;
  for (let k = 1; k < 64; k++) {
    const v = zz[k];
    if (v === 0) { run++; continue; }
    while (run > 15) { w.write(hac[0xf0][0], hac[0xf0][1]); run -= 16; }
    const sz = catBits(v);
    const sym = (run << 4) | sz;
    w.write(hac[sym][0], hac[sym][1]);
    w.write(v < 0 ? v + (1 << sz) - 1 : v, sz);
    run = 0;
  }
  if (run > 0) w.write(hac[0][0], hac[0][1]);
  return zz[0];
}

export function encodeJPEG(img, opts = {}) {
  const { width: W, height: H, data } = img;
  const ch = img.channels || (data.length / (W * H) >= 4 ? 4 : 3);
  const quality = opts.quality ?? 85;
  const sub = opts.subsample ?? true;
  const qy = scaleQ(STD_LUM_Q, quality), qc = scaleQ(STD_CHR_Q, quality);

  // YCbCr planes (level shifted)
  const Y = new Float32Array(W * H), Cb = new Float32Array(W * H), Cr = new Float32Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += ch) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
    Cb[i] = -0.168736 * r - 0.331264 * g + 0.5 * b;
    Cr[i] = 0.5 * r - 0.418688 * g - 0.081312 * b;
  }
  const mcu = sub ? 16 : 8;
  const mx = Math.ceil(W / mcu), my = Math.ceil(H / mcu);
  const w = new BitWriter(Math.max(1 << 16, W * H));
  const block = new Float64Array(64);
  const sample = (plane, x, y) => plane[Math.min(H - 1, y) * W + Math.min(W - 1, x)];
  let dcY = 0, dcB = 0, dcR = 0;
  for (let by = 0; by < my; by++) for (let bx = 0; bx < mx; bx++) {
    const x0 = bx * mcu, y0 = by * mcu;
    if (sub) {
      for (const [ox, oy] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) block[y * 8 + x] = sample(Y, x0 + ox + x, y0 + oy + y);
        dcY = encodeBlock(w, block, qy, dcY, H_DC_LUM, H_AC_LUM);
      }
      for (const [plane, which] of [[Cb, 0], [Cr, 1]]) {
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const sx = x0 + x * 2, sy = y0 + y * 2;
          block[y * 8 + x] = (sample(plane, sx, sy) + sample(plane, sx + 1, sy) + sample(plane, sx, sy + 1) + sample(plane, sx + 1, sy + 1)) * 0.25;
        }
        if (which === 0) dcB = encodeBlock(w, block, qc, dcB, H_DC_CHR, H_AC_CHR);
        else dcR = encodeBlock(w, block, qc, dcR, H_DC_CHR, H_AC_CHR);
      }
    } else {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) block[y * 8 + x] = sample(Y, x0 + x, y0 + y);
      dcY = encodeBlock(w, block, qy, dcY, H_DC_LUM, H_AC_LUM);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) block[y * 8 + x] = sample(Cb, x0 + x, y0 + y);
      dcB = encodeBlock(w, block, qc, dcB, H_DC_CHR, H_AC_CHR);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) block[y * 8 + x] = sample(Cr, x0 + x, y0 + y);
      dcR = encodeBlock(w, block, qc, dcR, H_DC_CHR, H_AC_CHR);
    }
  }
  w.flush();
  const scan = w.out();

  const parts = [];
  const u16 = (v) => [(v >> 8) & 0xff, v & 0xff];
  parts.push(Buffer.from([0xff, 0xd8]));
  parts.push(Buffer.from([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
  const dqt = [0xff, 0xdb, ...u16(2 + 65 * 2), 0, ...ZIGZAG.map((i) => qy[i]), 1, ...ZIGZAG.map((i) => qc[i])];
  parts.push(Buffer.from(dqt));
  const samp = sub ? 0x22 : 0x11;
  parts.push(Buffer.from([0xff, 0xc0, ...u16(17), 8, ...u16(H), ...u16(W), 3, 1, samp, 0, 2, 0x11, 1, 3, 0x11, 1]));
  const dht = [];
  for (const [cls, bits, vals] of [[0x00, DC_LUM_BITS, DC_LUM_VALS], [0x10, AC_LUM_BITS, AC_LUM_VALS], [0x01, DC_CHR_BITS, DC_CHR_VALS], [0x11, AC_CHR_BITS, AC_CHR_VALS]]) {
    dht.push(cls, ...bits, ...vals);
  }
  parts.push(Buffer.from([0xff, 0xc4, ...u16(2 + dht.length), ...dht]));
  parts.push(Buffer.from([0xff, 0xda, ...u16(12), 3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]));
  parts.push(Buffer.from(scan));
  parts.push(Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}
