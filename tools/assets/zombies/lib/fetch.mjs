// Download cache for the zombie pipeline. Everything lands under tools/assets/zombies/src/ (git-ignored)
// and is fetched lazily on first use, so a fresh checkout only needs network access once.
//   mpfb2(path)                 -> local path of src/mpfb/data/<path> from the MPFB2 repo (CC0 assets only)
//   zipEntry(pack, name)        -> local path of one file inside an official MakeHuman asset-pack zip,
//                                  extracted with HTTP Range requests (the packs are 130-270 MB; we only
//                                  pull the few files we use).
//   zipList(pack)               -> cached central directory listing [{name, size, csize, method, offset}]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const ZROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = path.join(ZROOT, 'src');
const UA = 'calamity-front-asset-fetcher/1.0 (+CC0 zombie pipeline)';

const MPFB2_RAW = 'https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/src/mpfb/data/';
export const PACKS = {
  system: 'https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip',
  skins03: 'https://files.makehumancommunity.org/asset_packs/skins03/skins03_cc0.zip',
  skins01: 'https://files.makehumancommunity.org/asset_packs/skins01/skins01_cc0.zip',
  skins02: 'https://files.makehumancommunity.org/asset_packs/skins02/skins02_cc0.zip',
};
/** Every source file a build touched: Set of 'pack:folder' / 'mpfb2:group' keys (see credits.mjs). */
export const usage = new Set();

const MIRRORS = [(u) => u, (u) => u.replace('://files.', '://files2.')];

async function get(url, headers = {}, tries = 4) {
  let err;
  for (let i = 0; i < tries; i++) {
    for (const m of MIRRORS) {
      try {
        const r = await fetch(m(url), { headers: { 'User-Agent': UA, ...headers } });
        if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status} ${m(url)}`);
        return Buffer.from(await r.arrayBuffer());
      } catch (e) { err = e; }
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw err;
}

function writeAtomic(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.part';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
}

/** Local path of an MPFB2 data file (relative to src/mpfb/data/), downloading it on first use. */
export async function mpfb2(rel) {
  const file = path.join(SRC, 'mpfb2', rel);
  const parts = rel.split('/');
  usage.add('mpfb2:' + (parts[0] === 'targets' ? parts.slice(0, 2).join('/').replace(/.json$/, '') : parts[0] === 'rigs' ? 'rigs/standard' : parts[0]));
  if (!fs.existsSync(file)) {
    const buf = await get(MPFB2_RAW + rel);
    writeAtomic(file, buf);
    console.log(`  fetched mpfb2/${rel} (${(buf.length / 1024).toFixed(0)} KB)`);
  }
  return file;
}

/** True if the MPFB2 repo tree (cached listing) contains this data path. */
let treeCache = null;
export function mpfb2Has(rel) {
  if (!treeCache) {
    const f = path.join(SRC, 'index', 'mpfb2-tree.json');
    treeCache = fs.existsSync(f) ? new Set(JSON.parse(fs.readFileSync(f, 'utf8')).tree.map((t) => t.path)) : null;
  }
  return treeCache ? treeCache.has('src/mpfb/data/' + rel) : true;
}

const listCache = new Map();
/** Central directory of an asset pack zip (cached as JSON). */
export async function zipList(pack) {
  if (listCache.has(pack)) return listCache.get(pack);
  const url = PACKS[pack] || pack;
  const cacheFile = path.join(SRC, 'index', `${pack}.zip.json`);
  let list;
  if (fs.existsSync(cacheFile)) list = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  else {
    const tail = await get(url, { Range: 'bytes=-65557' });
    const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) throw new Error('zip: no end of central directory in ' + url);
    let cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16);
    if (cdOff === 0xffffffff) throw new Error('zip64 not supported: ' + url);
    const cd = await get(url, { Range: `bytes=${cdOff}-${cdOff + cdSize - 1}` });
    list = [];
    for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50;) {
      const method = cd.readUInt16LE(p + 10);
      const csize = cd.readUInt32LE(p + 20), size = cd.readUInt32LE(p + 24);
      const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
      const offset = cd.readUInt32LE(p + 42);
      const name = cd.subarray(p + 46, p + 46 + nl).toString('utf8');
      list.push({ name, size, csize, method, offset });
      p += 46 + nl + xl + cl;
    }
    writeAtomic(cacheFile, Buffer.from(JSON.stringify(list)));
  }
  listCache.set(pack, list);
  return list;
}

/** Finds zip entries whose name matches a RegExp or ends with a string. */
export async function zipFind(pack, pattern) {
  const list = await zipList(pack);
  return list.filter((e) => (pattern instanceof RegExp ? pattern.test(e.name) : e.name.endsWith(pattern)) && !e.name.endsWith('/'));
}

/** Local path of one zip entry (exact name or unique suffix), extracted via HTTP Range on first use. */
export async function zipEntry(pack, name) {
  const list = await zipList(pack);
  let e = list.find((x) => x.name === name);
  if (!e) {
    const c = list.filter((x) => x.name.endsWith('/' + name) || x.name.endsWith(name));
    if (c.length !== 1) throw new Error(`zip ${pack}: ${c.length} matches for ${name}`);
    e = c[0];
  }
  const file = path.join(SRC, pack, e.name);
  if (!e.name.startsWith('packs/')) usage.add(pack + ':' + e.name.split('/').slice(0, 2).join('/'));
  if (fs.existsSync(file) && fs.statSync(file).size === e.size) return file;
  const url = PACKS[pack] || pack;
  // local header (30 bytes + name + extra) precedes the data; over-read 1 KB to cover the variable part
  const head = await get(url, { Range: `bytes=${e.offset}-${e.offset + 30 + 1024 - 1}` });
  if (head.readUInt32LE(0) !== 0x04034b50) throw new Error('zip: bad local header for ' + e.name);
  const start = e.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  const raw = e.csize ? await get(url, { Range: `bytes=${start}-${start + e.csize - 1}` }) : Buffer.alloc(0);
  const data = e.method === 0 ? raw : e.method === 8 ? zlib.inflateRawSync(raw) : null;
  if (!data) throw new Error(`zip: unsupported method ${e.method} for ${e.name}`);
  if (data.length !== e.size) throw new Error(`zip: size mismatch for ${e.name}`);
  writeAtomic(file, data);
  console.log(`  extracted ${pack}:${e.name} (${(data.length / 1024).toFixed(0)} KB)`);
  return file;
}

/** Extracts every file of a zip "folder" (prefix match on a path segment); returns local paths. */
export async function zipFolder(pack, folderSuffix, filter = () => true) {
  const list = await zipList(pack);
  const want = list.filter((x) => !x.name.endsWith('/') && x.name.includes(folderSuffix.replace(/\/?$/, '/')) && filter(x.name));
  const out = [];
  for (const e of want) out.push(await zipEntry(pack, e.name));
  return out;
}
