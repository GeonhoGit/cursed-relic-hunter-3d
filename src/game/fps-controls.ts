import type { InputState, Player } from '../core/model';

export const clampPitch = (pitch: number) => Math.max(-1.15, Math.min(1.15, pitch));
export function movementForView(yaw: number, forward: number, strafe: number) {
  const length = Math.max(1, Math.hypot(forward, strafe));
  return { x: (Math.cos(yaw) * forward - Math.sin(yaw) * strafe) / length,
    y: (Math.sin(yaw) * forward + Math.cos(yaw) * strafe) / length };
}
export class FpsControls {
  yaw = -Math.PI / 2; pitch = 0;
  private keys = new Set<string>(); private fire = false; private dodge = false; private auxiliary = false;
  private jump = false;
  private mouseLook = false; private wasLocked = false;
  private mouseOrigin: { x: number; y: number } | null = null;
  constructor(private canvas: HTMLCanvasElement, private enabled: () => boolean,
    pause: () => void, map: () => boolean | void, interact: () => void, inventory: () => void,
    private sensitivity: () => number = () => 1) {
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      this.mouseOrigin = null;
      if (locked) this.mouseLook = true;
      else if (this.wasLocked) { if (this.enabled()) pause(); this.clear(); }
      this.wasLocked = locked;
    });
    window.addEventListener('keydown', e => {
      if (e.code === 'Tab' && !e.repeat) { if (map() !== false) e.preventDefault(); return; }
      if (e.code === 'Escape' && !e.repeat) { pause(); return; }
      if (!this.enabled() || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')) return;
      if (['Space', 'ShiftLeft', 'ShiftRight', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyE' && !e.repeat) interact();
      else if (e.code === 'KeyI' && !e.repeat) inventory();
      else if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) this.dodge = true;
      else if (e.code === 'Space' && !e.repeat) this.jump = true;
      else this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    document.addEventListener('mousemove', e => {
      if (!this.enabled() || !this.mouseLook) { this.mouseOrigin = null; return; }
      const locked = document.pointerLockElement === canvas;
      if (!locked && e.target !== canvas) { this.mouseOrigin = null; return; }
      const previous = this.mouseOrigin;
      this.mouseOrigin = { x: e.clientX, y: e.clientY };
      // Embedded browsers can reject pointer lock. Use canvas coordinates in that case.
      const dx = locked ? e.movementX : previous ? e.clientX - previous.x : 0;
      const dy = locked ? e.movementY : previous ? e.clientY - previous.y : 0;
      const scale = 0.0022 * this.sensitivity();
      this.yaw += dx * scale; this.pitch = clampPitch(this.pitch - dy * scale);
      this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    });
    canvas.addEventListener('mousedown', e => {
      if (!this.enabled()) return;
      if (document.pointerLockElement !== canvas) this.lock();
      if (e.button === 0) this.fire = true; else if (e.button === 2) this.auxiliary = true;
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.fire = false; });
    canvas.addEventListener('mouseleave', () => {
      this.mouseOrigin = null;
      if (document.pointerLockElement !== canvas) this.fire = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
  lock() {
    this.canvas.focus(); this.mouseLook = true; this.mouseOrigin = null;
    // Keep ordinary mouse look active for rejected, missing and older void-returning APIs.
    try { this.canvas.requestPointerLock?.()?.catch(() => {}); } catch { /* Use canvas mouse look. */ }
  }
  clear() {
    this.keys.clear(); this.fire = false; this.dodge = false; this.auxiliary = false; this.jump = false;
    this.mouseLook = false; this.mouseOrigin = null;
  }
  get moving() { return ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some(key => this.keys.has(key)); }
  consume(p: Player): InputState {
    // Arrow keys also provide a keyboard-only way to look when mouse capture is unavailable.
    this.yaw += (Number(this.keys.has('ArrowRight')) - Number(this.keys.has('ArrowLeft'))) * 0.035;
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    this.pitch = clampPitch(this.pitch + (Number(this.keys.has('ArrowUp')) - Number(this.keys.has('ArrowDown'))) * 0.025);
    const move = movementForView(this.yaw, Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS')),
      Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')));
    const input = { moveX: move.x, moveY: move.y, aimX: p.x + Math.cos(this.yaw) * 120,
      aimY: p.y + Math.sin(this.yaw) * 120, aimPitch: this.pitch, fire: this.fire, dodge: this.dodge, jump: this.jump, auxiliary: this.auxiliary };
    this.dodge = false; this.auxiliary = false; this.jump = false; return input;
  }
}
