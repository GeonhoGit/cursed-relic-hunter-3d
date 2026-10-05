import type { RelicRarity } from '../core/model';
import { RELIC_RARITIES } from '../core/relic-rarity';

export function rarityBadge(rarity: RelicRarity) {
  return `<span class="rarity-badge" data-rarity="${rarity}" aria-label="${RELIC_RARITIES[rarity].name} 등급">${RELIC_RARITIES[rarity].name}</span>`;
}

export function rarityGuideMarkup() {
  return `<details class="rarity-guide"><summary>유물 등급과 등장 확률</summary>
    <table class="rarity-table"><caption>유물 후보 1칸 기준 · 기본 확률</caption>
      <thead><tr><th scope="col">등급</th><th scope="col">등장 확률</th></tr></thead>
      <tbody>${(Object.keys(RELIC_RARITIES) as RelicRarity[]).map(rarity =>
        `<tr><th scope="row">${rarityBadge(rarity)}</th><td>${RELIC_RARITIES[rarity].weight}%</td></tr>`).join('')}</tbody>
    </table><p>등급 안에서는 남은 유물을 같은 확률로 뽑습니다. 보유·해금 조건을 적용하고, 후보가 없는 등급은 제외해 나머지 확률을 비례 조정합니다. 한 선택창에는 같은 유물이 중복되지 않습니다.</p>
    <p>새로고침도 같은 규칙을 적용하며 이전 후보와 최대한 겹치지 않게 뽑습니다. 제단은 고정 제안이며, 상점의 저주 진열대·회복약은 별도입니다.</p></details>`;
}
