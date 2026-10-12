// The target skeleton: MPFB2 `game_engine` rig (UE-mannequin names) on the default MakeHuman body,
// converted to the runtime convention: metres, +Y up, character facing +Z, origin on the ground
// between the feet. Bone frames follow Blender's convention (local +Y runs head -> tail, X/Z set by
// the bone roll), which is what a Blender glTF export of the same rig produces.
//
// Rest pose is computed from the rig JSON `default_position` head/tail values (CC0 data). The
// Blender-armature maths (minimal rotation Y -> bone vector, then roll about the bone) is
// re-derived here, no MPFB2 code is used.
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ZROOT = path.resolve(HERE, '..');
export const SRC = path.join(ZROOT, 'src');
export const REPO = path.resolve(ZROOT, '..', '..', '..');

const Y = new THREE.Vector3(0, 1, 0);
// Blender (Z up, -Y forward) -> glTF (Y up, +Z forward): rotate -90 deg about X.
export const BL2GL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/** Bone order used everywhere (parents before children). */
export const BONES = [
  'Root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head',
  'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l',
  'thumb_01_l', 'thumb_02_l', 'thumb_03_l', 'index_01_l', 'index_02_l', 'index_03_l',
  'middle_01_l', 'middle_02_l', 'middle_03_l', 'ring_01_l', 'ring_02_l', 'ring_03_l',
  'pinky_01_l', 'pinky_02_l', 'pinky_03_l',
  'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
  'thumb_01_r', 'thumb_02_r', 'thumb_03_r', 'index_01_r', 'index_02_r', 'index_03_r',
  'middle_01_r', 'middle_02_r', 'middle_03_r', 'ring_01_r', 'ring_02_r', 'ring_03_r',
  'pinky_01_r', 'pinky_02_r', 'pinky_03_r',
  'thigh_l', 'calf_l', 'foot_l', 'ball_l',
  'thigh_r', 'calf_r', 'foot_r', 'ball_r',
];

export const FINGERS = BONES.filter((b) => /^(thumb|index|middle|ring|pinky)_/.test(b));

/** Mirror name l <-> r. */
export const mirrorName = (n) => n.replace(/_l$/, '_#').replace(/_r$/, '_l').replace(/_#$/, '_r');

/**
 * Blender bone matrix (rotation part) from a bone vector and roll: minimal-arc rotation taking +Y
 * onto the bone direction, followed by a rotation of `roll` radians about the bone's own Y axis.
 */
export function boneRotation(vec, roll) {
  const n = vec.clone().normalize();
  const q = new THREE.Quaternion();
  const d = Y.dot(n);
  if (d < -1 + 1e-9) q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI); // exactly -Y (Blender uses 180 deg about Z)
  else q.setFromUnitVectors(Y, n);
  const r = new THREE.Quaternion().setFromAxisAngle(Y, roll);
  return q.multiply(r);
}

export class Skeleton {
  constructor(rigFile = path.join(SRC, 'mpfb2', 'rigs', 'standard', 'rig.game_engine.json')) {
    const rig = JSON.parse(fs.readFileSync(rigFile, 'utf8'));
    this.names = BONES.slice();
    for (const n of Object.keys(rig)) if (!this.names.includes(n)) throw new Error('rig bone not in BONES: ' + n);
    for (const n of this.names) if (!rig[n]) throw new Error('BONES entry not in rig: ' + n);
    this.index = new Map(this.names.map((n, i) => [n, i]));
    this.parent = this.names.map((n) => (rig[n].parent ? this.index.get(rig[n].parent) : -1));
    this.parent.forEach((p, i) => { if (p >= i) throw new Error('bone order: ' + this.names[i]); });
    // Ground height in Blender space: the Root bone's tail sits on the joint-ground cube.
    const groundZ = rig.Root.tail.default_position[2];
    const toGL = (p) => new THREE.Vector3(p[0], p[1], p[2]).applyQuaternion(BL2GL).add(new THREE.Vector3(0, -groundZ, 0));
    this.restWorldQ = [];
    this.restWorldP = [];
    this.tailWorldP = [];
    for (const n of this.names) {
      const b = rig[n];
      const head = toGL(b.head.default_position), tail = toGL(b.tail.default_position);
      if (n === 'Root') {
        // Runtime contract: the root sits on the ground between the feet with an identity frame.
        this.restWorldQ.push(new THREE.Quaternion());
        this.restWorldP.push(new THREE.Vector3());
        this.tailWorldP.push(new THREE.Vector3(0, 0.1, 0));
        continue;
      }
      const vecBl = new THREE.Vector3(...b.tail.default_position).sub(new THREE.Vector3(...b.head.default_position));
      const qBl = boneRotation(vecBl, b.roll);
      this.restWorldQ.push(BL2GL.clone().multiply(qBl));
      this.restWorldP.push(head);
      this.tailWorldP.push(tail);
    }
    // Local rest transforms.
    this.restLocalQ = [];
    this.restLocalP = [];
    for (let i = 0; i < this.names.length; i++) {
      const p = this.parent[i];
      if (p < 0) { this.restLocalQ.push(this.restWorldQ[i].clone()); this.restLocalP.push(this.restWorldP[i].clone()); continue; }
      const pqi = this.restWorldQ[p].clone().invert();
      this.restLocalQ.push(pqi.clone().multiply(this.restWorldQ[i]));
      this.restLocalP.push(this.restWorldP[i].clone().sub(this.restWorldP[p]).applyQuaternion(pqi));
    }
    this.length = this.names.map((n, i) => this.tailWorldP[i].distanceTo(this.restWorldP[i]));
    this.children = this.names.map((_, i) => this.parent.map((p, k) => (p === i ? k : -1)).filter((k) => k >= 0));
  }

  i(name) { const k = this.index.get(name); if (k === undefined) throw new Error('no bone ' + name); return k; }

  /** Rest pose as a Pose. */
  restPose() {
    return { q: this.restLocalQ.map((q) => q.clone()), root: this.restLocalP[this.i('pelvis')].clone() };
  }

  /**
   * Forward kinematics. pose = { q: Quaternion[] local rotations, root: Vector3 pelvis local position }.
   * Returns { wq: Quaternion[], wp: Vector3[] } world rotations / joint positions.
   */
  fk(pose) {
    const wq = [], wp = [];
    const pel = this.i('pelvis');
    for (let i = 0; i < this.names.length; i++) {
      const p = this.parent[i];
      const lp = i === pel ? pose.root : this.restLocalP[i];
      if (p < 0) { wq.push(pose.q[i].clone()); wp.push(lp.clone()); continue; }
      wq.push(wq[p].clone().multiply(pose.q[i]));
      wp.push(lp.clone().applyQuaternion(wq[p]).add(wp[p]));
    }
    return { wq, wp };
  }

  /** Tail (end) point of bone i in a FK result. */
  tail(fkres, i) {
    return new THREE.Vector3(0, this.length[i], 0).applyQuaternion(fkres.wq[i]).add(fkres.wp[i]);
  }

  /** World rest bone direction (unit) of bone i. */
  restDir(i) { return new THREE.Vector3(0, 1, 0).applyQuaternion(this.restWorldQ[i]); }
}

export function clonePose(p) { return { q: p.q.map((q) => q.clone()), root: p.root.clone() }; }
