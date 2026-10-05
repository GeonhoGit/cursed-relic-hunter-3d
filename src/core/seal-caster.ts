import type { Enemy, RunState } from './model';
import { ENEMY_ATTACK } from './enemy-balance';
import { distance, visible } from './geometry';
import { roomLayout } from './room-layout';

export function cancelSealBlast(e: Enemy) {
  e.mode = 'recover'; e.timer = ENEMY_ATTACK.sealcaster.cooldownTicks;
}

export function advanceSealCaster(s: RunState, e: Enemy): { move: boolean; hits: { damage: number; cause: string; slow?: true }[] } {
  const attack = ENEMY_ATTACK.sealcaster, p = s.player, layout = roomLayout(s);
  const hits: { damage: number; cause: string; slow?: true }[] = [], idle = { move: false, hits };
  if (e.hp <= 0) return idle;
  if (e.mode === 'windup') {
    if (--e.timer <= 0) {
      const point = { x: e.targetX, y: e.targetY };
      s.cues.push({ id: s.nextId++, kind: 'blast', ...point, tick: s.tick, amount: attack.radius });
      if (distance(point, p) <= attack.radius && (p.height ?? 0) <= attack.blastHeight && visible(point, p, 0, layout.walls))
        hits.push({ damage: attack.damage, cause: '봉인술사의 봉인 폭발', slow: true });
      cancelSealBlast(e);
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
