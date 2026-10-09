import { ACTIONS, bindingIssue, bindingLabel, type BindingAction, type KeyBindings } from '../core/keybindings';

const escapeText = (text: string) => text.replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export function keybindingMarkup(draft: KeyBindings, waiting: BindingAction | null, issue: string | null): string {
  const problem = issue ?? bindingIssue(draft);
  const waitingLabel = ACTIONS.find(item => item.action === waiting)?.label;
  const status = problem ?? (waitingLabel
    ? `${waitingLabel}에 사용할 키를 누르세요. Esc를 누르면 키 선택을 취소합니다.`
    : '동작의 키를 선택해 변경하세요. 적용할 때 저장됩니다.');
  return `<section class="binding-settings" aria-labelledby="modal-title">
    <h2 id="modal-title">키 설정</h2>
    <div class="binding-grid">${ACTIONS.map(({ action, label }) => `<div class="binding-row">
      <span>${label}</span><button type="button" data-action="bind-${action}" aria-label="${label} 키 변경"
        aria-pressed="${waiting === action}" aria-describedby="binding-status">${waiting === action
      ? '키 입력 대기…' : escapeText(bindingLabel(draft[action]))}</button></div>`).join('')}</div>
    <p id="binding-status" role="status" aria-live="polite">${escapeText(status)}</p>
    <p class="binding-help">Esc는 언제나 비상 취소·일시정지에 사용할 수 있습니다. 마우스 버튼은 사격·보조 무기에 지정할 수 있습니다. Ctrl·Alt 조합은 브라우저 단축키를 유지합니다.</p>
    <div class="menu-buttons">
      <button type="button" data-action="bindings-reset">기본값</button>
      <button type="button" data-action="bindings-apply"${waiting || problem ? ' disabled' : ''}>적용</button>
      <button type="button" data-action="bindings-cancel">취소</button>
    </div>
  </section>`;
}
