import { BOUNDS, type Decoy, type Point, type RunState } from './model';
import { hasRelic } from './relics';
import { groundObstacles as bodyObstacles, roomLayout } from './room-layout';
import { distance, visible } from './geometry';
import { boxesOverlap, stoneWallBlocksExit } from './masonry';
import { spikeTraps } from './traps';

export const SCARECROW = { range: 100, hp: 30, duration: 300, cooldown: 720, radius: 7, height: 44 } as const;
export const decoyBounds = (p: Point) => ({ x: p.x - SCARECROW.radius, y: p.y - SCARECROW.radius, w: SCARECROW.radius * 2, h: SCARECROW.radius * 2 });
export function scarecrowTarget(s: RunState, aim: Point): Point {
  const dx = aim.x - s.player.x, dy = aim.y - s.player.y, ratio = Math.min(1, SCARECROW.range / (Math.hypot(dx, dy) || 1));
  return { x: s.player.x + dx * ratio, y: s.player.y + dy * ratio };
}
export function scarecrowFailure(s: RunState, aim: Point): string | null {
  if (!hasRelic(s, 'R18') || !['combat', 'explore'].includes(s.phase)) return '지금은 허수아비를 설치할 수 없습니다.';
  if (s.player.auxCooldowns?.R18) return '허수아비 인형이 아직 재사용 대기 중입니다.';
  if (s.decoy) return '허수아비는 한 번에 하나만 설치할 수 있습니다.';
  if (!Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return '안전한 지상 위치를 조준하세요.';
  const point = scarecrowTarget(s, aim), box = decoyBounds(point);
  if (box.x < BOUNDS.x + 7 || box.y < BOUNDS.y + 7 || box.x + box.w > BOUNDS.x + BOUNDS.w - 7 || box.y + box.h > BOUNDS.y + BOUNDS.h - 7
    || bodyObstacles(s).some(b => boxesOverlap(box, b)) || spikeTraps(s).some(b => boxesOverlap(box, b))
    || !visible(s.player, point, SCARECROW.radius, roomLayout(s).walls)) return '벽·가구·위험 지형에는 설치할 수 없습니다.';
  const reserved = [...s.enemies.flatMap(e => [...(e.summonPoints ?? []), ...(e.blinkTarget ? [e.blinkTarget] : [])]),
    ...(s.boss?.kind === 'chainpriest' && s.boss.mode === 'windup' && s.boss.pattern === 'ritual' && s.boss.reservedSummons ? s.boss.rocks : [])];
  if ([{ ...s.player, radius: 7 }, ...s.enemies.filter(e => e.hp > 0).map(e => ({ ...e, radius: 10 })),
    ...(s.boss?.hp ? [{ ...s.boss, radius: 20 }] : []), ...(s.bombs ?? []).map(b => ({ ...b, radius: 4 })), ...reserved.map(p => ({ ...p, radius: 10 }))]
    .some(p => distance(point, p) < SCARECROW.radius + p.radius)) return '몸체·폭탄·출현 예정 위치에는 설치할 수 없습니다.';
  return stoneWallBlocksExit(s, box) ? '출구 앞에는 허수아비를 설치할 수 없습니다.' : null;
}
export function placeScarecrow(s: RunState, aim: Point): boolean {
  if (scarecrowFailure(s, aim)) return false;
  s.decoy = { kind: 'decoy', id: s.nextId++, ...scarecrowTarget(s, aim), hp: SCARECROW.hp, ticks: SCARECROW.duration };
  (s.player.auxCooldowns ??= {}).R18 = SCARECROW.cooldown; return true;
}
export function clearScarecrow(s: RunState) { delete s.decoy; if (s.boss) delete s.boss.decoyShockHit; }
export function ageScarecrow(s: RunState) {
  if (s.decoy && (!hasRelic(s, 'R18') || --s.decoy.ticks <= 0)) clearScarecrow(s);
}
export function damageScarecrow(s: RunState, target: Decoy, damage: number) {
  target.hp = Math.max(0, target.hp - damage);
  if (!target.hp) clearScarecrow(s);
}
