import type { Point, RunState } from './model';
import { resetJump } from './jump';

// Position changes share one boundary so a teleport cannot extend a dodge or a thorn path.
export function teleportPlayer(s: RunState, point: Point) {
  const p = s.player; p.x = point.x; p.y = point.y; resetJump(p);
  p.dodgeRemaining = 0; delete p.clawUsed; delete p.thornTrailId; p.teleportTick = s.tick;
}
