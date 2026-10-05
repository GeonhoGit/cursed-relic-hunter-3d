import { DT, isBoss, type Boss, type Box, type Bullet, type Enemy, type RunState } from './model';
import { BODY_HEIGHT } from './fps-geometry';
import { visible } from './geometry';
import { hasRelic } from './relics';
import { heartProtected } from './heart-boss';

export const HOMING = { range: 150, turnPerSecond: Math.PI / 3 } as const;

export function guideProjectile(s: RunState, b: Bullet, walls: readonly Box[]) {
  if (!hasRelic(s, 'R05') || b.owner !== 'player' || b.kind === 'reflected' || b.phase === 'return') return;
  const vertical = b.height !== undefined;
  const speed = Math.hypot(b.vx, b.vy, vertical ? b.heightVelocity ?? 0 : 0);
  if (speed < 1e-9) return;
  let target: Enemy | Boss | undefined, nearest = Infinity;
  let dx = 0, dy = 0, dz = 0;
  for (const e of [...s.enemies, ...(s.boss ? [s.boss] : [])]) {
    if (e.hp <= 0 || b.hitIds?.includes(e.id) || b.originTargetId === e.id
      || isBoss(e) && (e.mode === 'transition' || heartProtected(e))) continue;
    const x = e.x - b.x, y = e.y - b.y, z = vertical ? BODY_HEIGHT[e.kind] / 2 - b.height! : 0;
    const distance = Math.hypot(x, y, z);
    if (distance < 1e-9 || distance > HOMING.range || !visible(b, e, 2, walls)) continue;
    if (distance < nearest || distance === nearest && e.id < target!.id) {
      target = e; nearest = distance; dx = x; dy = y; dz = z;
    }
  }
  if (!target) return;
  const ux = b.vx / speed, uy = b.vy / speed, uz = vertical ? (b.heightVelocity ?? 0) / speed : 0;
  const tx = dx / nearest, ty = dy / nearest, tz = dz / nearest;
  const dot = Math.max(-1, Math.min(1, ux * tx + uy * ty + uz * tz));
  const angle = Math.acos(dot);
  if (angle < 1e-9) return;
  let px = tx - dot * ux, py = ty - dot * uy, pz = tz - dot * uz;
  let length = Math.hypot(px, py, pz);
  if (length < 1e-9) {
    // Exactly opposite directions have no unique turn plane; choose a stable one.
    px = -uy; py = ux; pz = 0; length = Math.hypot(px, py);
    if (length < 1e-9) { px = 1; py = 0; length = 1; }
  }
  const turn = Math.min(angle, HOMING.turnPerSecond * DT), cos = Math.cos(turn), sin = Math.sin(turn);
  b.vx = speed * (ux * cos + px / length * sin);
  b.vy = speed * (uy * cos + py / length * sin);
  if (vertical) b.heightVelocity = speed * (uz * cos + pz / length * sin);
}
