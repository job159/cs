// Source motions in a common world-space form:
//   { names[], parent[], restWorldQ[], restWorldP[], fps, frames, worldQ[f][j], worldP[f][j] }
// plus the bone maps that pair them with the game_engine target skeleton.
import * as THREE from 'three';
import path from 'node:path';
import { readGLB } from './gltf-read.mjs';
import { loadBVH } from './bvh.mjs';
import { SRC } from './skeleton.mjs';

export const UAL1_FILE = path.join(SRC, 'quaternius', 'ual1_AnimationLibrary_Godot_Standard.glb');
export const UAL2_FILE = path.join(SRC, 'quaternius', 'ual2_UAL2_Standard.glb');
export const CMU_DIR = path.join(SRC, 'cmu');

// UAL1 uses Rigify DEF- names on the very same rest skeleton as UAL2 (UE names).
const UAL1_RENAME = {
  'DEF-hips': 'pelvis', 'DEF-spine.001': 'spine_01', 'DEF-spine.002': 'spine_02', 'DEF-spine.003': 'spine_03',
  'DEF-neck': 'neck_01', 'DEF-head': 'Head',
  'DEF-shoulder.L': 'clavicle_l', 'DEF-upper_arm.L': 'upperarm_l', 'DEF-forearm.L': 'lowerarm_l', 'DEF-hand.L': 'hand_l',
  'DEF-shoulder.R': 'clavicle_r', 'DEF-upper_arm.R': 'upperarm_r', 'DEF-forearm.R': 'lowerarm_r', 'DEF-hand.R': 'hand_r',
  'DEF-thigh.L': 'thigh_l', 'DEF-shin.L': 'calf_l', 'DEF-foot.L': 'foot_l', 'DEF-toe.L': 'ball_l',
  'DEF-thigh.R': 'thigh_r', 'DEF-shin.R': 'calf_r', 'DEF-foot.R': 'foot_r', 'DEF-toe.R': 'ball_r',
};
function ual1Name(n) {
  if (UAL1_RENAME[n]) return UAL1_RENAME[n];
  // fingers: DEF-f_index.01.L -> index_01_l, DEF-thumb.01.L -> thumb_01_l
  const m = /^DEF-(?:f_)?(index|middle|ring|pinky|thumb)\.0(\d)\.([LR])$/.exec(n);
  if (m) return `${m[1]}_0${m[2]}_${m[3].toLowerCase()}`;
  return n;
}

const docCache = new Map();
function doc(file) { if (!docCache.has(file)) docCache.set(file, readGLB(file)); return docCache.get(file); }

/** Loads one glTF animation as a world-space source motion (node names normalised to UE names). */
export function loadGLTFMotion(file, anim, { fps = 30 } = {}) {
  const d = doc(file);
  const rename = file === UAL1_FILE ? ual1Name : (n) => n;
  const nodes = d.nodes;
  // ordered node list: depth-first from scene roots, skipping meshes
  const order = [];
  const visit = (i) => { if (nodes[i].mesh === undefined) order.push(i); for (const c of nodes[i].children) visit(c); };
  for (const r of d.json.scenes[d.json.scene || 0].nodes) visit(r);
  const pos = new Map(order.map((n, k) => [n, k]));
  const names = order.map((i) => rename(nodes[i].name));
  const parent = order.map((i) => (nodes[i].parent >= 0 && pos.has(nodes[i].parent) ? pos.get(nodes[i].parent) : -1));
  const fkFrame = (getTRS) => {
    const wq = [], wp = [];
    order.forEach((ni, k) => {
      const { t, r, s } = getTRS(ni);
      const q = new THREE.Quaternion(...r);
      const p = new THREE.Vector3(...t);
      const pp = parent[k];
      if (pp < 0) { wq.push(q); wp.push(p); return; }
      if (Math.abs(s[0] - 1) > 1e-3) throw new Error('scaled nodes not supported');
      wq.push(wq[pp].clone().multiply(q));
      wp.push(p.applyQuaternion(wq[pp]).add(wp[pp]));
    });
    return { wq, wp };
  };
  const rest = fkFrame((ni) => nodes[ni]);
  const clip = d.sampleAnimation(anim, fps);
  const worldQ = [], worldP = [];
  for (let f = 0; f < clip.frames; f++) {
    const r = fkFrame((ni) => {
      const n = nodes[ni];
      const tr = clip.tracks.get(n.name);
      return { t: tr?.t ? tr.t[f] : n.t, r: tr?.r ? tr.r[f] : n.r, s: n.s };
    });
    worldQ.push(r.wq); worldP.push(r.wp);
  }
  return { names, parent, restWorldQ: rest.wq, restWorldP: rest.wp, fps, frames: clip.frames, worldQ, worldP, source: `${path.basename(file)}:${anim}` };
}

