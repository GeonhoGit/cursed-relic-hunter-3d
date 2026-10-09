import type { RunState } from '../core/model';
import { currentRoom } from '../core/dungeon';
import { hasRelic, RELICS } from '../core/relics';
import { purchaseIssue, SHOP_HEAL, shopPayment } from '../core/shop';
import { growthStats } from '../core/growth';
import { rarityBadge, rarityGuideMarkup } from './relic-rarity-ui';

export function shopMarkup(s: RunState) {
  const shop = currentRoom(s)!.shop!, maxHp = growthStats(s).maxHp;
  return `<div class="modal-eyebrow">WANDERING MERCHANT · 방랑 상인</div>
    <h2 id="modal-title">다음 전투를 준비하세요.</h2>
    ${hasRelic(s, 'R37') ? '<p class="modal-description">피의 지갑 · 유물 20 생명력 / 저주 15 생명력 · 결제 후 생명력 1 이상 유지 · 회복품 구매 불가</p>' : hasRelic(s, 'R33') ? '<p class="modal-description">상인의 저울 · 금화 가격 20% 할인 · 소수 올림</p>' : ''}
    <div class="shop-wallet"><span>생명력 <b>${Number(s.player.hp.toFixed(1))} / ${maxHp}</b></span><span>보유 금화 <b>◈ ${s.gold}</b></span></div>
    ${rarityGuideMarkup()}
    <div class="shop-stock">${shop.slots.map((slot, index) => {
      const relic = slot.relic ? RELICS[slot.relic] : null, healing = slot.kind === 'heal';
      const name = healing ? '작은 회복약' : relic?.name ?? '빈 진열대';
      const description = healing ? hasRelic(s,'R39')?`회복량 ${SHOP_HEAL}을 휴대합니다. 현재 ${s.recoveryItems?.length ?? 0}/3개 · F로 사용합니다.`:`생명력을 ${SHOP_HEAL} 회복합니다. 최대 생명력은 ${maxHp}입니다.` : relic?.description ?? '아직 구매할 수 있는 유물이 없습니다.';
      const issue = purchaseIssue(s, index), payment = shopPayment(s, slot);
      const cost = payment ? `${payment.amount} ${payment.resource === 'health' ? '생명력' : '금화'}` : '회복품 구매 불가';
      const icon = payment ? payment.resource === 'health' ? '♥ ' : '◈ ' : '';
      const rarity = healing ? 'common' : relic?.rarity;
      return `<article class="shop-item ${slot.kind}${slot.purchased ? ' sold' : ''}" ${rarity ? `data-rarity="${rarity}"` : ''}>
        <div class="shop-item-heading"><span aria-hidden="true">${healing ? '✚' : relic?.icon ?? '—'}</span><div><div class="relic-meta">${rarity ? rarityBadge(rarity) : ''}<small>${healing ? '생명력 회복 · 고정 판매' : slot.kind === 'curse' ? '저주 유물 · 대가를 확인하세요' : '유물'}</small></div><h3>${name}</h3></div></div>
        <p>${description}</p><button data-action="buy-${index}" data-revision="${shop.revision}" ${issue ? 'disabled' : ''} aria-label="${name} · ${cost} · ${issue || '구매'}"><span>${icon}${cost}</span><span>${issue || '구매 ↗'}</span></button>
      </article>`;
    }).join('')}</div>
    <div class="modal-actions"><button class="primary" data-action="close">탐험으로 돌아가기</button></div>
    <p class="modal-footnote">구매하면 저장 후 바로 탐험합니다. 이 방에서 <kbd>E</kbd>로 다시 거래할 수 있습니다.</p>`;
}
