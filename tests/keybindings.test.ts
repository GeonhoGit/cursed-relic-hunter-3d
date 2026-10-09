import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIONS, DEFAULT_BINDINGS, bindingIssue, bindingLabel, normalizeBindingCode, validKeyBindings,
  type KeyBindings,
} from '../src/core/keybindings';
import { keybindingMarkup } from '../src/game/keybinding-ui';
import { FpsControls } from '../src/game/fps-controls';
import type { Player } from '../src/core/model';

describe('key binding validation', () => {
  it('accepts a complete default configuration and rejects missing or extra actions', () => {
    expect(validKeyBindings({ ...DEFAULT_BINDINGS })).toBe(true);
    const partial: Partial<KeyBindings> = { ...DEFAULT_BINDINGS };
    delete partial.forward;
    expect(validKeyBindings(partial)).toBe(false);
    expect(validKeyBindings({ ...DEFAULT_BINDINGS, unknown: 'KeyQ' })).toBe(false);
    for (const value of [null, [], 'KeyW', 1]) expect(validKeyBindings(value)).toBe(false);
    expect(new Set(ACTIONS.map(item => item.action)).size).toBe(17);
  });

  it('normalizes both modifier sides without accepting browser reserved or unknown codes', () => {
    for (const [code, expected] of [
      ['ShiftLeft', 'Shift'], ['ShiftRight', 'Shift'], ['ControlLeft', 'Control'],
      ['ControlRight', 'Control'], ['AltLeft', 'Alt'], ['AltRight', 'Alt'],
      ['KeyQ', 'KeyQ'], ['Digit0', 'Digit0'], ['F4', 'F4'], ['F10', 'F10'], ['Mouse1', 'Mouse1'],
    ]) expect(normalizeBindingCode(code)).toBe(expected);
    for (const code of ['F5', 'F11', 'F12', 'MetaLeft', 'CapsLock', 'Mouse3', 'KeyQQ', 'keyw', '']) {
      expect(normalizeBindingCode(code)).toBeNull();
      expect(validKeyBindings({ ...DEFAULT_BINDINGS, forward: code })).toBe(false);
    }
  });

  it('rejects normalized duplicates and preserves Escape as the emergency pause key', () => {
    expect(bindingIssue({ ...DEFAULT_BINDINGS, forward: 'ShiftLeft', backward: 'ShiftRight' })).toBeTruthy();
    expect(bindingIssue({ ...DEFAULT_BINDINGS, fire: 'KeyW' })).toBeTruthy();
    expect(bindingIssue({ ...DEFAULT_BINDINGS, interact: 'Escape', pause: 'KeyP' })).toBeTruthy();
    expect(validKeyBindings({ ...DEFAULT_BINDINGS, pause: 'KeyP' })).toBe(true);
    expect(validKeyBindings({ ...DEFAULT_BINDINGS, dodge: 'ShiftLeft' })).toBe(false);
  });

  it('limits mouse assignment to attacks while allowing keyboard fire and auxiliary actions', () => {
    expect(validKeyBindings({ ...DEFAULT_BINDINGS, fire: 'KeyQ', auxiliary: 'KeyR' })).toBe(true);
    expect(validKeyBindings({ ...DEFAULT_BINDINGS, fire: 'Mouse1' })).toBe(true);
    expect(validKeyBindings({ ...DEFAULT_BINDINGS, jump: 'Mouse1' })).toBe(false);
    expect(bindingIssue({ ...DEFAULT_BINDINGS, heal: 'Mouse1' })).toBeTruthy();
  });

  it('provides readable physical-key labels for settings and prompts', () => {
    expect(bindingLabel('KeyQ')).toBe('Q');
    expect(bindingLabel('Digit7')).toBe('7');
    expect(bindingLabel('ShiftRight')).toBe('Shift');
    expect(bindingLabel('Mouse0')).toContain('클릭');
    expect(bindingLabel('Escape')).toBe('Esc');
  });
});

describe('key binding settings markup', () => {
  it('exposes every action and keeps Apply disabled for waiting or conflicting drafts', () => {
    const waiting = keybindingMarkup({ ...DEFAULT_BINDINGS, forward: 'KeyZ' }, 'forward', null);
    for (const { action } of ACTIONS) expect(waiting).toContain(`data-action="bind-${action}"`);
    expect(waiting).toMatch(/data-action="bindings-apply"[^>]*disabled/);
    expect(waiting).toContain('Esc');
    expect(waiting).toContain('binding-status');
    const conflict = keybindingMarkup({ ...DEFAULT_BINDINGS, forward: 'KeyS' }, null, null);
    expect(conflict).toMatch(/data-action="bindings-apply"[^>]*disabled/);
    expect(conflict).toContain('중복');
    const valid = keybindingMarkup({ ...DEFAULT_BINDINGS, forward: 'KeyZ' }, null, null);
    expect(valid).not.toMatch(/data-action="bindings-apply"[^>]*disabled/);
    expect(valid).toContain('data-action="bindings-reset"');
    expect(valid).toContain('data-action="bindings-cancel"');
  });

  it('escapes invalid draft codes and status messages as text', () => {
    const markup = keybindingMarkup({ ...DEFAULT_BINDINGS, fire: '<script>bad()</script>' }, null, '<img src=x>');
    expect(markup).not.toContain('<script>');
    expect(markup).not.toContain('<img');
    expect(markup).toContain('&lt;img');
  });
});

