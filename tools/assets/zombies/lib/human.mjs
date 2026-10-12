// High-level MakeHuman character: morph the hm08 base mesh, build the game_engine skeleton on it, and fit
// proxies / clothes / eyes / teeth / hair as skinned Parts. Units: MakeHuman files are decimetres, Y up, facing
// +Z; parts and bones come out in glTF metres with the ground at y = 0 (Root bone at the origin).
import fs from 'node:fs';
import path from 'node:path';
import { mpfb2, zipList, zipEntry } from './fetch.mjs';
import { loadOBJ } from './obj.mjs';
import { loadTarget, applyTarget, macroTargets, resolveModifier, expressionTarget } from './targets.mjs';
import { loadBinding, fitBinding } from './proxy.mjs';
import { buildSkeleton, baseWeights } from './rig.mjs';
import { Part } from './mesh.mjs';

let baseCache = null;
export async function loadBase() {
  if (!baseCache) baseCache = loadOBJ(await mpfb2('3dobjs/base.obj'));
  return baseCache;
}

/** Parses a .mhmat into {key: value} (texture paths resolved next to the file). */
export function parseMhmat(file) {
  const out = {};
  if (!file || !fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const i = line.indexOf(' ');
    if (i < 0) continue;
    out[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return out;
}

/**
 * Extracts an asset folder from the system pack (or skins03) and returns its files:
 * { dir, binding (.mhclo/.proxy path), obj, mhmat, textures: {diffuse, normal, ao, bump...} }
 */
export async function fetchAsset(folder, pack = 'system') {
  const list = await zipList(pack);
  const prefix = folder.replace(/\/?$/, '/');
  const entries = list.filter((e) => e.name.startsWith(prefix) && !e.name.endsWith('/') && !/\.(thumb|xcf)$/.test(e.name));
  if (!entries.length) throw new Error(`asset ${folder} not found in ${pack}`);
  const files = {};
  for (const e of entries) {
    if (/\.(png|jpg)$/i.test(e.name)) continue; // textures fetched on demand below
    files[path.basename(e.name)] = await zipEntry(pack, e.name);
  }
  const binding = Object.values(files).find((f) => /\.(mhclo|proxy)$/.test(f));
  const mhmatFile = Object.values(files).find((f) => f.endsWith('.mhmat'));
  const mat = parseMhmat(mhmatFile);
  const tex = {};
  for (const [k, key] of [['diffuseTexture', 'diffuse'], ['normalmapTexture', 'normal'], ['aomapTexture', 'ao'], ['bumpmapTexture', 'bump'], ['specularmapTexture', 'spec'], ['transparencymapTexture', 'alpha']]) {
    if (!mat[k]) continue;
    const name = path.basename(mat[k]);
    const e = entries.find((x) => path.basename(x.name) === name);
    if (e) tex[key] = await zipEntry(pack, e.name);
  }
  return { dir: prefix, binding, mhmat: mat, textures: tex, files };
}

export class Human {
  /**
   * @param o.macro       { gender, age, muscle, weight, height, proportions, race:{caucasian:1} }
   * @param o.modifiers   { 'torso-scale-horiz-decr-incr': -0.3, 'l-upperarm-fat-decr-incr': 0.2, 'stomach/stomach-pregnant-incr': 0.5 }
   * @param o.expression  { 'mouth-open': 0.4, ... } (MPFB2 expression units, baked into the rest mesh)
   */
  static async create(o = {}) {
    const h = new Human();
    h.opts = o;
    h.baseObj = await loadBase();
    const dm = new Float32Array(h.baseObj.positions);
    for (const [t, w] of macroTargets(o.macro || {})) applyTarget(dm, await loadTarget(t), w);
    for (const [name, v] of Object.entries(o.modifiers || {})) {
      if (!v) continue;
      for (const [t, w] of await resolveModifier(name, v)) applyTarget(dm, await loadTarget(t), w);
    }
    for (const [unit, w] of Object.entries(o.expression || {})) applyTarget(dm, await loadTarget(expressionTarget(unit, o.expressionRace)), w);
    h.dm = dm; // morphed base, MakeHuman units
    // ground / origin: centroid of the joint-ground helper cube
    const g = [0, 0, 0];
    const gv = h.baseObj.groupVerts('joint-ground');
    for (const v of gv) for (let k = 0; k < 3; k++) g[k] += dm[v * 3 + k] / gv.size;
    h.origin = g;
    h.pos = h.toMetres(dm);
    h.skeleton = await buildSkeleton(h.baseObj, h.pos);
    h.weights = await baseWeights(h.skeleton, h.pos.length / 3);
    const head = h.skeleton.byName.head;
    h.height = Math.max(...Array.from(h.baseObj.groupVerts('body'), (v) => h.pos[v * 3 + 1]));
    h.headTop = h.height;
    h.parts = [];
    h.hidden = new Set(); // base vertices covered by clothes (union of delete_verts)
    return h;
  }

  /** MakeHuman decimetre coordinates -> glTF metres relative to the ground origin. */
  toMetres(dm) {
    const out = new Float32Array(dm.length);
    for (let i = 0; i < dm.length; i += 3) {
      out[i] = (dm[i] - this.origin[0]) * 0.1;
      out[i + 1] = (dm[i + 1] - this.origin[1]) * 0.1;
      out[i + 2] = (dm[i + 2] - this.origin[2]) * 0.1;
    }
    return out;
  }

  /** Joint helper centroid (e.g. 'joint-l-eye') in metres. */
  jointPos(name) {
    const s = this.baseObj.groupVerts(name);
    const p = [0, 0, 0];
    for (const v of s) for (let k = 0; k < 3; k++) p[k] += this.pos[v * 3 + k] / s.size;
    return p;
  }

  /** The high-resolution base mesh as a Part (groups default to ['body']). */
  basePart({ name = 'body', role = 'skin', groups = ['body'] } = {}) {
    const n = this.pos.length / 3;
    const refIdx = new Int32Array(n * 3), refW = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { refIdx[i * 3] = refIdx[i * 3 + 1] = refIdx[i * 3 + 2] = i; refW[i * 3] = 1; }
    const p = new Part({ name, role, obj: this.baseObj, pos: this.pos, refIdx, refW, groups });
    p.bindWeights(this.weights, this.skeleton.bones);
    return p;
  }

  /** Fits a .proxy/.mhclo asset (folder inside the system pack, e.g. 'proxymeshes/male1591'). */
  async fit(folder, { name, role = 'cloth', pack = 'system', hide = true } = {}) {
    const asset = await fetchAsset(folder, pack);
    const b = loadBinding(asset.binding);
    const pos = this.toMetres(fitBinding(b, this.dm));
    const part = new Part({ name: name || b.name, role, obj: b.obj, pos, refIdx: b.refIdx, refW: b.refW });
    part.asset = asset;
    part.binding = b;
    part.deleteVerts = b.deleteVerts;
    part.zDepth = b.zDepth;
    part.bindWeights(this.weights, this.skeleton.bones);
    if (hide) for (const v of b.deleteVerts) this.hidden.add(v);
    this.parts.push(part);
    return part;
  }

  /** Low-poly body proxy ('male1591' | 'female1605' | 'proxy741' ...). */
  async proxyBody(name = 'male1591') {
    const p = await this.fit(`proxymeshes/${name}`, { name: 'body', role: 'skin', hide: false });
    return p;
  }

  /**
   * Removes body faces that are completely covered by clothes (all vertices bound to hidden base vertices),
   * except where keepFn(position) says the skin must stay visible (holes torn into the clothes).
   */
  hideCovered(body, keepFn = null) {
    const n = body.nVerts;
    const hiddenV = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let best = 0;
      for (let k = 1; k < 3; k++) if (body.refW[i * 3 + k] > body.refW[i * 3 + best]) best = k;
      const bv = body.refIdx[i * 3 + best];
      if (!this.hidden.has(bv)) continue;
      if (keepFn && keepFn([body.pos[i * 3], body.pos[i * 3 + 1], body.pos[i * 3 + 2]], i)) continue;
      hiddenV[i] = 1;
    }
    let removed = 0;
    body.obj.faces.forEach((f, fi) => {
      if (!body.keep[fi]) return;
      if (f.v.every((v) => hiddenV[v])) { body.keep[fi] = 0; removed++; }
    });
    return removed;
  }
}
