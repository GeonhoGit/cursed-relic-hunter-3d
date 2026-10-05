import { type Point, type RunState } from './model';
import { roomLayout } from './room-layout';
import { distance, segmentBox, visible } from './geometry';
import { cue, damageEnemy } from './combat';
import { hasRelic } from './relics';
import { playerDamage } from './player-effects';

export const BOMB = { range: 120, radius: 52, damage: 45, fuse: 60, cooldown: 480 } as const;
export function bombTarget(s: RunState, aim: Point): Point {
  const p = s.player, ratio = Math.min(1, BOMB.range / (distance(p, aim) || 1));
  const end = { x: p.x + (aim.x - p.x) * ratio, y: p.y + (aim.y - p.y) * ratio };
  let stop = 1;
  for (const wall of roomLayout(s).walls) {
    const t = segmentBox(p.x, p.y, end.x, end.y, wall, 4);
    if (t !== null) stop = Math.min(stop, Math.max(0, t - 0.0001));
  }
  return { x: p.x + (end.x - p.x) * stop, y: p.y + (end.y - p.y) * stop };
}
export function placeBomb(s: RunState, aim: Point) {
  if (!hasRelic(s, 'R13') || s.player.auxCooldown || s.bombs?.length) return;
  s.bombs = [{ id: s.nextId++, ...bombTarget(s, aim), ticks: BOMB.fuse,
    ...(s.player.weakTicks ? { damage: playerDamage(s, BOMB.damage) } : {}) }];
  s.player.auxCooldown = BOMB.cooldown;
}
export function advanceBombs(s: RunState) {
  if (!s.bombs?.length) return;
  if (!hasRelic(s, 'R13')) { s.bombs = []; return; }
  const remaining = [];
  for (const bomb of s.bombs) {
    if (--bomb.ticks > 0) { remaining.push(bomb); continue; }
    cue(s, 'blast', bomb.x, bomb.y, BOMB.radius);
    for (const e of [...s.enemies, ...(s.boss ? [s.boss] : [])]) {
      if (distance(bomb, e) <= BOMB.radius && visible(bomb, e, 0, roomLayout(s).walls)) damageEnemy(s, e, bomb.damage ?? BOMB.damage);
    }
  }
  s.bombs = remaining;
  s.enemies = s.enemies.filter(e => e.hp > 0);
}
