import type { InputState, Player } from '../core/model';
import { ACTIONS, DEFAULT_BINDINGS, normalizeBindingCode, type BindingAction, type KeyBindings } from '../core/keybindings';

export const clampPitch = (pitch: number) => Math.max(-1.15, Math.min(1.15, pitch));
export function movementForView(yaw: number, forward: number, strafe: number) {
  const length = Math.max(1, Math.hypot(forward, strafe));
  return { x: (Math.cos(yaw) * forward - Math.sin(yaw) * strafe) / length,
    y: (Math.sin(yaw) * forward + Math.cos(yaw) * strafe) / length };
}
export class FpsControls {
  yaw = -Math.PI / 2; pitch = 0;
  private keys = new Set<string>(); private physicalKeys = new Set<string>();
  private dodge = false; private auxiliary = false;
  private jump = false;private heal=false;
  private mouseLook = false; private wasLocked = false;
  private mouseOrigin: { x: number; y: number } | null = null;
  constructor(private canvas: HTMLCanvasElement, private enabled: () => boolean,
    pause: () => void, map: () => boolean | void, interact: () => void, inventory: () => void,
    private sensitivity: () => number = () => 1,
    private bindingGetter: () => KeyBindings | undefined = () => undefined) {
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      this.mouseOrigin = null;
      if (locked) this.mouseLook = true;
      else if (this.wasLocked) { if (this.enabled()) pause(); this.clear(); }
      this.wasLocked = locked;
    });
    window.addEventListener('keydown', e => {
      // Let the text input own composition, including its Escape cancellation.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.code === 'Escape') { if (!e.repeat) pause(); return; }
      if(e.defaultPrevented)return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')) return;
      const code = normalizeBindingCode(e.code);
      if(!this.enabled()&&(e.shiftKey&&code==='Tab'||['Shift','Control','Alt'].includes(code??'')))return;
      // Browser shortcuts keep ownership; a modifier can still be bound on its own.
      if (!code || e.metaKey || (e.ctrlKey && code !== 'Control') || (e.altKey && code !== 'Alt')) return;
      const action = this.actionForCode(code);
      if (!action) return;
      if(!this.enabled()&&action==='pause'&&['Tab','Enter','Space'].includes(code))return;
      if (e.repeat) { if (this.enabled()) e.preventDefault(); return; }
      if (action !== 'map' && action !== 'pause' && !this.enabled()) return;
      const fresh = !this.keys.has(code);
      this.press(e.code, code);
      if (!fresh) return;
      if (action === 'map') { if (map() !== false) e.preventDefault(); return; }
      e.preventDefault();
      if (action === 'pause') pause();
      else if (action === 'interact') interact();
      else if (action === 'inventory') inventory();
      else this.trigger(action);
    });
    window.addEventListener('keyup', e => this.release(e.code));
    window.addEventListener('blur', () => this.clear());
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
      if (!this.enabled() || e.ctrlKey || e.altKey || e.metaKey) return;
      if (document.pointerLockElement !== canvas) this.lock();
      const code = normalizeBindingCode(`Mouse${e.button}`);
      if (!code) return;
      const action = this.actionForCode(code);
      if (action !== 'fire' && action !== 'auxiliary') return;
      e.preventDefault();
      const fresh = !this.keys.has(code);
      this.press(code, code);
      if (fresh) this.trigger(action);
    });
    window.addEventListener('mouseup', e => this.release(`Mouse${e.button}`));
    canvas.addEventListener('mouseleave', () => {
      this.mouseOrigin = null;
      if (document.pointerLockElement !== canvas) for (const code of ['Mouse0', 'Mouse1', 'Mouse2']) this.release(code);
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
  private get bindings() { return this.bindingGetter() ?? DEFAULT_BINDINGS; }
  private actionForCode(code: string): BindingAction | undefined {
    const bindings = this.bindings;
    return ACTIONS.find(({ action }) => bindings[action] === code)?.action;
  }
  private press(physical: string, normalized: string) {
    this.physicalKeys.add(physical); this.keys.add(normalized);
  }
  private release(physical: string) {
    this.physicalKeys.delete(physical);
    const normalized = normalizeBindingCode(physical);
    if (normalized && ![...this.physicalKeys].some(code => normalizeBindingCode(code) === normalized)) {
      this.keys.delete(normalized);
    }
  }
  private trigger(action: BindingAction) {
    if (action === 'dodge') this.dodge = true;
    else if (action === 'auxiliary') this.auxiliary = true;
    else if (action === 'jump') this.jump = true;
    else if (action === 'heal') this.heal = true;
  }
  lock() {
    this.canvas.focus(); this.mouseLook = true; this.mouseOrigin = null;
    // Keep ordinary mouse look active for rejected, missing and older void-returning APIs.
    try { this.canvas.requestPointerLock?.()?.catch(() => {}); } catch { /* Use canvas mouse look. */ }
  }
  clear() {
    this.keys.clear(); this.physicalKeys.clear(); this.dodge = false; this.auxiliary = false; this.jump = false;this.heal=false;
    this.mouseLook = false; this.mouseOrigin = null;
  }
  get moving() {
    const bindings = this.bindings;
    return (['forward', 'backward', 'left', 'right'] as const).some(action => this.keys.has(bindings[action]));
  }
  consume(p: Player): InputState {
    // View bindings provide keyboard look when mouse capture is unavailable.
    const bindings = this.bindings;
    const held = (action: BindingAction) => Number(this.keys.has(bindings[action]));
    this.yaw += (held('lookRight') - held('lookLeft')) * 0.035;
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    this.pitch = clampPitch(this.pitch + (held('lookUp') - held('lookDown')) * 0.025);
    const move = movementForView(this.yaw, held('forward') - held('backward'), held('right') - held('left'));
    const input = { moveX: move.x, moveY: move.y, aimX: p.x + Math.cos(this.yaw) * 120,
      aimY: p.y + Math.sin(this.yaw) * 120, aimPitch: this.pitch, fire: !!held('fire'), dodge: this.dodge, jump: this.jump, auxiliary: this.auxiliary,heal:this.heal };
    this.dodge = false; this.auxiliary = false; this.jump = false;this.heal=false; return input;
  }
}
