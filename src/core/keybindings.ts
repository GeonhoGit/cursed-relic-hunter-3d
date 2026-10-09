export type BindingAction =
  | 'forward' | 'backward' | 'left' | 'right'
  | 'lookLeft' | 'lookRight' | 'lookUp' | 'lookDown'
  | 'fire' | 'auxiliary' | 'dodge' | 'jump' | 'interact' | 'heal' | 'inventory' | 'map' | 'pause';

export type KeyBindings = Record<BindingAction, string>;

export const ACTIONS = [
  { action: 'forward', label: '앞으로 이동' }, { action: 'backward', label: '뒤로 이동' },
  { action: 'left', label: '왼쪽 이동' }, { action: 'right', label: '오른쪽 이동' },
  { action: 'lookLeft', label: '왼쪽 보기' }, { action: 'lookRight', label: '오른쪽 보기' },
  { action: 'lookUp', label: '위 보기' }, { action: 'lookDown', label: '아래 보기' },
  { action: 'fire', label: '사격' }, { action: 'auxiliary', label: '보조 무기' },
  { action: 'dodge', label: '회피' }, { action: 'jump', label: '점프' },
  { action: 'interact', label: '상호작용' }, { action: 'heal', label: '회복' },
  { action: 'inventory', label: '인벤토리' }, { action: 'map', label: '지도' },
  { action: 'pause', label: '일시정지' },
] as const satisfies readonly { action: BindingAction; label: string }[];

export const DEFAULT_BINDINGS: KeyBindings = Object.freeze({
  forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD',
  lookLeft: 'ArrowLeft', lookRight: 'ArrowRight', lookUp: 'ArrowUp', lookDown: 'ArrowDown',
  fire: 'Mouse0', auxiliary: 'Mouse2', dodge: 'Shift', jump: 'Space',
  interact: 'KeyE', heal: 'KeyF', inventory: 'KeyI', map: 'Tab', pause: 'Escape',
});

const SPECIAL_CODES = new Set([
  'Space', 'Shift', 'Control', 'Alt', 'Tab', 'Enter', 'Escape',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
  'Semicolon', 'Quote', 'Comma', 'Period', 'Slash',
  'F1', 'F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10',
  'Mouse0', 'Mouse1', 'Mouse2',
]);

export function normalizeBindingCode(code: string): string | null {
  const modifier = /^(Shift|Control|Alt)(Left|Right)$/.exec(code);
  const normalized = modifier ? modifier[1] : code;
  return SPECIAL_CODES.has(normalized) || /^Key[A-Z]$/.test(normalized) || /^Digit[0-9]$/.test(normalized)
    ? normalized : null;
}

const KEY_LABELS: Record<string, string> = {
  Space: 'Space', Control: 'Ctrl', Escape: 'Esc',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  Mouse0: '좌클릭', Mouse1: '휠 클릭', Mouse2: '우클릭',
};

export function bindingLabel(code: string): string {
  const normalized = normalizeBindingCode(code) ?? code;
  return KEY_LABELS[normalized] ?? normalized.replace(/^(Key|Digit)/, '');
}

export function bindingIssue(draft: unknown): string | null {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)
    || Reflect.ownKeys(draft).length !== ACTIONS.length) return '모든 동작에 키를 지정해 주세요.';
  const value = draft as Record<string, unknown>;
  const used = new Map<string, string>();
  for (const { action, label } of ACTIONS) {
    if (!Object.hasOwn(value, action) || typeof value[action] !== 'string') return `${label} 키를 선택해 주세요.`;
    const code = normalizeBindingCode(value[action] as string);
    if (!code) return `${label}: 사용할 수 없는 키입니다.`;
    if (code === 'Escape' && action !== 'pause') return 'Esc는 비상 취소와 일시정지에만 사용할 수 있습니다.';
    if (code.startsWith('Mouse') && action !== 'fire' && action !== 'auxiliary') {
      return '마우스 버튼은 사격과 보조 무기에만 사용할 수 있습니다.';
    }
    const previous = used.get(code);
    if (previous) return `${previous}와 ${label}에 ${bindingLabel(code)} 키가 중복됩니다.`;
    used.set(code, label);
  }
  if (ACTIONS.some(({ action }) => normalizeBindingCode(value[action] as string) !== value[action])) {
    return 'Shift, Ctrl, Alt는 좌우 공통 키로 지정해 주세요.';
  }
  return null;
}

export function validKeyBindings(value: unknown): value is KeyBindings {
  return bindingIssue(value) === null;
}
