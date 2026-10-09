import { BOUNDS, type RunState } from '../core/model';
import { boxesOverlap, MASONRY, stoneWallBlocksExit } from '../core/masonry';
import { groundObstacles as bodyObstacles } from '../core/room-layout';
import { hasRelic } from '../core/relics';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown, min: number, max: number) => finite(v) && Number.isInteger(v) && v >= min && v <= max;
export function validMasonry(s: RunState): boolean {
  if ([s.bombs, s.orbitShots, s.thornTrails].some(v => v !== undefined && !Array.isArray(v))) return false;
  const timers = s.player.auxCooldowns;
  const wall = s.stoneWall;
  if (wall === undefined) return true;
  if (!wall || !hasRelic(s, 'R16') || !['combat', 'explore'].includes(s.phase)
    || !integer(wall.id, 1, s.nextId - 1) || !integer(wall.ticks, 1, MASONRY.duration)
    || !finite(wall.hp) || wall.hp <= 0 || wall.hp > MASONRY.hp || !finite(wall.x) || !finite(wall.y)
    || !((wall.w === MASONRY.width && wall.h === MASONRY.depth) || (wall.w === MASONRY.depth && wall.h === MASONRY.width))
    || (timers?.R16 ?? 0)+(s.player.cooldownCredits?.R16 ?? 0) < wall.ticks + MASONRY.cooldown - MASONRY.duration || wall.x < BOUNDS.x + 7 || wall.y < BOUNDS.y + 7
    || wall.x + wall.w > BOUNDS.x + BOUNDS.w - 7 || wall.y + wall.h > BOUNDS.y + BOUNDS.h - 7) return false;
  const ids = [...s.enemies, ...s.bullets, ...s.cues, ...(s.bombs ?? []), ...(s.orbitShots ?? []), ...(s.thornTrails ?? []),
    ...(s.gravityWell ? [s.gravityWell] : []), ...(s.boss ? [s.boss] : [])];
  return !ids.some(e => e?.id === wall.id) && !stoneWallBlocksExit(s, wall) && !bodyObstacles(s, false).some(b => boxesOverlap(wall, b));
}
