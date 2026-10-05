import type { RelicId, RunState } from './model';
import { normalRelics } from './relics';
import { syncDodgeCharges } from './dodge';
import { activeAuxiliary, isAuxiliary } from './auxiliary';

export function canAcquireRelic(s: RunState, id: RelicId): boolean {
  return !!s.expedition && !s.expedition.acquired.includes(id) && (id !== 'R38' || normalRelics(s).length >= 2)
    && (!['R11', 'R12'].includes(id) || firstCombatCleared(s));
}
function firstCombatCleared(s: RunState): boolean {
  const e = s.expedition!;
  return !!s.growth?.firstRoomCleared || (e.route === 'maze'
    ? [e.dungeon, e.previousDungeon, e.earlierDungeon].some(d => d?.rooms.some(r => r.kind === 'combat' && r.cleared))
    : e.room > 0 || s.phase === 'cleared');
}
export function grantRelic(s: RunState, id: RelicId): boolean {
  if (!canAcquireRelic(s, id)) return false;
  const e = s.expedition!, firstAuxiliary = isAuxiliary(id) && !e.acquired.some(isAuxiliary), equipped = activeAuxiliary(s);
  e.acquired.push(id); e.relics.push(id);
  if (id === 'R25') syncDodgeCharges(s);
  if (firstAuxiliary && isAuxiliary(id)) s.player.equippedAux = id;
  else if (isAuxiliary(id) && s.player.equippedAux === undefined) s.player.equippedAux = equipped;
  return true;
}
