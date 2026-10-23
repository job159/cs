// Unified input: touch (floating stick + look pad + buttons) and keyboard/mouse (pointer lock).
// Game code reads `input.state` once per frame and calls `input.endFrame()` afterwards.
//
// state.move      {x, y}  strafe right / forward, -1..1 (stick or WASD)
// state.lookX/Y   accumulated look delta in radians since the last frame (yaw right, pitch down)
// state.held[a]   action is down;  state.pressed[a] went down this frame;  state.released[a]
// Actions: fire alt reload jump crouch use sprint grenade melee inspect buy score next prev
//          slot1..slot5 (weapon slots)  pause
export const ACTIONS = ['fire', 'alt', 'reload', 'jump', 'crouch', 'use', 'sprint', 'grenade', 'melee', 'inspect',
  'buy', 'score', 'next', 'prev', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'pause', 'special'];

// The bindings (KeyboardEvent.code -> action; f b l r = movement). Exported so the HUD key hints (ui/keyhints.js)
// show the real keys: a rebinding screen edits these maps in place. Mouse: button index -> action, the wheel
// steps next / prev.
export const KEYMAP = {
  KeyW: 'f', KeyS: 'b', KeyA: 'l', KeyD: 'r', ArrowUp: 'f', ArrowDown: 'b', ArrowLeft: 'l', ArrowRight: 'r',
  KeyR: 'reload', Space: 'jump', ControlLeft: 'crouch', KeyC: 'crouch', KeyE: 'use', ShiftLeft: 'sprint',
  KeyG: 'grenade', KeyV: 'melee', KeyF: 'inspect', KeyB: 'buy', Tab: 'score', KeyQ: 'special',
  Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Digit4: 'slot4', Digit5: 'slot5', Escape: 'pause',
};
export const MOUSEMAP = { 0: 'fire', 2: 'alt' };

export class Input {
  constructor(el) {
    this.el = el;
    this.state = {
      move: { x: 0, y: 0 }, lookX: 0, lookY: 0,
      held: Object.create(null), pressed: Object.create(null), released: Object.create(null),
      touch: false, sprintLock: false,
    };
    for (const a of ACTIONS) { this.state.held[a] = false; this.state.pressed[a] = false; this.state.released[a] = false; }
    this.keys = { f: 0, b: 0, l: 0, r: 0 };
    this.stick = { x: 0, y: 0 };
    this.enabled = true;
    this.mouseSens = 1;
    this.touchSens = 1;
    this.pointerLocked = false;
    this._bind();
  }

  press(a) {
    if (!this.state.held[a]) { this.state.held[a] = true; this.state.pressed[a] = true; }
  }
  release(a) {
    if (this.state.held[a]) { this.state.held[a] = false; this.state.released[a] = true; }
  }
  addLook(dx, dy) { this.state.lookX += dx; this.state.lookY += dy; }
  setStick(x, y) { this.stick.x = x; this.stick.y = y; }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const a = KEYMAP[e.code];
      if (!a) return;
      if (!this.enabled && a !== 'buy' && a !== 'pause') return;
      if (a.length === 1) this.keys[a] = 1; else this.press(a);
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      if (a.length === 1) this.keys[a] = 0; else this.release(a);
    });
    window.addEventListener('blur', () => this.releaseAll());
    this.el.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.pointerType === 'touch') return;
      if (this.wantPointerLock && !this.pointerLocked) { this.el.requestPointerLock?.(); return; }
      if (MOUSEMAP[e.button]) this.press(MOUSEMAP[e.button]);
    });
    window.addEventListener('mouseup', (e) => {
      if (MOUSEMAP[e.button]) this.release(MOUSEMAP[e.button]);
    });
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) this.addLook(e.movementX * 0.0022 * this.mouseSens, e.movementY * 0.0022 * this.mouseSens);
    });
    window.addEventListener('wheel', (e) => {
      if (!this.pointerLocked) return;
      this.press(e.deltaY > 0 ? 'next' : 'prev');
      queueMicrotask(() => { this.state.held.next = false; this.state.held.prev = false; });
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.el;
      if (!this.pointerLocked) this.releaseAll();
    });
  }

  releaseAll() {
    for (const a of ACTIONS) this.release(a);
    this.keys.f = this.keys.b = this.keys.l = this.keys.r = 0;
    this.stick.x = this.stick.y = 0;
  }

  /** Call at the start of a frame: merges keyboard and stick into state.move. */
  poll() {
    const s = this.state;
    let x = this.keys.r - this.keys.l, y = this.keys.f - this.keys.b;
    if (x || y) { const l = Math.hypot(x, y); x /= l; y /= l; }
    if (Math.abs(this.stick.x) + Math.abs(this.stick.y) > 0.001) { x = this.stick.x; y = this.stick.y; }
    s.move.x = x; s.move.y = y;
    return s;
  }

  endFrame() {
    const s = this.state;
    s.lookX = 0; s.lookY = 0;
    for (const a of ACTIONS) { s.pressed[a] = false; s.released[a] = false; }
  }
}
