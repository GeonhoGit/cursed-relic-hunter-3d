import { DT, type Player, type RunState } from './model';
import { hasRelic } from './relics';
import { cue, damageEnemy } from './combat';
import { distance, visible } from './geometry';
import { roomLayout } from './room-layout';
import { playerDamage } from './player-effects';

export const JUMP = { velocity: 160, bootsVelocity: 194, gravity: 480, maxHeight: 62.5,
  maxFallVelocity: Math.sqrt(2 * 480 * 62.5) + 480 * DT } as const;
export const STOMP = { radius: 37.5, damage: 12, cooldown: 180 } as const;
export function advanceJump(s: RunState, pressed = false): boolean {
  const p = s.player, before = p.height ?? 0;
  if (p.stompCooldown !== undefined) p.stompCooldown = Math.max(0, p.stompCooldown - 1);
  if (pressed && (before === 0 || (hasRelic(s, 'R44') && !p.airJumpUsed))) {
    if (before > 0) p.airJumpUsed = true;
    p.height = before; p.jumpVelocity = hasRelic(s, 'R45') ? JUMP.bootsVelocity : JUMP.velocity;
  }
  if (p.height === undefined) return false;
  p.jumpVelocity = (p.jumpVelocity ?? 0) - JUMP.gravity * DT;
  p.height = Math.max(0, p.height + p.jumpVelocity * DT);
  if (p.height > JUMP.maxHeight) { p.height = JUMP.maxHeight; p.jumpVelocity = 0; }
  if (p.height === 0) { p.jumpVelocity = 0; delete p.airJumpUsed; }
  return before > 0 && p.height === 0;
}
export function landingImpact(s: RunState) {
  if (!hasRelic(s, 'R46') || s.player.stompCooldown) return;
  const p = s.player; p.stompCooldown = STOMP.cooldown;
  cue(s, 'stomp', p.x, p.y, STOMP.radius);
  const walls = roomLayout(s).walls;
  for (const e of [...s.enemies, ...(s.boss ? [s.boss] : [])]) {
    if (distance(p, e) <= STOMP.radius && visible(p, e, 0, walls)) damageEnemy(s, e, playerDamage(s, STOMP.damage));
  }
  s.enemies = s.enemies.filter(e => e.hp > 0);
}
export function resetJump(p: Player) { delete p.height; delete p.jumpVelocity; delete p.airJumpUsed; }
