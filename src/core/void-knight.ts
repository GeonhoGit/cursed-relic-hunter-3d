import { BOUNDS, type Enemy, type Point, type RunState } from './model';
import { ENEMY_ATTACK, ENEMY_BODY_RADIUS } from './enemy-balance';
import { BODY_HEIGHT } from './fps-geometry';
import { distance, visible } from './geometry';
import { roomLayout } from './room-layout';
import { spikeTraps } from './traps';

const attack = ENEMY_ATTACK.voidknight;

function safeLanding(s: RunState, e: Enemy, point: Point): boolean {
  const r = ENEMY_BODY_RADIUS, layout = roomLayout(s);
  return point.x >= BOUNDS.x + r && point.x <= BOUNDS.x + BOUNDS.w - r
    && point.y >= BOUNDS.y + r && point.y <= BOUNDS.y + BOUNDS.h - r
    && distance(point, s.player) > attack.minBlinkDistance
    && visible(point, point, r, layout.obstacles) && visible(point, point, r, spikeTraps(s))
    && visible(point, s.player, 0, layout.walls)
    && s.enemies.every(other => other.id === e.id || other.hp <= 0
      || (distance(point, other) >= 28 && (!other.blinkTarget || distance(point, other.blinkTarget) >= 28)));
}

function destination(s: RunState, e: Enemy): Point | undefined {
  const angle = s.player.aim + (e.id % 2 ? Math.PI / 2 : -Math.PI / 2);
  for (const radius of [84, 92]) for (let i = 0; i < 16; i++) {
    const a = angle + i * Math.PI / 8;
    const point = { x: s.player.x + Math.cos(a) * radius, y: s.player.y + Math.sin(a) * radius };
    if (distance(point, e) >= 48 && safeLanding(s, e, point)) return point;
  }
}

export function cancelVoidAttack(e: Enemy) {
  delete e.blinkTarget; e.mode = 'recover'; e.timer = attack.cooldownTicks;
}

export function advanceVoidKnight(s: RunState, e: Enemy): { move: boolean; hits: { damage: number; cause: string }[] } {
  const hits: { damage: number; cause: string }[] = [], idle = { move: false, hits };
  if (e.hp <= 0) return idle;
  const p = s.player, layout = roomLayout(s);
  if (e.mode === 'windup') {
    if (--e.timer > 0) return idle;
    if (e.blinkTarget) {
      // The reservation stays fixed; an obstructed landing spends the full cooldown.
      const point = e.blinkTarget;
      if (!safeLanding(s, e, point)) { cancelVoidAttack(e); return idle; }
      e.x = point.x; e.y = point.y; e.blinkTick = s.tick;
      delete e.blinkTarget; e.timer = attack.windupTicks;
      e.angle = Math.atan2(p.y - e.y, p.x - e.x);
      return idle;
    }
    if (distance(e, p) <= attack.hitRange && (p.height ?? 0) <= BODY_HEIGHT.voidknight && visible(e, p, 0, layout.walls))
      hits.push({ damage: attack.damage, cause: '공허 기사의 원형 베기' });
    cancelVoidAttack(e); return idle;
  }
  e.timer = Math.max(0, e.timer - 1);
  if (e.mode === 'recover') {
    if (e.timer >= attack.cooldownTicks - attack.recoveryTicks) return idle;
    if (e.timer === 0) e.mode = 'move';
  }
  if (e.timer === 0) {
    const near = distance(e, p);
    if (near <= attack.hitRange && visible(e, p, 0, layout.walls)) {
      e.mode = 'windup'; e.timer = attack.windupTicks;
      e.targetX = e.x; e.targetY = e.y; e.angle = Math.atan2(p.y - e.y, p.x - e.x);
      return idle;
    }
    const point = near <= attack.startRange ? destination(s, e) : undefined;
    if (point) {
      e.blinkTarget = point; e.targetX = point.x; e.targetY = point.y;
      e.mode = 'windup'; e.timer = attack.blinkTicks; return idle;
    }
  }
  return { move: true, hits };
}
