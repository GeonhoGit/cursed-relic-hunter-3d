import type { RunState } from './model';
import { growthStats } from './growth';
import { hasRelic } from './relics';
import { currentRoom } from './dungeon';
import { mossAfterCombat } from './relic-survival';

export const CHALICE = { perKill: 2, roomCap: 12 } as const;

export const receivedDamage = (s: RunState, damage: number) => damage * (hasRelic(s, 'R53') ? 0.85 : 1);

function healLivingPlayer(s: RunState, amount: number) {
  const before = s.player.hp;
  if (s.player.hp > 0) s.player.hp = Math.min(growthStats(s).maxHp, s.player.hp + amount);
  return s.player.hp - before;
}
export function healOnKill(s: RunState) {
  if (!hasRelic(s, 'R56')) return;
  const room = currentRoom(s) ?? s, healed = room.chaliceHealed ?? 0;
  if (healed >= CHALICE.roomCap) return;
  const recovered = healLivingPlayer(s, Math.min(CHALICE.perKill, CHALICE.roomCap - healed));
  if (recovered > 0) room.chaliceHealed = Math.min(CHALICE.roomCap, healed + recovered);
}
export function healAfterCombat(s: RunState) { if (hasRelic(s, 'R54')) healLivingPlayer(s, 5); mossAfterCombat(s); }
