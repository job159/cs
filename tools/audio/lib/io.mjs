// Audio file I/O: decode WAV / OGG Vorbis / MP3 / FLAC -> Buf (Float32, multi-channel), encode Ogg Vorbis (WASM)
// and WAV. Everything is pure JS / WASM (no native binaries).
//
//   const b = await readAudio('x.wav', { sampleRate: 48000 });          // decode + resample
//   const part = await readAudio('long.wav', { start: 2.0, end: 3.5 }); // WAV: reads only that byte range
//   await writeOgg('out.ogg', b, { quality: 0.5 });                     // libvorbis q5 VBR
//   const info = await probe('x.ogg');                                  // cheap header probe
import fs from 'node:fs';
import path from 'node:path';
import { Buf } from './buffer.mjs';
import { resample } from './resample.mjs';

// ---------------------------------------------------------------------------------------------- sniffing
export function sniff(bytes, name = '') {
  const s = (o, n) => String.fromCharCode(...bytes.subarray(o, o + n));
  if (bytes.length >= 12 && s(0, 4) === 'RIFF' && s(8, 4) === 'WAVE') return 'wav';
  if (bytes.length >= 12 && s(0, 4) === 'RF64' && s(8, 4) === 'WAVE') return 'wav';
  if (bytes.length >= 4 && s(0, 4) === 'OggS') return 'ogg';
  if (bytes.length >= 4 && s(0, 4) === 'fLaC') return 'flac';
  if (bytes.length >= 12 && s(0, 4) === 'FORM' && (s(8, 4) === 'AIFF' || s(8, 4) === 'AIFC')) return 'aiff';
  if (bytes.length >= 3 && s(0, 3) === 'ID3') return 'mp3';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'mp3';
  const ext = path.extname(name).toLowerCase().slice(1);
  return { wav: 'wav', ogg: 'ogg', oga: 'ogg', flac: 'flac', mp3: 'mp3', aif: 'aiff', aiff: 'aiff' }[ext] || null;
}

// ---------------------------------------------------------------------------------------------- WAV
/** Parse a WAV header. Works on a partial buffer (first ~64 KB) as long as it contains fmt + data chunk headers. */
export function parseWavHeader(bytes, fileSize = bytes.length) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  let off = 12, fmt = null, dataOffset = -1, dataLength = 0, ds64 = null;
  while (off + 8 <= bytes.length) {
    const id = tag(off);
    let size = dv.getUint32(off + 4, true);
    if (id === 'ds64') ds64 = { dataSize: Number(dv.getBigUint64(off + 16, true)) };
    if (id === 'fmt ') {
      let format = dv.getUint16(off + 8, true);
      const channels = dv.getUint16(off + 10, true);
      const sampleRate = dv.getUint32(off + 12, true);
      const blockAlign = dv.getUint16(off + 20, true);
      const bits = dv.getUint16(off + 22, true);
      if (format === 0xfffe && size >= 40) format = dv.getUint16(off + 32, true); // WAVE_FORMAT_EXTENSIBLE sub-format
      fmt = { format, channels, sampleRate, blockAlign, bits };
    } else if (id === 'data') {
      dataOffset = off + 8;
      if (size === 0xffffffff && ds64) size = ds64.dataSize;
      dataLength = Math.min(size, fileSize - dataOffset);
      break;
    }
    off += 8 + size + (size & 1);
  }
  if (!fmt) throw new Error('WAV: no fmt chunk');
  if (dataOffset < 0) throw new Error('WAV: no data chunk');
  if (fmt.format !== 1 && fmt.format !== 3) throw new Error(`WAV: unsupported format tag ${fmt.format}`);
  const frames = Math.floor(dataLength / fmt.blockAlign);
  return { ...fmt, float: fmt.format === 3, dataOffset, dataLength, frames, duration: frames / fmt.sampleRate };
}

/** Convert interleaved PCM bytes to planar Float32 channels. */
function pcmToFloat(bytes, h, frames) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const { channels, blockAlign, bits, float } = h;
  const bps = bits / 8;
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    const base = i * blockAlign;
    for (let c = 0; c < channels; c++) {
      const o = base + c * bps;
      let v;
      if (float) v = bits === 64 ? dv.getFloat64(o, true) : dv.getFloat32(o, true);
      else if (bits === 16) v = dv.getInt16(o, true) / 32768;
      else if (bits === 24) { let x = bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16); if (x & 0x800000) x |= ~0xffffff; v = x / 8388608; }
      else if (bits === 32) v = dv.getInt32(o, true) / 2147483648;
      else if (bits === 8) v = (bytes[o] - 128) / 128;
      else throw new Error(`WAV: unsupported bit depth ${bits}`);
      out[c][i] = v;
    }
  }
  return out;
}

