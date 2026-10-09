import type { RunState, ShopSlot } from './model';
import { currentRoom } from './dungeon';
import { hasRelic, isCurse, RELIC_IDS } from './relics';
import { canAcquireRelic, canOfferRelic, grantRelic } from './relic-acquisition';
import { drawRelic } from './relic-rarity';
import { receiveRecovery, recoveryIssue } from './recovery';

export const SHOP_PRICES = { relic: 24, curse: 30, heal: 20 } as const;
export const SHOP_HEAL = 15;
export const shopPrice = (s: RunState, slot: Pick<ShopSlot, 'kind'>) => Math.ceil(SHOP_PRICES[slot.kind] * (hasRelic(s, 'R33') ? .8 : 1));
export type ShopPayment = { resource: 'gold' | 'health'; amount: number };
export function shopPayment(s: RunState, slot: Pick<ShopSlot, 'kind'>): ShopPayment | null {
  if (hasRelic(s, 'R37')) return slot.kind === 'heal' ? null : { resource: 'health', amount: slot.kind === 'curse' ? 15 : 20 };
  return { resource: 'gold', amount: shopPrice(s, slot) };
}
export function refreshShop(s: RunState): boolean {
  const room = currentRoom(s);
  if (room?.kind !== 'shop' || s.phase !== 'explore') return false;
  let changed = !room.shop;
  const shop = room.shop ??= { revision: 0, slots: (['relic', 'relic', 'heal', 'curse'] as const)
    .map(kind => ({ kind, relic: null, purchased: false, repairCounter: 0 })) };
  shop.slots.forEach((slot, index) => {
    if (slot.purchased || slot.kind === 'heal' || (slot.relic && canAcquireRelic(s, slot.relic))) return;
    const pool = RELIC_IDS.filter(id => isCurse(id) === (slot.kind === 'curse') && canOfferRelic(s, id)
      && !shop.slots.some(other => other !== slot && other.relic === id));
    // Slot-local randomness preserves combat RNG and the other displayed offers.
    const counter = shop.revision === 0 ? 0 : slot.repairCounter + 1;
    const rng = { rng: ((s.seed ^ Math.imul(room.id + 1, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)
      ^ Math.imul(counter + 1, 0xc2b2ae35)) >>> 0) || 1 };
    const relic = drawRelic(rng, pool);
    if (relic !== slot.relic) { slot.relic = relic; slot.repairCounter = counter; changed = true; }
  });
  if (changed) shop.revision++;
  return changed;
}
export function purchaseIssue(s: RunState, index: number): string {
  const room = currentRoom(s), slot: ShopSlot | undefined = room?.shop?.slots[index];
  if (s.phase !== 'explore' || room?.kind !== 'shop' || !slot) return '상점에서만 구매 가능';
  if (slot.purchased) return '판매 완료';
  const payment = shopPayment(s, slot);
  if (!payment) return '피의 지갑으로 회복품 구매 불가';
  if (slot.kind === 'heal') { const issue = recoveryIssue(s); if (issue) return issue; }
  else if (!slot.relic || !canAcquireRelic(s, slot.relic)) return '구매 가능한 유물 없음';
  if (payment.resource === 'health') {
    if (s.player.hp - payment.amount < 1) return `생명력 ${payment.amount + 1} 이상 필요 · 결제 후 1 이상 유지`;
  } else if (s.gold < payment.amount) return '금화 부족';
  return '';
}
export function buyFromShop(s: RunState, index: number, revision: number): 'bought' | 'changed' | 'unavailable' {
  const room = currentRoom(s);
  if (s.phase !== 'explore' || room?.kind !== 'shop') return 'unavailable';
  refreshShop(s);
  const shop = room.shop!;
  if (shop.revision !== revision) return 'changed';
  if (purchaseIssue(s, index)) return 'unavailable';
  const slot = shop.slots[index], payment = shopPayment(s, slot);
  if (!payment) return 'unavailable';
  if (slot.kind === 'heal') { if (!receiveRecovery(s, `${s.seed}-${s.expedition?.region ?? 1}-${room.id}-shop-${index}`, SHOP_HEAL, 'shop')) return 'unavailable'; }
  else if (!slot.relic || !grantRelic(s, slot.relic)) return 'unavailable';
  if (payment.resource === 'health') s.player.hp -= payment.amount;
  else s.gold -= payment.amount;
  slot.purchased = true; shop.revision++;
  refreshShop(s);
  return 'bought';
}
