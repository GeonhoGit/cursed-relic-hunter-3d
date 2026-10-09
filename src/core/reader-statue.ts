import type { Enemy, EnemyHit, Point, RunState } from './model';
import { ENEMY_ATTACK } from './enemy-balance';
import { PLAYER_BODY_HEIGHT } from './fps-geometry';
import { distance, segmentBox, visible } from './geometry';
import { roomLayout } from './room-layout';
import { strikeStoneWall } from './masonry';

const attack = ENEMY_ATTACK.readerstatue;

export function statueLaserEnd(s: RunState, e: Enemy): Point {
  const end = { x: e.x + Math.cos(e.angle) * attack.range, y: e.y + Math.sin(e.angle) * attack.range };
  let stop = 1;
  for (const wall of roomLayout(s).walls) {
    const t = segmentBox(e.x, e.y, end.x, end.y, wall);
    if (t !== null) stop = Math.min(stop, t);
  }
  return { x: e.x + (end.x - e.x) * stop, y: e.y + (end.y - e.y) * stop };
}

function laserHits(s: RunState, e: Enemy, before: Point, height: number) {
  const p = s.player, end = statueLaserEnd(s, e), c = Math.cos(e.angle), sn = Math.sin(e.angle);
  const local = (point: Point) => ({ x: (point.x - e.x) * c + (point.y - e.y) * sn, y: -(point.x - e.x) * sn + (point.y - e.y) * c });
  const a = local(before), b = local(p), box = { x: 0, y: -attack.halfWidth, w: distance(e, end), h: attack.halfWidth * 2 };
  const enter = segmentBox(a.x, a.y, b.x, b.y, box, 7);
  if (enter === null) return false;
  let start = enter, finish = 1 - segmentBox(b.x, b.y, a.x, a.y, box, 7)!;
  const dh = (p.height ?? 0) - height;
  const lo = attack.beamHeight - attack.halfHeight - PLAYER_BODY_HEIGHT, hi = attack.beamHeight + attack.halfHeight;
  if (Math.abs(dh) < 1e-9) { if (height < lo || height > hi) return false; }
  else {
    const t1 = (lo - height) / dh, t2 = (hi - height) / dh;
    start = Math.max(start, Math.min(t1, t2)); finish = Math.min(finish, Math.max(t1, t2));
  }
  return start <= finish && visible(e, { x: before.x + (p.x - before.x) * start, y: before.y + (p.y - before.y) * start }, 0, roomLayout(s).walls);
}

export function cancelStatueLaser(e: Enemy) {
  delete e.laserTicks; e.mode = 'recover'; e.timer = attack.cooldownTicks;
}

export function advanceReaderStatue(s: RunState, e: Enemy, before: Point, height: number): { move: boolean; hits: EnemyHit[] } {
  const hits: EnemyHit[] = [], idle = { move: false, hits };
  if (e.hp <= 0) return idle;
  if (e.laserTicks && --e.laserTicks <= 0) delete e.laserTicks;
  if (e.mode === 'windup') {
    if (--e.timer <= 0) {
      if (laserHits(s, e, before, height)) hits.push({ damage: attack.damage, cause: '독서 석상의 레이저' });
      strikeStoneWall(s, e, { x: e.x + Math.cos(e.angle) * attack.range, y: e.y + Math.sin(e.angle) * attack.range }, attack.damage);
      cancelStatueLaser(e); e.laserTicks = attack.effectTicks;
    }
    return idle;
  }
  e.timer = Math.max(0, e.timer - 1);
  if (e.timer === 0) {
    e.mode = 'move';
    if (distance(e, s.player) <= attack.startRange && visible(e, s.player, 0, roomLayout(s).walls)) {
      e.mode = 'windup'; e.timer = attack.windupTicks;
      e.targetX = s.player.x; e.targetY = s.player.y; e.angle = Math.atan2(s.player.y - e.y, s.player.x - e.x);
    }
  }
  return idle;
}