export function decodeWav(bytes) {
  const h = parseWavHeader(bytes);
  const data = bytes.subarray(h.dataOffset, h.dataOffset + h.frames * h.blockAlign);
  return new Buf(pcmToFloat(data, h, h.frames), h.sampleRate);
}

/** Read only [start, end) seconds of a WAV file from disk (no full-file load). */
export function readWavRange(file, start = 0, end = Infinity) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const head = Buffer.alloc(Math.min(size, 1 << 20));
    fs.readSync(fd, head, 0, head.length, 0);
    const h = parseWavHeader(new Uint8Array(head.buffer, head.byteOffset, head.length), size);
    const f0 = Math.max(0, Math.min(h.frames, Math.floor(start * h.sampleRate)));
    const f1 = Math.max(f0, Math.min(h.frames, Math.ceil(end * h.sampleRate)));
    const n = f1 - f0;
    const raw = Buffer.alloc(n * h.blockAlign);
    if (n) fs.readSync(fd, raw, 0, raw.length, h.dataOffset + f0 * h.blockAlign);
    const data = new Uint8Array(raw.buffer, raw.byteOffset, raw.length);
    return new Buf(n ? pcmToFloat(data, h, n) : Array.from({ length: h.channels }, () => new Float32Array(0)), h.sampleRate);
  } finally { fs.closeSync(fd); }
}

/** Encode a Buf as WAV. bits: 16 | 24 | 32 (float). Dithering is not applied (use 24/32 for intermediates). */
export function encodeWav(buf, { bits = 16 } = {}) {
  const ch = buf.channels, n = buf.length, float = bits === 32;
  const bps = bits / 8, blockAlign = ch * bps, dataLen = n * blockAlign;
  const out = new Uint8Array(44 + dataLen);
  const dv = new DataView(out.buffer);
  const w = (o, s) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); w(8, 'WAVE');
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, float ? 3 : 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, buf.sampleRate, true); dv.setUint32(28, buf.sampleRate * blockAlign, true); dv.setUint16(32, blockAlign, true); dv.setUint16(34, bits, true);
  w(36, 'data'); dv.setUint32(40, dataLen, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = buf.data[c][i];
      if (float) dv.setFloat32(o, v, true);
      else {
        const x = Math.max(-1, Math.min(1, v));
        if (bits === 16) dv.setInt16(o, Math.round(x < 0 ? x * 32768 : x * 32767), true);
        else if (bits === 24) { let y = Math.round(x < 0 ? x * 8388608 : x * 8388607); out[o] = y & 255; out[o + 1] = (y >> 8) & 255; out[o + 2] = (y >> 16) & 255; }
        else throw new Error(`encodeWav: unsupported bits ${bits}`);
      }
      o += bps;
    }
  }
  return out;
}

export function writeWav(file, buf, opts) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodeWav(buf, opts));
}

// ---------------------------------------------------------------------------------------------- AIFF (PCM only)
function decodeAiff(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  let off = 12, comm = null, ssnd = null;
  while (off + 8 <= bytes.length) {
    const id = tag(off), size = dv.getUint32(off + 4, false);
    if (id === 'COMM') {
      const channels = dv.getUint16(off + 8, false), frames = dv.getUint32(off + 10, false), bits = dv.getUint16(off + 14, false);
      // 80-bit extended float sample rate
      const exp = dv.getUint16(off + 16, false) & 0x7fff, hi = dv.getUint32(off + 18, false);
      const sampleRate = Math.round(hi * Math.pow(2, exp - 16383 - 31));
      comm = { channels, frames, bits, sampleRate, comp: tag(8) === 'AIFC' && size >= 22 ? tag(off + 26) : 'NONE' };
    } else if (id === 'SSND') ssnd = off + 16 + dv.getUint32(off + 8, false);
    off += 8 + size + (size & 1);
  }
  if (!comm || ssnd === null) throw new Error('AIFF: missing COMM/SSND');
  const isAifc = tag(8) === 'AIFC';
  const little = isAifc && comm.comp === 'sowt';
  if (isAifc && !['NONE', 'sowt', 'twos'].includes(comm.comp)) throw new Error(`AIFF-C compression ${comm.comp} unsupported`);
  const bps = comm.bits / 8, n = comm.frames;
  const out = Array.from({ length: comm.channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < comm.channels; c++) {
    const o = ssnd + (i * comm.channels + c) * bps;
    let v;
    if (comm.bits === 16) v = dv.getInt16(o, little) / 32768;
    else if (comm.bits === 24) { let x = little ? (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16)) : ((bytes[o] << 16) | (bytes[o + 1] << 8) | bytes[o + 2]); if (x & 0x800000) x |= ~0xffffff; v = x / 8388608; }
    else if (comm.bits === 32) v = dv.getInt32(o, little) / 2147483648;
    else if (comm.bits === 8) v = dv.getInt8(o) / 128;
    else throw new Error(`AIFF: bits ${comm.bits}`);
    out[c][i] = v;
  }
  return new Buf(out, comm.sampleRate);
}

