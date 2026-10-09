import { BOUNDS, type Box, type Point, type RunState } from './model';
import { hasRelic } from './relics';
import { adjacentRooms, currentRoom, DIRECTIONS } from './dungeon';
import { groundObstacles as bodyObstacles, roomLayout } from './room-layout';
import { distance, nextWaypoint, segmentBox, visible } from './geometry';
import { spikeTraps } from './traps';

export const MASONRY = { range: 80, width: 48, depth: 8, height: 60, hp: 40, duration: 240, cooldown: 600 } as const;
export const boxesOverlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export function stoneWallTarget(s: RunState, aim: Point): Box {
  const p = s.player, dx = aim.x - p.x, dy = aim.y - p.y, ratio = Math.min(1, MASONRY.range / (Math.hypot(dx, dy) || 1));
  const w = Math.abs(dx) >= Math.abs(dy) ? MASONRY.depth : MASONRY.width, h = w === MASONRY.depth ? MASONRY.width : MASONRY.depth;
  return { x: p.x + dx * ratio - w / 2, y: p.y + dy * ratio - h / 2, w, h };
}
export function stoneWallBlocksExit(s: RunState, wall: Box): boolean {
  return adjacentRooms(s).some(({ direction }) => {
    const d = DIRECTIONS[direction];
    return segmentBox(320 + d.x * BOUNDS.w / 2, 183 + d.y * BOUNDS.h / 2,
      320 + d.x * (BOUNDS.w / 2 - 48), 183 + d.y * (BOUNDS.h / 2 - 48), wall, 27) !== null;
  });
}
// Preserve every previously reachable required destination, rather than allowing a wall to seal a narrow corridor.
export function preservesStoneWallPaths(s: RunState, wall: Box): boolean {
  const obstacles = bodyObstacles(s, false);
  const doors = adjacentRooms(s).map(({ direction }) => {
    const d = DIRECTIONS[direction];
    return { x: 320 + d.x * (BOUNDS.w / 2 - 33), y: 183 + d.y * (BOUNDS.h / 2 - 33) };
  });
  const kind = currentRoom(s)?.kind;
  const destinations = [{ x: 320, y: 183, radius: 7 }, ...doors.map(p => ({ ...p, radius: 7 })),
    ...(['treasure', 'shop', 'altar'].includes(kind ?? '') ? [{ x: 320, y: 225, radius: 7 }] : []),
    ...s.enemies.filter(e => e.hp > 0).map(e => ({ ...e, radius: 10 })), ...(s.boss?.hp ? [{ ...s.boss, radius: 20 }] : [])];
  const reaches = (p: Point & { radius: number }, walls: Box[]) => distance(p, s.player) < .001
    || distance(nextWaypoint(s.player, p, p.radius, walls), s.player) > .001;
  return destinations.every(p => !reaches(p, obstacles) || reaches(p, [...obstacles, wall]));
}
export function stoneWallFailure(s: RunState, aim: Point): string | null {
  if (!hasRelic(s, 'R16') || !['combat', 'explore'].includes(s.phase)) return '지금은 돌벽을 설치할 수 없습니다.';
  if (s.player.auxCooldowns?.R16) return '석공의 손이 아직 재사용 대기 중입니다.';
  if (s.stoneWall) return '돌벽은 한 번에 하나만 세울 수 있습니다.';
  if (!Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return '설치할 위치를 조준하세요.';
  const wall = stoneWallTarget(s, aim), center = { x: wall.x + wall.w / 2, y: wall.y + wall.h / 2 };
  if (wall.x < BOUNDS.x + 7 || wall.y < BOUNDS.y + 7 || wall.x + wall.w > BOUNDS.x + BOUNDS.w - 7 || wall.y + wall.h > BOUNDS.y + BOUNDS.h - 7
    || bodyObstacles(s, false).some(b => boxesOverlap(wall, b)) || spikeTraps(s).some(b => boxesOverlap(wall, b))
    || !visible(s.player, center, 0, roomLayout(s, false).walls)) return '벽·가구·위험 지형에는 설치할 수 없습니다.';
  const reservations = [...s.enemies.flatMap(e => [...(e.summonPoints ?? []), ...(e.blinkTarget ? [e.blinkTarget] : [])]),
    ...(s.boss?.kind === 'chainpriest' && s.boss.hp > 0 && s.boss.pattern === 'ritual' && s.boss.mode === 'windup' && s.boss.reservedSummons
      ? s.boss.rocks : [])];
  if ([{ ...s.player, radius: 7 }, ...s.enemies.filter(e => e.hp > 0).map(e => ({ ...e, radius: 10 })),
    ...(s.decoy ? [{ ...s.decoy, radius: 7 }] : []),
    ...(s.boss?.hp ? [{ ...s.boss, radius: 20 }] : []), ...(s.bombs ?? []).map(b => ({ ...b, radius: 4 })),
    ...reservations.map(p => ({ ...p, radius: 10 }))]
    .some(p => segmentBox(p.x, p.y, p.x, p.y, wall, p.radius) !== null)) return '몸체·폭탄·출현 예정 위치에는 설치할 수 없습니다.';
  if (stoneWallBlocksExit(s, wall)) return '출구 앞에는 돌벽을 설치할 수 없습니다.';
  return preservesStoneWallPaths(s, wall) ? null : '필수 이동 통로를 막는 돌벽은 설치할 수 없습니다.';
}
export function placeStoneWall(s: RunState, aim: Point): boolean {
  if (stoneWallFailure(s, aim)) return false;
  s.stoneWall = { ...stoneWallTarget(s, aim), id: s.nextId++, hp: MASONRY.hp, ticks: MASONRY.duration };
  (s.player.auxCooldowns ??= {}).R16 = MASONRY.cooldown;
  return true;
}
export function ageStoneWall(s: RunState) {
  if (s.stoneWall && (!hasRelic(s, 'R16') || --s.stoneWall.ticks <= 0)) delete s.stoneWall;
}
export function damageStoneWall(s: RunState, damage: number) {
  if (!s.stoneWall) return;
  s.stoneWall.hp = Math.max(0, s.stoneWall.hp - damage);
  if (s.stoneWall.hp === 0) delete s.stoneWall;
}
export function blastStoneWall(s: RunState, origin: Point, radius: number, damage: number) {
  const wall = s.stoneWall;
  if (!wall) return;
  const point = { x: Math.max(wall.x, Math.min(wall.x + wall.w, origin.x)), y: Math.max(wall.y, Math.min(wall.y + wall.h, origin.y)) };
  if (distance(origin, point) <= radius && visible(origin, point, 0, roomLayout(s, false).walls)) damageStoneWall(s, damage);
}
export function strikeStoneWall(s: RunState, from: Point, to: Point, damage: number, radius = 0): boolean {
  if ('charm' in from && from.charm) return false;
  const wall = s.stoneWall;
  if (!wall) return false;
  const t = segmentBox(from.x, from.y, to.x, to.y, wall, radius);
  if (t === null) return false;
  const hit = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  if (!visible(from, hit, Math.max(0, radius - .001), roomLayout(s, false).walls)) return false;
  damageStoneWall(s, damage); return true;
}
export function strikeStoneWallArc(s: RunState, from: Point & { angle: number }, range: number, halfAngle: number, damage: number): boolean {
  const wall = s.stoneWall;
  if (!wall) return false;
  const closest = { x: Math.max(wall.x, Math.min(wall.x + wall.w, from.x)), y: Math.max(wall.y, Math.min(wall.y + wall.h, from.y)) };
  const diff = Math.atan2(closest.y - from.y, closest.x - from.x) - from.angle;
  return distance(from, closest) <= range && Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff))) <= halfAngle && strikeStoneWall(s, from, closest, damage);
}
