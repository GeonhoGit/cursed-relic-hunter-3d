import { AUXILIARY_IDS, type AuxiliaryId, type Point, type RunState } from './model';
import { hasRelic } from './relics';
import { placeBomb } from './bombs';
import { startTimeStop } from './time-debt';

import { placeStoneWall } from './masonry';
import { charmEnemy } from './allegiance';
import { placeScarecrow } from './scarecrow';
import { useAnchor } from './anchor';
import { placePortal } from './portal';
import { startAbsorption, breakStealth } from './shadow-absorb';
export type { AuxiliaryId } from './model';
export const isAuxiliary = (id: string): id is AuxiliaryId => AUXILIARY_IDS.includes(id as AuxiliaryId);
export function activeAuxiliary(s: RunState): AuxiliaryId | null {
  const id = s.player.equippedAux;
  if (id === undefined) return hasRelic(s, 'R13') ? 'R13' : null;
  return id && hasRelic(s, id) ? id : null;
}
export function equipAuxiliary(s: RunState, id: AuxiliaryId): boolean {
  if (!['explore', 'cleared'].includes(s.phase) || !hasRelic(s, id)) return false;
  s.player.equippedAux = id; return true;
}
export const auxiliaryCooldown = (s:RunState,id:AuxiliaryId) => (id==='R13'?s.player.auxCooldown:id==='R43'?s.player.timeCooldown:s.player.auxCooldowns?.[id]) ?? 0;
export const auxiliaryDuration = (id:AuxiliaryId) => ({R13:480,R16:600,R17:840,R18:720,R26:600,R40:720,R42:840,R43:1080})[id];
export function useAuxiliary(s: RunState, aim: Point, pitch?: number): boolean {
  if (s.phase !== 'combat' && s.phase !== 'explore') return false;
  if(s.recoveryCast||s.absorption)return false;
  const id = activeAuxiliary(s);
  let used = false;
  if (id === 'R16') used = placeStoneWall(s, aim);
  if (id === 'R17') used = charmEnemy(s, aim, pitch);
  if (id === 'R18') used = placeScarecrow(s, aim);
  if (id === 'R26') used = useAnchor(s);
  if (id === 'R40') used = placePortal(s,aim);
  if (id === 'R42') used = startAbsorption(s);
  if (id === 'R13') {
    if (s.player.auxCooldown || s.bombs?.length) return false;
    placeBomb(s, aim); used = true;
  }
  if (id === 'R43' && !s.player.timeCooldown && !s.timeStop) { startTimeStop(s); used = true; }
  if(used&&id){
    // The first portal and anchor placement do not start a new cooldown.
    if(id!=='R26'&&id!=='R40'||id==='R26'&&!s.anchor||id==='R40'&&s.portals?.second){delete s.player.cooldownCredits?.[id];if(s.player.cooldownCredits&&!Object.keys(s.player.cooldownCredits).length)delete s.player.cooldownCredits;}
    if(id==='R13')breakStealth(s,true);
  }
  if (used && id && s.growth) { const ids = s.growth.auxiliaryUsed ??= []; if (!ids.includes(id)) ids.push(id); }
  return used;
}
