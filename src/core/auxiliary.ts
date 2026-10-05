import type { Point, RunState } from './model';
import { hasRelic } from './relics';
import { placeBomb } from './bombs';
import { startTimeStop } from './time-debt';

export type AuxiliaryId = 'R13' | 'R43';
export const isAuxiliary = (id: string): id is AuxiliaryId => id === 'R13' || id === 'R43';
export function activeAuxiliary(s: RunState): AuxiliaryId | null {
  const id = s.player.equippedAux;
  if (id === undefined) return hasRelic(s, 'R13') ? 'R13' : null;
  return id && hasRelic(s, id) ? id : null;
}
export function equipAuxiliary(s: RunState, id: AuxiliaryId): boolean {
  if (!['explore', 'cleared'].includes(s.phase) || !hasRelic(s, id)) return false;
  s.player.equippedAux = id; return true;
}
export function useAuxiliary(s: RunState, aim: Point): boolean {
  if (s.phase !== 'combat' && s.phase !== 'explore') return false;
  const id = activeAuxiliary(s);
  if (id === 'R13') {
    if (s.player.auxCooldown || s.bombs?.length) return false;
    placeBomb(s, aim); return true;
  }
  if (id === 'R43' && !s.player.timeCooldown && !s.timeStop) { startTimeStop(s); return true; }
  return false;
}
