import type { Point, RunState } from './model';
import { hasRelic } from './relics';
import { roomLayout, bodyObstacles } from './room-layout';
import { moveBody, distance } from './geometry';

export const CLAW = { distance: 40 } as const;
// Only a clipped dodge touching an actual wall face can consume this dodge's extension.
export function extendWallDodge(s: RunState, before: Point, dx: number, dy: number, input: Point): boolean {
  const p = s.player;
  if (!hasRelic(s, 'R27') || !p.dodgeRemaining || p.clawUsed) return false;
  const blockedX = Math.abs(dx) > .0001 && Math.abs(p.x - before.x) < Math.abs(dx) - .0001;
  const blockedY = Math.abs(dy) > .0001 && Math.abs(p.y - before.y) < Math.abs(dy) - .0001;
  const walls = roomLayout(s).walls, options: Point[] = [];
  for (const w of walls) {
    // moveBody sweeps X before Y. A later Y move can leave the contact face
    // in this same tick, so the X collision uses the pre-sweep Y coordinate.
    if (blockedX && Math.abs(input.y) > .0001 && before.y > w.y - 7 && before.y < w.y + w.h + 7
      && Math.abs(p.x - (dx > 0 ? w.x - 7 : w.x + w.w + 7)) < .001) options.push({ x: 0, y: Math.sign(input.y) * CLAW.distance });
    if (blockedY && Math.abs(input.x) > .0001 && p.x > w.x - 7 && p.x < w.x + w.w + 7
      && Math.abs(p.y - (dy > 0 ? w.y - 7 : w.y + w.h + 7)) < .001) options.push({ x: Math.sign(input.x) * CLAW.distance, y: 0 });
  }
  options.sort((a, b) => Math.abs(b.x ? input.x : input.y) - Math.abs(a.x ? input.x : input.y));
  for (const move of options) {
    const end = { x: p.x, y: p.y }; moveBody(end, move.x, move.y, 7, bodyObstacles(s));
    if (distance(end, p) > .0001) { p.x = end.x; p.y = end.y; p.clawUsed = true; return true; }
  }
  return false;
}
