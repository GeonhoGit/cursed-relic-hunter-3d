import type { RunState } from './model';
import { growthStats } from './growth';
import { hasRelic } from './relics';

export function recoveryIssue(s: RunState): string {
  return hasRelic(s, 'R39') ? (s.recoveryItems?.length ?? 0) >= 3 ? '휴대 회복품 3개가 가득 찼습니다.' : ''
    : s.player.hp >= growthStats(s).maxHp ? '생명력 최대' : '';
}
export function receiveRecovery(s: RunState, pickupId: string, healAmount: number, source: 'floor' | 'shop'): boolean {
  if (recoveryIssue(s)) return false;
  if (hasRelic(s, 'R39')) {
    if (s.recoveryItems?.some(i => i.pickupId === pickupId)) return false;
    (s.recoveryItems ??= []).push({ pickupId, healAmount, source, order: s.recoveryOrder = (s.recoveryOrder ?? 0) + 1 });
  } else s.player.hp = Math.min(growthStats(s).maxHp, s.player.hp + healAmount);
  return true;
}
export function startRecovery(s: RunState): boolean {
  if (!hasRelic(s, 'R39') || !['combat', 'explore'].includes(s.phase) || s.recoveryCast || !s.recoveryItems?.length
    || s.player.hp >= growthStats(s).maxHp || s.absorption) return false;
  s.recoveryCast = { pickupId: s.recoveryItems[0].pickupId, ticks: 30 }; return true;
}
export function cancelRecovery(s: RunState) { delete s.recoveryCast; }
export function ageRecovery(s: RunState) {
  if (!hasRelic(s, 'R39')) { delete s.recoveryItems; delete s.recoveryCast; delete s.recoveryOrder; return; }
  if (!s.recoveryCast || --s.recoveryCast.ticks > 0) return;
  const item = s.recoveryItems?.[0];
  if (item?.pickupId === s.recoveryCast.pickupId && s.player.hp < growthStats(s).maxHp) {
    s.player.hp = Math.min(growthStats(s).maxHp, s.player.hp + item.healAmount); s.recoveryItems!.shift();
    s.notice = `회복품 사용 · 생명력 +${item.healAmount}`;
  }
  delete s.recoveryCast;
}
