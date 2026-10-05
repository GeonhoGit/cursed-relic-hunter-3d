import type { RunState, ShopSlot } from './model';
import { currentRoom } from './dungeon';
import { isCurse, RELIC_IDS } from './relics';
import { canAcquireRelic, grantRelic } from './relic-acquisition';
import { drawRelic } from './relic-rarity';
import { growthStats } from './growth';

export const SHOP_PRICES = { relic: 24, curse: 30, heal: 20 } as const;
export const SHOP_HEAL = 15;
export function refreshShop(s: RunState): boolean {
  const room = currentRoom(s);
  if (room?.kind !== 'shop' || s.phase !== 'explore') return false;
  let changed = !room.shop;
  const shop = room.shop ??= { revision: 0, slots: (['relic', 'relic', 'heal', 'curse'] as const)
    .map(kind => ({ kind, relic: null, purchased: false, repairCounter: 0 })) };
  shop.slots.forEach((slot, index) => {
    if (slot.purchased || slot.kind === 'heal' || (slot.relic && canAcquireRelic(s, slot.relic))) return;
    const pool = RELIC_IDS.filter(id => isCurse(id) === (slot.kind === 'curse') && canAcquireRelic(s, id)
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
  if (slot.kind === 'heal') { if (s.player.hp >= growthStats(s).maxHp) return '생명력 최대'; }
  else if (!slot.relic || !canAcquireRelic(s, slot.relic)) return '구매 가능한 유물 없음';
  if (s.gold < SHOP_PRICES[slot.kind]) return '금화 부족';
  return '';
}
export function buyFromShop(s: RunState, index: number, revision: number): 'bought' | 'changed' | 'unavailable' {
  const room = currentRoom(s);
  if (s.phase !== 'explore' || room?.kind !== 'shop') return 'unavailable';
  refreshShop(s);
  const shop = room.shop!;
  if (shop.revision !== revision) return 'changed';
  if (purchaseIssue(s, index)) return 'unavailable';
  const slot = shop.slots[index];
  if (slot.kind === 'heal') s.player.hp = Math.min(growthStats(s).maxHp, s.player.hp + SHOP_HEAL);
  else if (!slot.relic || !grantRelic(s, slot.relic)) return 'unavailable';
  s.gold -= SHOP_PRICES[slot.kind]; slot.purchased = true; shop.revision++;
  refreshShop(s);
  return 'bought';
}
