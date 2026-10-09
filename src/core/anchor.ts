import { BOUNDS, type Point, type RunState } from './model';
import { hasRelic } from './relics';
import { groundObstacles as bodyObstacles } from './room-layout';
import { distance, visible, segmentBox } from './geometry';
import { spikeTraps, trapStage } from './traps';
import { BOMB } from './bombs';
import { teleportPlayer } from './teleport';
import { cue } from './combat';

export const ANCHOR = { cooldown: 600, radius: 7 } as const;
export function safeAnchorFloor(s: RunState, point: Point, dynamic = true): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= BOUNDS.x + ANCHOR.radius && point.x <= BOUNDS.x + BOUNDS.w - ANCHOR.radius
    && point.y >= BOUNDS.y + ANCHOR.radius && point.y <= BOUNDS.y + BOUNDS.h - ANCHOR.radius
    && visible(point, point, ANCHOR.radius - .001, bodyObstacles({ ...s, player: { ...s.player, height: 0 } }, dynamic));
}
export function anchorDestinationIssue(s: RunState, point: Point): string | null {
  if (!safeAnchorFloor(s, point)) return '닻 위치가 벽·가구·설치물에 막혀 있습니다.';
  if (spikeTraps(s).some((b, i) => trapStage(s, i) !== 'rest' && segmentBox(point.x, point.y, point.x, point.y, b, ANCHOR.radius) !== null)) return '닻 위치에 함정이 예고되거나 작동 중입니다.';
  if (s.enemies.some(e => e.hp > 0 && distance(e, point) < 17) || s.boss && s.boss.hp > 0 && distance(s.boss, point) < 27) return '닻 위치를 몬스터가 점유하고 있습니다.';
  const reserved = s.enemies.flatMap(e => [...(e.summonPoints ?? []), ...(e.blinkTarget ? [e.blinkTarget] : [])]);
  if (s.boss?.kind === 'chainpriest' && s.boss.mode === 'windup' && s.boss.pattern === 'ritual' && s.boss.reservedSummons) reserved.push(...s.boss.rocks);
  if (reserved.some(p => distance(p, point) < 17) || s.bombs?.some(b => distance(b, point) <= BOMB.radius + ANCHOR.radius)) return '닻 위치에 폭탄 또는 출현 예약이 있습니다.';
  return null;
}
export function anchorFailure(s: RunState): string | null {
  if (!hasRelic(s, 'R26') || !['combat', 'explore'].includes(s.phase)) return '지금은 닻을 사용할 수 없습니다.';
  if (s.player.auxCooldowns?.R26) return '유랑자의 닻이 아직 재사용 대기 중입니다.';
  const point = s.anchor ?? s.player;
  if (s.anchor && (s.anchor.room !== s.expedition?.room || s.anchor.region !== (s.expedition?.region ?? 1))) return '다른 방의 닻으로 돌아갈 수 없습니다.';
  if (!s.anchor && ((s.player.height ?? 0) > 0 || (s.player.jumpVelocity ?? 0) !== 0)) return '안전한 땅에 착지한 뒤 닻을 설치하세요.';
  return anchorDestinationIssue(s, point);
}
export function useAnchor(s: RunState): boolean {
  if (anchorFailure(s)) return false;
  const p = s.player;
  if (!s.anchor) { s.anchor = { id: s.nextId++, x: p.x, y: p.y, room: s.expedition!.room, region: s.expedition?.region ?? 1 }; return true; }
  teleportPlayer(s, s.anchor); (p.auxCooldowns ??= {}).R26 = ANCHOR.cooldown; delete s.anchor;
  cue(s, 'dodge', p.x, p.y); return true;
}
export function clearAnchor(s: RunState) { delete s.anchor; }