const PLAYER: Player = {
  x: 0, y: 0, hp: 100, aim: 0, lastX: 0, lastY: 0, dodgeRemaining: 0,
  dodgeX: 0, dodgeY: 0, dodgeCooldown: 0, invulnerable: 0, fireCooldown: 0,
};

function controlsFixture(bindings?: KeyBindings) {
  const doc = Object.assign(new EventTarget(), { activeElement: null as { tagName: string } | null,
    pointerLockElement: null });
  const win = new EventTarget();
  const canvas = Object.assign(new EventTarget(), { tagName: 'CANVAS', focus() { doc.activeElement = canvas; },
    requestPointerLock() { return Promise.resolve(); } });
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win);
  const state = { enabled: true, pauses: 0, maps: 0, interactions: 0, inventories: 0, bindings };
  const controls = new FpsControls(canvas as unknown as HTMLCanvasElement, () => state.enabled,
    () => { state.pauses++; }, () => { state.maps++; state.enabled = !state.enabled; return true; },
    () => { state.interactions++; }, () => { state.inventories++; }, () => 1, () => state.bindings);
  controls.yaw = 0;
  function key(type: 'keydown' | 'keyup', code: string, extra: Record<string, unknown> = {}) {
    const event = Object.assign(new Event(type, { cancelable: true }), { code, repeat: false,
      isComposing: false, keyCode: 0, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...extra });
    win.dispatchEvent(event); return event;
  }
  function mouse(type: 'mousedown' | 'mouseup', button: number) {
    const event = Object.assign(new Event(type, { cancelable: true }), { button,
      ctrlKey: false, altKey: false, metaKey: false, shiftKey: false });
    (type === 'mousedown' ? canvas : win).dispatchEvent(event);
  }
  return { controls, state, doc, key, mouse, canvas, win };
}