export const ual1 = (anim, o) => loadGLTFMotion(UAL1_FILE, anim, o);
export const ual2 = (anim, o) => loadGLTFMotion(UAL2_FILE, anim, o);

// cgspeed CMU BVH: units are ASF lengths (1/0.45 inch).
export const CMU_SCALE = 0.0254 / 0.45;
export function cmu(trial, { fps = 30, from = 0, to = null } = {}) {
  const file = path.join(CMU_DIR, `${trial}.bvh`);
  // range is in seconds of the original 120 fps take
  const m = loadBVH(file, { scale: CMU_SCALE, fps, range: to == null && !from ? null : [Math.round(from * 120), to == null ? undefined : Math.round(to * 120)] });
  m.source = `CMU ${trial}`;
  return m;
}

// ------------------------------------------------------------------------------------- bone maps
// target bone -> [source joint, tip joint used to measure the source rest direction]
// (tip null = the joint's own rest frame +Y, for Blender-convention sources).

const SIDE = (fn) => {
  const o = {};
  for (const [s, S] of [['l', 'Left'], ['r', 'Right']]) Object.assign(o, fn(s, S));
  return o;
};

export const MAP_UE = (() => {
  const m = {
    pelvis: ['pelvis', null], spine_01: ['spine_01', null], spine_02: ['spine_02', null], spine_03: ['spine_03', null],
    neck_01: ['neck_01', null], head: ['Head', null],
  };
  Object.assign(m, SIDE((s) => {
    const o = {};
    for (const b of ['clavicle', 'upperarm', 'lowerarm', 'hand', 'thigh', 'calf', 'foot', 'ball']) o[`${b}_${s}`] = [`${b}_${s}`, null];
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
      o[`${f}_01_${s}`] = [`${f}_01_${s}`, null];
      o[`${f}_02_${s}`] = [`${f}_02_${s}`, null];
    }
    return o;
  }));
  return m;
})();

export const MAP_CMU = (() => {
  const m = {
    pelvis: ['Hips', 'Spine'],
    spine_01: ['LowerBack', 'Spine'],
    spine_02: ['Spine', 'Spine1'],
    spine_03: ['Spine1', 'Neck1'],
    neck_01: ['Neck1', 'Head'],
    head: ['Head', 'Head_end'],
  };
  Object.assign(m, SIDE((s, S) => ({
    [`clavicle_${s}`]: [`${S}Shoulder`, `${S}Arm`],
    [`upperarm_${s}`]: [`${S}Arm`, `${S}ForeArm`],
    [`lowerarm_${s}`]: [`${S}ForeArm`, `${S}Hand`],
    [`hand_${s}`]: [`${S}Hand`, `${S}HandIndex1`],
    [`thigh_${s}`]: [`${S}UpLeg`, `${S}Leg`],
    [`calf_${s}`]: [`${S}Leg`, `${S}Foot`],
    [`foot_${s}`]: [`${S}Foot`, `${S}ToeBase`],
    [`ball_${s}`]: [`${S}ToeBase`, `${S}ToeBase_end`],
  })));
  return m;
})();
