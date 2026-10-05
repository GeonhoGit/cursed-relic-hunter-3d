import type { GrowthProfile, GrowthStat, Investment } from '../core/model';
import { earnedPoints, GROWTH_LIMITS, growthGoals, growthStats, investedPoints } from '../core/growth';
import { selectedWeapon, WEAPONS } from '../core/weapons';

export const GROWTH_LABELS: Record<GrowthStat, string> = { health: '체력', attack: '공격력', speed: '공격 속도', movement: '이동 속도', dodge: '회피 재사용' };
export function growthMarkup(profile: GrowthProfile, draft: Investment, feedback: string) {
  const earned = earnedPoints(profile), remaining = earned - investedPoints(draft);
  const weapon = selectedWeapon(profile), stats = growthStats({ weapon, growth: { id: 'preview', investment: draft } });
  const effects = { health: `최대 생명력 ${stats.maxHp}`, attack: `탄환당 피해 ${Number(stats.damage.toFixed(3))}`, speed: `발사 간격 ${(stats.fireInterval / 60).toFixed(3)}초`, movement: `이동 ${(stats.moveSpeed * 0.04).toFixed(1)}m/s`, dodge: `충전 ${(stats.dodgeRecharge / 60).toFixed(3)}초` };
  const rates = { health: '+1%', attack: '+0.5%', speed: '+0.5%', movement: '+0.3%', dodge: '−0.5%' };
  return `<div class="modal-eyebrow">HUNTER'S LEGACY · 영구 성장</div><h2 id="modal-title">다음 탐험을 위한 성장</h2>
    <div class="growth-wallet" id="growth-budget"><span>획득 <b>${earned} P</b></span><span>미사용 <b>${remaining} P</b></span><small>현재 목표 최대 ${growthGoals(profile).length * 5}P · 전체 성장 상한 60P</small></div>
    <div class="growth-columns"><section class="growth-investments" aria-label="능력 투자"><h3>능력 투자 <small>1포인트씩 · 무료 재분배</small></h3>
      ${(Object.keys(GROWTH_LABELS) as GrowthStat[]).map(stat => `<div class="growth-row"><div><b>${GROWTH_LABELS[stat]} <small>${rates[stat]} / P</small></b><span>${effects[stat]}</span></div>
        <div class="growth-controls"><button data-action="growth-sub-${stat}" aria-label="${GROWTH_LABELS[stat]} 1포인트 회수" ${draft[stat] <= 0 ? 'disabled' : ''}>−</button>
        <output id="growth-value-${stat}" aria-label="${GROWTH_LABELS[stat]} 투자">${draft[stat]}<small>/${GROWTH_LIMITS[stat]}</small></output>
        <button data-action="growth-add-${stat}" aria-label="${GROWTH_LABELS[stat]} 1포인트 추가" ${remaining <= 0 || draft[stat] >= GROWTH_LIMITS[stat] ? 'disabled' : ''}>+</button></div></div>`).join('')}
      <button class="growth-reset" data-action="growth-reset">투자 초기화</button></section>
      <section class="growth-goals" aria-label="영구 목표"><h3>탐험 목표 <small>목표마다 한 번 · 5P</small></h3>
      ${growthGoals(profile).map(g => `<div class="growth-goal ${g.count >= g.target ? 'complete' : ''}" data-goal="${g.id}"><div><b>${g.title}</b><span>${g.description}</span></div><strong>${g.count >= g.target ? '달성 ✓' : `${g.count} / ${g.target}`}</strong></div>`).join('')}</section></div>
    <p class="growth-note">기준 무기 · ${WEAPONS[weapon].name}. 투자는 새 탐험부터 적용됩니다.<br>이어하기의 능력·생명력은 유지되며 사망해도 목표와 포인트는 남습니다.</p>
    <div id="growth-feedback" class="growth-feedback" role="status">${feedback || '변경한 투자는 저장해야 다음 탐험에 반영됩니다.'}</div>
    <div class="modal-actions"><button class="primary" data-action="growth-save">투자 저장</button><button class="secondary" data-action="close">야영지로 돌아가기</button></div>`;
}
