// Arm rig for the first-person view: two-bone IK (shoulder -> elbow -> wrist) on the rigid-segment arms
// model, plus finger poses. Bones point down their local -Z in the rest pose (see tools/assets/arms.mjs).
import * as THREE from 'three';

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _S = new THREE.Vector3();
const _D = new THREE.Vector3();
const _P = new THREE.Vector3();
const _E = new THREE.Vector3();
const _U = new THREE.Vector3();
const _HU = new THREE.Vector3();
const _qUpper = new THREE.Quaternion();
const _qFore = new THREE.Quaternion();
const _qInv = new THREE.Quaternion();

/** Quaternion whose -Z axis points along `fwd` with +Y as close as possible to `up`. */
export function basisQuat(fwd, up, out = new THREE.Quaternion()) {
  _z.copy(fwd).normalize().negate();
  _x.crossVectors(up, _z);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0).cross(_z);
  _x.normalize();
  _y.crossVectors(_z, _x);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

// Finger curl tables: [joint1, joint2, joint3] in degrees (positive = curl towards the palm),
// spread = yaw of joint 1. Thumb: base [pitch, yaw, roll] + curls of joints 2, 3.
export const HAND_POSES = {
  open:     { index: [5, 5, 3], middle: [5, 5, 3], ring: [6, 6, 4], pinky: [8, 8, 5], spread: [6, 2, -3, -8], thumb: [10, 30, 30, 5, 5] },
  relaxed:  { index: [25, 30, 15], middle: [30, 35, 18], ring: [35, 38, 20], pinky: [40, 40, 22], spread: [4, 1, -2, -5], thumb: [15, 35, 45, 15, 10] },
  fist:     { index: [85, 95, 60], middle: [88, 98, 62], ring: [88, 98, 62], pinky: [88, 95, 60], spread: [0, 0, 0, 0], thumb: [35, 40, 70, 45, 35] },
  // right hand on a pistol grip: three fingers wrapped, index on the trigger, thumb over the top-left
  grip:     { index: [42, 58, 22], middle: [78, 92, 50], ring: [80, 94, 52], pinky: [80, 92, 50], spread: [-4, 0, 2, 5], thumb: [25, 55, 70, 25, 15] },
  gripOff:  { index: [12, 10, 5], middle: [78, 92, 50], ring: [80, 94, 52], pinky: [80, 92, 50], spread: [0, 0, 2, 5], thumb: [25, 55, 70, 25, 15] },
  // left hand cradling a handguard from below, fingers wrapping up the far side
  cradle:   { index: [40, 50, 25], middle: [45, 55, 28], ring: [48, 58, 30], pinky: [50, 58, 30], spread: [6, 2, -2, -6], thumb: [20, 25, 40, 15, 10] },
  wrap:     { index: [62, 72, 38], middle: [66, 76, 40], ring: [68, 78, 40], pinky: [68, 76, 40], spread: [-2, 0, 2, 4], thumb: [30, 45, 65, 25, 15] },
  pinch:    { index: [40, 45, 20], middle: [55, 70, 35], ring: [70, 85, 45], pinky: [75, 85, 45], spread: [0, 0, 0, 0], thumb: [35, 55, 60, 20, 10] },
  magGrab:  { index: [30, 40, 18], middle: [55, 65, 32], ring: [60, 70, 35], pinky: [62, 70, 35], spread: [3, 0, -2, -4], thumb: [35, 60, 55, 15, 8] },
  point:    { index: [0, 0, 0], middle: [80, 95, 55], ring: [85, 95, 55], pinky: [85, 92, 55], spread: [0, 0, 0, 0], thumb: [30, 40, 60, 30, 20] },
};

const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const D = Math.PI / 180;

