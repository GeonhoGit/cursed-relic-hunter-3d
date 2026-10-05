import { isBoss, type Boss, type Bullet, type Enemy, type RunState } from './model';
import { ENEMY_ATTACK } from './enemy-balance';
import { PRIEST } from './priest-boss';
import { hasRelic } from './relics';

export const SILENCE = { cooldown: 360, lock: 60 } as const;

export function silenceHit(s: RunState, e: Enemy | Boss, b: Bullet) {
  if (b.kind || !hasRelic(s, 'R11') || s.player.silenceCooldown || e.hp <= 0 || e.mode !== 'windup') return;
  if (isBoss(e)) {
    if (e.kind !== 'chainpriest' || e.pattern !== 'ritual') return;
    e.rocks = []; delete e.reservedSummons;
    e.timer = PRIEST.recovery;
  } else {
    if (e.kind !== 'sealcaster' && e.kind !== 'riftshaman') return;
    delete e.summonPoints;
    e.timer = ENEMY_ATTACK[e.kind].cooldownTicks;
  }
  e.mode = 'recover'; e.silenceTicks = SILENCE.lock;
  s.player.silenceCooldown = SILENCE.cooldown;
}

// The action lock runs alongside recovery, and shares the enemy's freeze gates.
export function advanceSilence(e: Enemy | Boss): boolean {
  if (!e.silenceTicks) return false;
  if (--e.silenceTicks <= 0) delete e.silenceTicks;
  e.timer = Math.max(0, e.timer - 1); return true;
}
