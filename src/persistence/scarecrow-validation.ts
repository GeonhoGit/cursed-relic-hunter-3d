import { BOUNDS, type RunState } from '../core/model';
import { decoyBounds, SCARECROW } from '../core/scarecrow';
import { boxesOverlap, stoneWallBlocksExit } from '../core/masonry';
import { groundObstacles as bodyObstacles } from '../core/room-layout';
import { hasRelic } from '../core/relics';
import { spikeTraps } from '../core/traps';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown, min: number, max: number) => finite(v) && Number.isInteger(v) && v >= min && v <= max;
export function validScarecrow(s: RunState): boolean {
  const d = s.decoy, acquired = s.expedition?.acquired.includes('R18');
  if (s.boss?.decoyShockHit !== undefined && (!acquired || s.boss.kind !== 'relicheart' || s.boss.mode !== 'wave' || !integer(s.boss.decoyShockHit, 1, s.nextId - 1))) return false;
  if (d === undefined) return true;
  if (!d || d.kind !== 'decoy' || !hasRelic(s, 'R18') || !['combat', 'explore'].includes(s.phase)
    || !integer(d.id, 1, s.nextId - 1) || !integer(d.ticks, 1, SCARECROW.duration) || !finite(d.hp) || d.hp <= 0 || d.hp > SCARECROW.hp
    || !finite(d.x) || !finite(d.y) || (s.player.auxCooldowns?.R18 ?? 0)+(s.player.cooldownCredits?.R18 ?? 0) < d.ticks + SCARECROW.cooldown - SCARECROW.duration) return false;
  if ([s.bombs, s.orbitShots, s.thornTrails].some(v => v !== undefined && !Array.isArray(v))) return false;
  const box = decoyBounds(d), ids = [...s.enemies, ...s.bullets, ...s.cues, ...(s.bombs ?? []), ...(s.orbitShots ?? []), ...(s.thornTrails ?? []),
    ...(s.gravityWell ? [s.gravityWell] : []), ...(s.stoneWall ? [s.stoneWall] : []), ...(s.boss ? [s.boss] : [])];
  return box.x >= BOUNDS.x + 7 && box.y >= BOUNDS.y + 7 && box.x + box.w <= BOUNDS.x + BOUNDS.w - 7 && box.y + box.h <= BOUNDS.y + BOUNDS.h - 7
    && !ids.some(p => p?.id === d.id) && !stoneWallBlocksExit(s, box)
    && ![...bodyObstacles(s, false), ...(s.stoneWall ? [s.stoneWall] : []), ...spikeTraps(s)].some(b => boxesOverlap(box, b));
}