// ---------------------------------------------------------------------------------------------- compressed formats (WASM)
let oggDec = null, mp3Dec = null, flacDec = null;
async function getOggDecoder() {
  if (!oggDec) { const { OggVorbisDecoder } = await import('@wasm-audio-decoders/ogg-vorbis'); oggDec = new OggVorbisDecoder(); await oggDec.ready; }
  else await oggDec.reset();
  return oggDec;
}
async function getMp3Decoder() {
  if (!mp3Dec) { const { MPEGDecoder } = await import('mpg123-decoder'); mp3Dec = new MPEGDecoder(); await mp3Dec.ready; }
  else await mp3Dec.reset();
  return mp3Dec;
}
async function getFlacDecoder() {
  if (!flacDec) { const { FLACDecoder } = await import('@wasm-audio-decoders/flac'); flacDec = new FLACDecoder(); await flacDec.ready; }
  else await flacDec.reset();
  return flacDec;
}

function fromDecoded(r, what) {
  if (!r || !r.channelData?.length || !r.samplesDecoded) throw new Error(`${what}: nothing decoded${r?.errors?.length ? ` (${r.errors[0].message})` : ''}`);
  // copy out of WASM-owned memory and trim to samplesDecoded
  return new Buf(r.channelData.map((c) => Float32Array.from(c.subarray(0, r.samplesDecoded))), r.sampleRate);
}

/** Free the WASM decoders (call at the end of long scripts if memory matters). */
export function freeDecoders() {
  for (const d of [oggDec, mp3Dec, flacDec]) try { d?.free(); } catch { /* ignore */ }
  oggDec = mp3Dec = flacDec = null;
}

/** Decode in-memory file bytes. */
export async function decodeBytes(bytes, name = '') {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const fmt = sniff(bytes, name);
  switch (fmt) {
    case 'wav': return decodeWav(bytes);
    case 'aiff': return decodeAiff(bytes);
    case 'ogg': return fromDecoded(await (await getOggDecoder()).decodeFile(bytes), 'ogg');
    case 'mp3': { const d = await getMp3Decoder(); return fromDecoded(d.decode(bytes), 'mp3'); }
    case 'flac': return fromDecoded(await (await getFlacDecoder()).decodeFile(bytes), 'flac');
    default: throw new Error(`unknown audio format: ${name}`);
  }
}

/**
 * Read + decode an audio file. opts:
 *   sampleRate: resample to this rate (default: keep)       channels: 1 = downmix to mono, 2 = up/down to stereo
 *   start, end: seconds (WAV reads only that range; other formats decode fully then slice)
 */
export async function readAudio(file, { sampleRate, channels, start = 0, end = Infinity } = {}) {
  let buf;
  if (/\.wav$/i.test(file)) buf = readWavRange(file, start, end);
  else {
    buf = await decodeBytes(fs.readFileSync(file), file);
    if (start > 0 || end < buf.duration) {
      const a = Math.round(start * buf.sampleRate), b = Math.min(buf.length, Math.round(end * buf.sampleRate));
      buf = new Buf(buf.data.map((d) => d.slice(a, Math.max(a, b))), buf.sampleRate);
    }
  }
  if (channels === 1 && buf.channels > 1) {
    const n = buf.length, m = new Float32Array(n), k = 1 / buf.channels;
    for (const d of buf.data) for (let i = 0; i < n; i++) m[i] += d[i] * k;
    buf = new Buf([m], buf.sampleRate);
  } else if (channels === 2 && buf.channels === 1) buf = new Buf([buf.data[0], buf.data[0].slice()], buf.sampleRate);
  else if (channels === 2 && buf.channels > 2) buf = new Buf([buf.data[0], buf.data[1]], buf.sampleRate);
  if (sampleRate && sampleRate !== buf.sampleRate) buf = resample(buf, sampleRate);
  return buf;
}

