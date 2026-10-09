import { unreflectableBullet, type Bullet, type RunState } from './model';
import { distance } from './geometry';

export const TIME = { range: 160, duration: 90, cooldown: 1080, debt: 180 } as const;
export const stoppedEnemy = (s: RunState, id: number) => s.timeStop?.enemyIds.includes(id) ?? false;
export const stoppedBullet = (s: RunState, b: Bullet) => b.owner === 'enemy' && !unreflectableBullet(b) && (s.timeStop?.bulletIds.includes(b.id) ?? false);
export function startTimeStop(s: RunState) {
  s.timeStop = { x: s.player.x, y: s.player.y, ticks: TIME.duration,
    enemyIds: s.enemies.filter(e => e.hp > 0 && !e.charm && distance(e, s.player) <= TIME.range).map(e => e.id),
    bulletIds: s.bullets.filter(b => b.owner === 'enemy' && !unreflectableBullet(b) && distance(b, s.player) <= TIME.range).map(b => b.id) };
  s.player.timeCooldown = TIME.cooldown;
}
export function endTimeStop(s: RunState) {
  if (!s.timeStop) return;
  delete s.timeStop; s.timeDebt = TIME.debt;
}
export function finishTimeStopTick(s: RunState) {
  if (s.timeStop && --s.timeStop.ticks <= 0) endTimeStop(s);
}
export function advanceAuxiliaryRecharge(s: RunState) {
  if (s.timeDebt) { s.timeDebt--; return; }
  if (s.player.auxCooldown) s.player.auxCooldown--;
  if (s.player.timeCooldown) s.player.timeCooldown--;
  const timers = s.player.auxCooldowns;
  for (const id of ['R16', 'R17', 'R18', 'R26','R40','R42'] as const) if (timers?.[id] && --timers[id]! <= 0) delete timers[id];
  if (timers && !Object.keys(timers).length) delete s.player.auxCooldowns;
}
