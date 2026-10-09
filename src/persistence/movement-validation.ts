import type { RunState } from '../core/model';
import { safeAnchorFloor } from '../core/anchor';
import { hasRelic } from '../core/relics';

const integer = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
export function validMovementRelics(s: RunState): boolean {
  const p = s.player, acquired = s.expedition?.acquired ?? [], a = s.anchor;
  if (p.teleportTick !== undefined && (!acquired.includes('R26') && !acquired.includes('R24') && (s.expedition?.dungeon?.layoutVersion ?? 0)<2 || !integer(p.teleportTick, 0, s.tick))) return false;
  if (p.clawUsed !== undefined && (p.clawUsed !== true || !acquired.includes('R27') || !(p.dodgeRemaining > 0 && p.dodgeRemaining <= .24))) return false;
  if (a === undefined) return true;
  if (!a || !hasRelic(s, 'R26') || !['combat', 'explore', 'cleared'].includes(s.phase) || p.hp <= 0 || p.auxCooldowns?.R26
    || !integer(a.id, 1, s.nextId - 1) || a.room !== s.expedition?.room || a.region !== (s.expedition?.region ?? 1) || !safeAnchorFloor(s, a, false)) return false;
  const ids = [...s.enemies, ...s.bullets, ...s.cues, ...(s.bombs ?? []), ...(s.orbitShots ?? []), ...(s.thornTrails ?? []),
    ...(s.gravityWell ? [s.gravityWell] : []), ...(s.stoneWall ? [s.stoneWall] : []), ...(s.decoy ? [s.decoy] : []), ...(s.boss ? [s.boss] : [])];
  return !ids.some(q => q?.id === a.id);
}
