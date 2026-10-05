import { unreflectableBullet, type Bullet, type RunState } from './model';
import { hasRelic } from './relics';
import { growthStats } from './growth';
import { playerDamage } from './player-effects';

export const DODGE_RECHARGE = 96;
export const maxDodgeCharges = (s: RunState) => hasRelic(s, 'R25') ? 2 : 1;
export const dodgeCharges = (s: RunState) => Math.min(maxDodgeCharges(s), s.player.dodgeCharges ?? (s.player.dodgeCooldown ? 0 : 1));

export function startDodgeRecharge(s: RunState) {
  s.player.dodgeCooldown = growthStats(s).dodgeRecharge - (s.player.dodgeCarry ?? 0);
  delete s.player.dodgeCarry;
}
export function syncDodgeCharges(s: RunState) {
  const p = s.player;
  p.dodgeCharges = dodgeCharges(s);
  if (p.dodgeCharges === maxDodgeCharges(s)) p.dodgeCooldown = 0;
  else if (p.dodgeCooldown === 0) startDodgeRecharge(s);
}
export function advanceDodgeRecharge(s: RunState) {
  syncDodgeCharges(s);
  const p = s.player;
  if (p.dodgeCooldown <= 0) return;
  const remaining = p.dodgeCooldown - 1;
  if (remaining > 1e-9) { p.dodgeCooldown = remaining; return; }
  p.dodgeCooldown = 0;
  // Carry sub-tick time across uses, including time spent fully charged.
  if (remaining < -1e-9) p.dodgeCarry = -remaining;
  p.dodgeCharges!++;
  if (p.dodgeCharges! < maxDodgeCharges(s)) startDodgeRecharge(s);
}
export function canParry(s: RunState) {
  const p = s.player, elapsed = 0.24 - p.dodgeRemaining;
  return hasRelic(s, 'R30') && p.dodgeRemaining > 0 && elapsed >= 0 && elapsed <= 0.1 + 1e-9 && !p.parryUsed;
}
export function parryProjectile(s: RunState, b: Bullet): boolean {
  if (b.owner !== 'enemy' || unreflectableBullet(b) || !canParry(s)) return false;
  const p = s.player;
  let dx = b.x - p.x, dy = b.y - p.y;
  if (Math.hypot(dx, dy) < 1e-9) { dx = -b.vx; dy = -b.vy; }
  const length = Math.hypot(dx, dy) * Math.hypot(p.dodgeX, p.dodgeY);
  if (!length || (dx * p.dodgeX + dy * p.dodgeY) / length < Math.SQRT1_2 - 1e-9) return false;
  p.parryUsed = true;
  delete b.source;
  b.owner = 'player'; b.kind = 'reflected'; b.damage = playerDamage(s, 15); b.vx = -b.vx; b.vy = -b.vy;
  if (b.heightVelocity !== undefined) b.heightVelocity *= -1;
  return true;
}
