import type { GrowthProfile, WeaponId } from '../core/model';
import { growthStats } from '../core/growth';
import { WEAPONS, weaponUnlocked } from '../core/weapons';

export function weaponMarkup(profile: GrowthProfile, draft: WeaponId, feedback: string) {
  return `<div class="modal-eyebrow">THE HUNTER'S ARMORY · 무기 선택</div><h2 id="modal-title">다음 탐험에 가져갈 무기</h2>
    <p class="modal-description">꾸준한 단발, 근접 산탄, 강한 쇠뇌, 관통 마력탄. 저장한 성장 투자가 아래 수치에 반영됩니다.</p>
    <div class="weapon-choices">${(Object.keys(WEAPONS) as WeaponId[]).map(id => {
      const w = WEAPONS[id], unlocked = weaponUnlocked(profile, id), chosen = draft === id;
      const stats = growthStats({ weapon: id, growth: { id: 'preview', investment: profile.investment } });
      return `<article class="weapon-card ${chosen ? 'selected' : ''}" data-weapon="${id}">
        <div class="weapon-card-top"><small>${id} · ${w.targets > 1 ? '관통 마법' : w.pellets === 1 ? '정밀 사격' : '근접 산탄'}</small><span>${unlocked ? chosen ? '선택됨' : '사용 가능' : '잠김'}</span></div>
        <div class="weapon-emblem" aria-hidden="true">${w.icon}</div><h3>${w.name}</h3><p>${w.description}</p>
        <dl><div><dt>탄환당 피해</dt><dd>${Number(stats.damage.toFixed(3))}</dd></div><div><dt>발사 간격</dt><dd>${(stats.fireInterval / 60).toFixed(3)}초</dd></div><div><dt>한 번에</dt><dd>${w.pellets}발</dd></div></dl>
        <div class="weapon-unlock">${unlocked ? id === 'W01' ? w.unlock : `${id === 'W04' ? '유물 심장' : id === 'W03' ? '사슬의 사제' : '문지기'} 처치 · 영구 해금 완료` : w.unlock + ' 시 해금'}</div>
        <button class="secondary" data-action="weapon-pick-${id}" aria-label="${w.name} 선택" aria-pressed="${chosen}" ${unlocked ? '' : 'disabled'}>${chosen ? '선택됨 ✓' : unlocked ? '이 무기 선택' : '해금 필요'}</button></article>`;
    }).join('')}</div>
    <p class="growth-note">선택은 새 탐험부터 적용됩니다. 이어하기에서는 출발한 무기를 유지합니다.<br>무기 해금은 사망하거나 투자를 초기화해도 남습니다.</p>
    <div id="weapon-feedback" class="growth-feedback" role="status">${feedback || '선택 저장을 누르면 다음 출발 무기가 바뀝니다.'}</div>
    <div class="modal-actions"><button class="primary" data-action="weapon-save">선택 저장</button><button class="secondary" data-action="close">야영지로 돌아가기</button></div>`;
}