export class ArmRig {
  /**
   * @param {THREE.Object3D} model loaded arms.glb scene (nodes R_upper..., L_upper...)
   * @param {THREE.Object3D} parent camera-space container
   */
  constructor(model, parent) {
    this.model = model;
    parent.add(model);
    this.sides = {};
    for (const side of ['R', 'L']) {
      const get = (n) => model.getObjectByName(`${side}_${n}`);
      const s = {
        upper: get('upper'), fore: get('fore'), hand: get('hand'),
        fingers: {}, thumb: [get('thumb1'), get('thumb2'), get('thumb3')],
        shoulder: new THREE.Vector3(side === 'R' ? 0.25 : -0.32, side === 'R' ? -0.40 : -0.38, side === 'R' ? 0.10 : 0.02),
        pole: new THREE.Vector3(side === 'R' ? 0.7 : -0.7, -1, 0.25),
        pose: { ...HAND_POSES.relaxed },
        poseTo: HAND_POSES.relaxed, poseBlend: 1, poseFrom: HAND_POSES.relaxed,
        visible: true,
      };
      for (const f of FINGERS) s.fingers[f] = [get(f + '1'), get(f + '2'), get(f + '3')];
      // rest lengths from the node offsets
      s.lenUpper = s.fore.position.length();
      s.lenFore = s.hand.position.length();
      s.upper.position.copy(s.shoulder);
      this.sides[side] = s;
    }
  }

  setPose(side, name, time = 0.12) {
    const s = this.sides[side];
    const target = HAND_POSES[name] || HAND_POSES.relaxed;
    if (s.poseTo === target) return;
    s.poseFrom = this._currentPose(s);
    s.poseTo = target;
    s.poseBlend = time <= 0 ? 1 : 0;
    s.poseTime = time;
  }

  _currentPose(s) {
    const t = s.poseBlend, a = s.poseFrom, b = s.poseTo;
    const mix = (x, y) => x.map((v, i) => v + (y[i] - v) * t);
    return { index: mix(a.index, b.index), middle: mix(a.middle, b.middle), ring: mix(a.ring, b.ring), pinky: mix(a.pinky, b.pinky), spread: mix(a.spread, b.spread), thumb: mix(a.thumb, b.thumb) };
  }

  /**
   * Solves one arm so the wrist reaches `wristPos` with orientation `handQuat` (both in the parent's space).
   */
  solve(side, wristPos, handQuat) {
    const s = this.sides[side];
    const a = s.lenUpper, b = s.lenFore;
    _S.copy(s.shoulder);
    _D.subVectors(wristPos, _S);
    let d = _D.length();
    // let the shoulder slide toward the target instead of over-stretching the arm
    const maxReach = (a + b) * 0.995;
    if (d > maxReach) { _S.addScaledVector(_D.normalize(), d - maxReach); _D.subVectors(wristPos, _S); d = maxReach; }
    d = Math.max(Math.abs(a - b) + 1e-3, d);
    _D.normalize();
    const cosA = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    _P.copy(s.pole).addScaledVector(_D, -s.pole.dot(_D)).normalize();
    _E.copy(_S).addScaledVector(_D, a * cosA).addScaledVector(_P, a * sinA); // elbow
    s.upper.position.copy(_S);
    basisQuat(_U.subVectors(_E, _S), _HU.copy(_P).negate(), _qUpper);
    s.upper.quaternion.copy(_qUpper);
    // forearm roll follows the hand (pronation) so the cuff never shows a twist
    _HU.set(0, 1, 0).applyQuaternion(handQuat);
    basisQuat(_U.subVectors(wristPos, _E), _HU, _qFore);
    s.fore.quaternion.copy(_qInv.copy(_qUpper).invert().multiply(_qFore));
    s.hand.quaternion.copy(_qInv.copy(_qFore).invert().multiply(handQuat));
  }

  update(dt) {
    for (const side of ['R', 'L']) {
      const s = this.sides[side];
      if (s.poseBlend < 1) s.poseBlend = Math.min(1, s.poseBlend + dt / (s.poseTime || 0.12));
      const p = this._currentPose(s);
      FINGERS.forEach((f, i) => {
        const [j1, j2, j3] = s.fingers[f];
        const c = p[f];
        j1.rotation.set(-c[0] * D, p.spread[i] * D * (side === 'R' ? 1 : -1), 0);
        j2.rotation.set(-c[1] * D, 0, 0);
        j3.rotation.set(-c[2] * D, 0, 0);
      });
      const [t1, t2, t3] = s.thumb;
      const th = p.thumb, m = side === 'R' ? 1 : -1;
      t1.rotation.set(-th[0] * D, -th[1] * D * m, th[2] * D * m, 'YXZ');
      t2.rotation.set(-th[3] * D, 0, 0);
      t3.rotation.set(-th[4] * D, 0, 0);
      s.upper.visible = s.visible;
    }
  }
}
