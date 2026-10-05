import { isBoss, type Boss, type Bullet, type Enemy, type RunState } from './model';
import { GATEKEEPER } from './boss';
import { hasRelic } from './relics';

export const LENS = { duration: 120, cooldown: 300 } as const;

// Called only after a real frontal block, before its durability or body damage.
export function releaseShield(s: RunState, e: Enemy | Boss, b: Bullet): boolean {
  if (b.kind || !hasRelic(s, 'R12') || e.lensCooldown || e.hp <= 0) return false;
  if (isBoss(e)) {
    if (e.kind !== 'gatekeeper' || e.mode !== 'shield') return false;
    e.mode = 'recover'; e.timer = GATEKEEPER.recovery;
  } else {
    if (e.kind !== 'shield') return false;
    e.shieldDisabledTicks = LENS.duration;
  }
  e.lensCooldown = LENS.cooldown; return true;
}

export function ageLens(e: Enemy | Boss) {
  if (e.lensCooldown && --e.lensCooldown <= 0) delete e.lensCooldown;
  if (!isBoss(e) && e.shieldDisabledTicks && --e.shieldDisabledTicks <= 0) delete e.shieldDisabledTicks;
}
export function clearLens(e: Enemy | Boss) {
  delete e.lensCooldown;
  if (!isBoss(e)) delete e.shieldDisabledTicks;
}
