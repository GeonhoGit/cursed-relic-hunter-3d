import type { Enemy, EnemyHit, Point, RunState } from './model';
import { ENEMY_ATTACK, ENEMY_BODY_RADIUS } from './enemy-balance';
import { distance, moveBody, segmentBox, visible } from './geometry';
import { bodyObstacles, roomLayout } from './room-layout';

const attack = ENEMY_ATTACK.chainhound;

export function cancelChainBite(e: Enemy) {
  e.mode = 'recover'; e.timer = attack.cooldownTicks;
}

export function advanceChainHound(s: RunState, e: Enemy): { move: boolean; hits: EnemyHit[] } {
  const hits: EnemyHit[] = [], idle = { move: false, hits };
  if (e.hp <= 0) return idle;
  const p = s.player, layout = roomLayout(s);
  if (e.mode === 'windup') {
    if (--e.timer <= 0) {
      const angle = Math.atan2(p.y - e.y, p.x - e.x) - e.angle;
      if (distance(e, p) <= attack.hitRange && Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= attack.halfAngle
        && (p.height ?? 0) <= attack.biteHeight && visible(e, p, 0, layout.walls)) {
        // Apply displacement only after the common damage/avoidance gate selects this hit.
        hits.push({ damage: attack.damage, cause: '사슬 사냥개의 당김과 물기', pull: { x: e.x, y: e.y } });
      }
      cancelChainBite(e);
    }
    return idle;
  }
  e.timer = Math.max(0, e.timer - 1);
  if (e.mode === 'recover') {
    if (e.timer >= attack.cooldownTicks - attack.recoveryTicks) return idle;
    if (e.timer === 0) e.mode = 'move';
  }
  if (e.timer === 0 && distance(e, p) <= attack.startRange && visible(e, p, 0, layout.walls)) {
    e.mode = 'windup'; e.timer = attack.windupTicks;
    e.targetX = p.x; e.targetY = p.y; e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    return idle;
  }
  return { move: true, hits };
}

export function applyChainPull(s: RunState, origin: Point) {
  const p = s.player, gap = distance(origin, p);
  if (!visible(origin, p, 0, roomLayout(s).walls)) return;
  const length = Math.min(attack.pullDistance, Math.max(0, gap - ENEMY_BODY_RADIUS - 7 - 1));
  if (length === 0) return;
  const dx = (origin.x - p.x) / gap * length, dy = (origin.y - p.y) / gap * length;
  const obstacles = bodyObstacles(s);
  let stop = 1;
  // Sweep the complete player body along the pull, including corners and furniture.
  for (const wall of obstacles) {
    const t = segmentBox(p.x, p.y, p.x + dx, p.y + dy, wall, 7);
    if (t !== null) stop = Math.min(stop, Math.max(0, t - .0001));
  }
  moveBody(p, dx * stop, dy * stop, 7, obstacles);
}