/** Cheap metadata probe. WAV/FLAC/OGG read headers only; MP3/AIFF fall back to a full decode. */
export async function probe(file) {
  const size = fs.statSync(file).size;
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(Math.min(size, 1 << 16));
  fs.readSync(fd, head, 0, head.length, 0);
  const u8 = new Uint8Array(head.buffer, head.byteOffset, head.length);
  const fmt = sniff(u8, file);
  try {
    if (fmt === 'wav') {
      const h = parseWavHeader(u8, size);
      return { format: 'wav', sampleRate: h.sampleRate, channels: h.channels, bits: h.bits, float: h.float, duration: h.duration, frames: h.frames, bytes: size };
    }
    if (fmt === 'flac') {
      // STREAMINFO is the first metadata block: 18 bytes in, sample rate 20 bits, channels 3, bps 5, total samples 36
      const b = u8.subarray(8);
      const sampleRate = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4);
      const channels = ((b[12] >> 1) & 7) + 1;
      const bits = (((b[12] & 1) << 4) | (b[13] >> 4)) + 1;
      const frames = (b[13] & 15) * 2 ** 32 + ((b[14] << 24) >>> 0) + (b[15] << 16) + (b[16] << 8) + b[17];
      return { format: 'flac', sampleRate, channels, bits, duration: frames / sampleRate, frames, bytes: size };
    }
    if (fmt === 'ogg') {
      // identification header: "\x01vorbis" at page payload; channels @ +11, rate @ +12
      const i = u8.indexOf(0x76); // 'v'
      const idx = Buffer.from(head).indexOf('vorbis');
      if (idx > 0 && i >= 0) {
        const channels = u8[idx + 10], sampleRate = new DataView(u8.buffer, u8.byteOffset).getUint32(idx + 11, true);
        // last page granule position = total samples
        const tailLen = Math.min(size, 65536);
        const tail = Buffer.alloc(tailLen);
        fs.readSync(fd, tail, 0, tailLen, size - tailLen);
        const p = tail.lastIndexOf('OggS');
        let frames = 0;
        if (p >= 0 && p + 14 <= tail.length) frames = Number(tail.readBigInt64LE(p + 6));
        return { format: 'ogg', sampleRate, channels, duration: frames / sampleRate, frames, bytes: size };
      }
    }
  } finally { fs.closeSync(fd); }
  const b = await decodeBytes(fs.readFileSync(file), file);
  return { format: fmt, sampleRate: b.sampleRate, channels: b.channels, duration: b.duration, frames: b.length, bytes: size };
}

// ---------------------------------------------------------------------------------------------- Ogg Vorbis encoding
let oggEnc = null;
async function getOggEncoder() {
  if (!oggEnc) { const { createOggEncoder } = await import('wasm-media-encoders'); oggEnc = await createOggEncoder(); }
  return oggEnc;
}

/**
 * Encode a Buf to Ogg Vorbis. quality: libvorbis-style 0..1 (0.5 = "q5", ~110-160 kbps stereo); or vbrQuality -1..10 directly.
 * Mono or stereo only. Samples are clamped to [-1, 1].
 */
export async function encodeOgg(buf, { quality = 0.5, vbrQuality } = {}) {
  if (buf.channels < 1 || buf.channels > 2) throw new Error(`encodeOgg: ${buf.channels} channels (only 1 or 2 supported)`);
  const enc = await getOggEncoder();
  enc.configure({ channels: buf.channels, sampleRate: buf.sampleRate, vbrQuality: vbrQuality ?? quality * 10 });
  const chunks = [];
  let total = 0;
  const BLOCK = 16384;
  const tmp = Array.from({ length: buf.channels }, () => new Float32Array(BLOCK));
  for (let i = 0; i < buf.length; i += BLOCK) {
    const n = Math.min(BLOCK, buf.length - i);
    const parts = tmp.map((t, c) => {
      const v = n === BLOCK ? t : new Float32Array(n);
      const src = buf.data[c];
      for (let k = 0; k < n; k++) { const x = src[i + k]; v[k] = x > 1 ? 1 : x < -1 ? -1 : x; }
      return v;
    });
    const out = enc.encode(parts);
    if (out.length) { chunks.push(out.slice()); total += out.length; }
  }
  const fin = enc.finalize();
  if (fin.length) { chunks.push(fin.slice()); total += fin.length; }
  const res = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { res.set(c, o); o += c.length; }
  return res;
}

export async function writeOgg(file, buf, opts) {
  const bytes = await encodeOgg(buf, opts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return bytes;
}
