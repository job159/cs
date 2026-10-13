// dev: triangle counts per source line of a weapon script (node tools/assets/weapons/_tris.mjs <id>)
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { Gun } from '../lib/gunkit.mjs';
const id = process.argv[2];
const byLine = new Map();
const orig = Gun.prototype.part;
Gun.prototype.part = function (name, opts) {
  const p = orig.call(this, name, opts);
  if (!p._wrapped) {
    p._wrapped = true;
    const add = p.add.bind(p);
    p.add = (geo, mat) => {
      const line = (new Error().stack.split('\n').find((l) => l.includes(id + '.mjs')) || '').replace(/.*:(\d+):\d+\)?$/, '$1');
      const t = geo ? (geo.index ? geo.index.count : geo.attributes.position.count) / 3 : 0;
      const k = line + ' ' + mat;
      byLine.set(k, (byLine.get(k) || 0) + t);
      return add(geo, mat);
    };
  }
  return p;
};
Gun.prototype.add = function (geo, mat) { return this.part('body').add(geo, mat); };
const mod = await import(pathToFileURL(path.resolve('tools/assets/weapons', id + '.mjs')).href);
await mod.default();
const rows = [...byLine].sort((a, b) => b[1] - a[1]);
let tot = 0; for (const r of rows) tot += r[1];
console.log('total', Math.round(tot));
for (const r of rows.slice(0, +(process.argv[3] || 40))) console.log(Math.round(r[1]) + '\t' + r[0]);
