// Gyroscope aim for phones (settings 陀螺儀: 關 / 開鏡時 / 永遠): the device's rotation rate is added to
// the look input like a finger drag. Landscape only: turning the phone left / right yaws, tilting its
// top edge toward / away from you pitches. Uses devicemotion rotationRate (deg/s), integrated with the
// event timestamps; iOS asks for permission from the settings toggle (a user gesture).
const DEG = Math.PI / 180;

export class Gyro {
  /**
   * @param {import('./input.js').Input} input
   * @param {() => boolean} active  true while a match is being played (not paused / in menus)
   * @param {() => boolean} aiming  true while aiming down sights
   */
  constructor(input, active, aiming) {
    this.input = input;
    this.active = active;
    this.aiming = aiming;
    this.mode = 'off'; // 'off' | 'ads' | 'always'
    this.sens = 1;
    this.lastT = 0;
    this.onMotion = (e) => this._motion(e);
    this.attached = false;
  }

  get supported() { return typeof window !== 'undefined' && 'DeviceMotionEvent' in window; }

  /** iOS 13+: must be called from a user gesture. Resolves true when motion events may flow. */
  async requestPermission() {
    const D = window.DeviceMotionEvent;
    if (typeof D?.requestPermission !== 'function') return true;
    try { return (await D.requestPermission()) === 'granted'; } catch { return false; }
  }

  setMode(mode, sens = this.sens) {
    this.mode = mode === 'ads' || mode === 'always' ? mode : 'off';
    this.sens = sens;
    const want = this.mode !== 'off' && this.supported;
    if (want && !this.attached) { window.addEventListener('devicemotion', this.onMotion); this.attached = true; this.lastT = 0; }
    else if (!want && this.attached) { window.removeEventListener('devicemotion', this.onMotion); this.attached = false; }
  }

  _motion(e) {
    const r = e.rotationRate;
    const t = e.timeStamp || performance.now();
    const dt = this.lastT ? Math.min(0.1, Math.max(0, (t - this.lastT) / 1000)) : 0;
    this.lastT = t;
    if (!r || !dt || !this.active()) return;
    if (this.mode === 'ads' && !this.aiming()) return;
    // screen.orientation.angle: 90 = landscape with the top edge on the left, 270 (-90) = on the right
    const ang = screen.orientation?.angle ?? window.orientation ?? 90;
    const s = ang === 270 || ang === -90 ? -1 : 1;
    if (ang === 0 || ang === 180) return; // portrait: not a supported way to play
    const k = this.sens * DEG * dt;
    // beta = rotation about the device x axis (vertical in landscape): yaw; gamma = about y: pitch
    const yawRate = (r.beta || 0) * s, pitchRate = (r.gamma || 0) * s;
    if (Math.abs(yawRate) < 0.6 && Math.abs(pitchRate) < 0.6) return; // sensor noise floor (deg/s)
    this.input.addLook(-yawRate * k, pitchRate * k);
  }
}
