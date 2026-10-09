import type { Point, RunState } from '../core/model';
export interface Pose extends Point { height: number; angle: number }
export interface MotionFrame { key: string; tick: number; player: Pose; enemies: Map<number, Pose>; bullets: Map<number, Pose> }
export function captureMotion(s: RunState): MotionFrame {
  return { key: `${s.seed}:${s.growth?.id}:${s.expedition?.region}:${s.expedition?.room}`, tick: s.tick,
    player: { x: s.player.x, y: s.player.y, height: s.player.height ?? 0, angle: s.player.aim },
    enemies: new Map([...s.enemies, ...(s.boss ? [s.boss] : [])].map(e => [e.id, { x: e.x, y: e.y, height: 0, angle: e.angle }])),
    bullets: new Map(s.bullets.map(b => [b.id, { x: b.x, y: b.y, height: b.height ?? 34, angle: 0 }])) };
}
export function interpolateMotion(s: RunState, previous: MotionFrame | null, alpha: number): MotionFrame {
  const current = captureMotion(s);
  if (!previous || previous.key !== current.key || previous.tick + 1 !== s.tick) return current;
  const t = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
  const blend = (now: Pose, before?: Pose): Pose => {
    // Blinks and other teleports must appear at their destination, never through a wall.
    if (!before || Math.hypot(now.x - before.x, now.y - before.y) > 48) return now;
    const angle = Math.atan2(Math.sin(now.angle - before.angle), Math.cos(now.angle - before.angle));
    return { x: before.x + (now.x - before.x) * t, y: before.y + (now.y - before.y) * t,
      height: before.height + (now.height - before.height) * t, angle: before.angle + angle * t };
  };
  current.player = s.player.teleportTick === s.tick ? current.player : blend(current.player, previous.player);
  for (const [id, pose] of current.enemies) current.enemies.set(id, blend(pose, previous.enemies.get(id)));
  for (const [id, pose] of current.bullets) current.bullets.set(id, blend(pose, previous.bullets.get(id)));
  return current;
}