describe('FPS bindings', () => {
  it('keeps existing keyboard movement and default mouse actions when no binding getter value exists', () => {
    const { controls, key, mouse } = controlsFixture();
    key('keydown', 'KeyW'); expect(controls.moving).toBe(true);
    expect(controls.consume(PLAYER).moveX).toBe(1);
    key('keyup', 'KeyW'); expect(controls.moving).toBe(false);
    mouse('mousedown', 0); expect(controls.consume(PLAYER).fire).toBe(true);
    mouse('mouseup', 0); expect(controls.consume(PLAYER).fire).toBe(false);
    mouse('mousedown', 2); expect(controls.consume(PLAYER).auxiliary).toBe(true);
    expect(controls.consume(PLAYER).auxiliary).toBe(false);
  });

  it('uses the current movement and view bindings and releases them on keyup', () => {
    const { controls, state, key } = controlsFixture({ ...DEFAULT_BINDINGS, forward: 'KeyZ', lookRight: 'KeyL', lookUp: 'KeyU' });
    key('keydown', 'KeyW'); expect(controls.moving).toBe(false);
    expect(controls.consume(PLAYER).moveX).toBe(0);
    key('keydown', 'KeyZ'); key('keydown', 'KeyL'); key('keydown', 'KeyU');
    const input = controls.consume(PLAYER);
    expect(controls.moving).toBe(true); expect(input.moveX).toBeGreaterThan(0.99);
    expect(controls.yaw).toBeCloseTo(0.035); expect(input.aimPitch).toBeCloseTo(0.025);
    key('keyup', 'KeyZ'); key('keyup', 'KeyL'); key('keyup', 'KeyU');
    expect(controls.moving).toBe(false); expect(controls.consume(PLAYER).moveX).toBe(0);
    state.bindings = { ...DEFAULT_BINDINGS, forward: 'KeyQ' }; controls.clear();
    key('keydown', 'KeyQ'); expect(controls.moving).toBe(true);
  });

  it('holds keyboard fire and triggers auxiliary, dodge, jump and heal only once per physical press', () => {
    const { controls, key } = controlsFixture({ ...DEFAULT_BINDINGS, fire: 'KeyQ', auxiliary: 'KeyR',
      dodge: 'KeyC', jump: 'KeyJ', heal: 'KeyH' });
    for (const code of ['KeyQ', 'KeyR', 'KeyC', 'KeyJ', 'KeyH']) key('keydown', code);
    const first = controls.consume(PLAYER);
    expect(first).toMatchObject({ fire: true, auxiliary: true, dodge: true, jump: true, heal: true });
    for (const code of ['KeyR', 'KeyC', 'KeyJ', 'KeyH']) key('keydown', code, { repeat: true });
    expect(controls.consume(PLAYER)).toMatchObject({ fire: true, auxiliary: false, dodge: false, jump: false, heal: false });
    key('keydown', 'KeyR'); expect(controls.consume(PLAYER).auxiliary).toBe(false);
    key('keyup', 'KeyQ'); key('keyup', 'KeyR'); key('keydown', 'KeyR');
    expect(controls.consume(PLAYER)).toMatchObject({ fire: false, auxiliary: true });
    controls.clear(); key('keydown', 'KeyH', { repeat: true });
    expect(controls.consume(PLAYER).heal).toBe(false);
  });

  it('remaps mouse buttons for attacks without retaining default fire', () => {
    const { controls, mouse } = controlsFixture({ ...DEFAULT_BINDINGS, fire: 'Mouse2', auxiliary: 'Mouse1' });
    mouse('mousedown', 0); expect(controls.consume(PLAYER).fire).toBe(false);
    mouse('mousedown', 2); expect(controls.consume(PLAYER).fire).toBe(true);
    mouse('mousedown', 1); expect(controls.consume(PLAYER).auxiliary).toBe(true);
    mouse('mousedown', 1); expect(controls.consume(PLAYER).auxiliary).toBe(false);
    mouse('mouseup', 2); expect(controls.consume(PLAYER).fire).toBe(false);
    mouse('mouseup', 1); mouse('mousedown', 1); expect(controls.consume(PLAYER).auxiliary).toBe(true);
  });

  it('keeps Escape available after pause remapping and allows map toggles while the map disables gameplay', () => {
    const { state, doc, key } = controlsFixture({ ...DEFAULT_BINDINGS, pause: 'KeyP', map: 'KeyM' });
    key('keydown', 'KeyM'); expect(state).toMatchObject({ maps: 1, enabled: false });
    key('keydown', 'KeyM'); expect(state).toMatchObject({ maps: 1, enabled: false });
    key('keyup', 'KeyM'); key('keydown', 'KeyM'); expect(state).toMatchObject({ maps: 2, enabled: true });
    key('keydown', 'KeyP'); expect(state.pauses).toBe(1);
    state.enabled = false; doc.activeElement = { tagName: 'INPUT' };
    key('keydown', 'Escape'); expect(state.pauses).toBe(2);
    key('keydown', 'Escape', { repeat: true });
    key('keydown', 'Escape', { isComposing: true });
    key('keydown', 'Escape', { keyCode: 229 });
    expect(state.pauses).toBe(2);
  });

  it('leaves text fields, IME events and browser shortcuts to their owners while allowing Shift movement', () => {
    const { controls, state, doc, key } = controlsFixture({ ...DEFAULT_BINDINGS, forward: 'KeyZ', dodge: 'Control' });
    for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA']) {
      doc.activeElement = { tagName }; key('keydown', 'Tab'); key('keydown', 'KeyE'); key('keydown', 'KeyZ');
    }
    expect(state.maps).toBe(0); expect(state.interactions).toBe(0); expect(controls.moving).toBe(false);
    doc.activeElement = null;
    for (const extra of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }, { keyCode: 229 }]) {
      key('keydown', 'KeyZ', extra);
    }
    expect(controls.moving).toBe(false);
    key('keydown', 'KeyZ', { shiftKey: true }); expect(controls.moving).toBe(true);
    key('keydown', 'ControlRight', { ctrlKey: true }); expect(controls.consume(PLAYER).dodge).toBe(true);
  });

  it('keeps held modifier bindings active until both sides are released', () => {
    const { controls, key } = controlsFixture({ ...DEFAULT_BINDINGS, fire: 'Shift', dodge: 'KeyC' });
    key('keydown', 'ShiftLeft', { shiftKey: true }); key('keydown', 'ShiftRight', { shiftKey: true });
    expect(controls.consume(PLAYER).fire).toBe(true);
    key('keyup', 'ShiftLeft', { shiftKey: true }); expect(controls.consume(PLAYER).fire).toBe(true);
    key('keyup', 'ShiftRight'); expect(controls.consume(PLAYER).fire).toBe(false);
  });

  it('prevents bound gameplay keys from scrolling during autorepeat without repeating actions', () => {
    const { controls, key } = controlsFixture();
    key('keydown', 'ArrowDown');
    expect(key('keydown', 'ArrowDown', { repeat: true }).defaultPrevented).toBe(true);
    key('keydown', 'Space'); expect(controls.consume(PLAYER).jump).toBe(true);
    expect(key('keydown', 'Space', { repeat: true }).defaultPrevented).toBe(true);
    expect(controls.consume(PLAYER).jump).toBe(false);
  });

  it('clears held keyboard and mouse input when the browser loses focus', () => {
    const { controls, key, mouse, win } = controlsFixture();
    key('keydown', 'KeyW'); mouse('mousedown', 0); key('keydown', 'Space');
    win.dispatchEvent(new Event('blur'));
    expect(controls.moving).toBe(false);
    expect(controls.consume(PLAYER)).toMatchObject({ moveX: 0, moveY: 0, fire: false, jump: false });
  });
});

afterEach(() => vi.unstubAllGlobals());
