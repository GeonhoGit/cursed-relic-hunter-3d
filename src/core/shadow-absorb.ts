import { AUXILIARY_IDS, isBossBullet, type AuxiliaryId, type Bullet, type Point, type RunState } from './model';
import { segmentCircle } from './geometry';
import { hasRelic } from './relics';

export const SHADOW = { quiet: 90, dodgeLock: 30 } as const;
export const ABSORB = { range: 40, duration: 90, cooldown: 840, cap: 5, reduction: 30 } as const;

// The simulation owns pause and phase gates; one call advances one simulation tick.
export function ageShadowAbsorb(s: RunState, quietTick = true) {
  const p = s.player;
  if (p.dodgeLock && --p.dodgeLock <= 0) delete p.dodgeLock;
  if (!hasRelic(s, 'R41')) { delete p.quietTicks; delete p.stealthed; }
  else if (quietTick) {
    p.quietTicks = Math.min(SHADOW.quiet, (p.quietTicks ?? 0) + 1);
    if (p.quietTicks >= SHADOW.quiet) p.stealthed = true;
  }
  if (!hasRelic(s, 'R42')) { clearAbsorption(s); delete s.absorbEnergy; }
  else if (s.absorption && --s.absorption.ticks <= 0) clearAbsorption(s);
}
export function breakStealth(s: RunState, attack = false) {
  if (attack && s.player.stealthed) s.player.dodgeLock = SHADOW.dodgeLock;
  delete s.player.stealthed;
  if (hasRelic(s, 'R41')) s.player.quietTicks = 0;
  else delete s.player.quietTicks;
}

export function absorptionFailure(s: RunState): string | null {
  if (!hasRelic(s, 'R42') || !['combat', 'explore'].includes(s.phase)) return '지금은 검은 태양을 사용할 수 없습니다.';
  if (!AUXILIARY_IDS.some(id => id !== 'R42' && hasRelic(s, id))) return '다른 보조 기술을 먼저 보유해야 합니다.';
  if(s.player.dodgeRemaining>0||s.recoveryCast)return '회피·회복품 사용이 끝난 뒤 흡수하세요.';
  if (s.timeDebt) return '정지된 모래시계의 충전 정지 중에는 흡수할 수 없습니다.';
  if (s.player.auxCooldowns?.R42) return '검은 태양이 아직 재사용 대기 중입니다.';
  if (s.absorption) return '이미 검은 태양으로 탄환을 흡수하고 있습니다.';
  return null;
}
export function startAbsorption(s: RunState): boolean {
  if (absorptionFailure(s)) return false;
  s.absorption = { ticks: ABSORB.duration, absorbed: 0 };
  (s.player.auxCooldowns ??= {}).R42 = ABSORB.cooldown;
  return true;
}
export function clearAbsorption(s: RunState) { delete s.absorption; }
// The caller limits the segment to earlier collisions and removes bullets on success.
export function absorbBullet(s: RunState, b: Bullet, from: Point = b, to: Point = b, playerPosition: Point = s.player): boolean {
  const channel = s.absorption;
  if (!channel || channel.ticks <= 0 || channel.absorbed >= ABSORB.cap || !hasRelic(s, 'R42')
    || b.owner !== 'enemy' || b.kind === 'ally' || isBossBullet(b)) return false;
  if (segmentCircle(from.x, from.y, to.x, to.y, playerPosition.x, playerPosition.y, ABSORB.range) === null) return false;
  s.absorbEnergy = Math.min(ABSORB.cap, (s.absorbEnergy ?? 0) + 1);
  if (++channel.absorbed >= ABSORB.cap) clearAbsorption(s);
  return true;
}
export function spendAbsorbEnergy(s: RunState, target: AuxiliaryId): boolean {
  if (!['explore', 'cleared'].includes(s.phase) || !hasRelic(s, 'R42') || s.timeDebt || (s.absorbEnergy ?? 0) <= 0
    || target === 'R42' || !AUXILIARY_IDS.includes(target) || !hasRelic(s, target)) return false;
  const p = s.player;
  const cooldown = (target === 'R13' ? p.auxCooldown : target === 'R43' ? p.timeCooldown : p.auxCooldowns?.[target]) ?? 0;
  if (cooldown <= 0) return false;
  const reduction = Math.min(ABSORB.reduction, cooldown), remaining = cooldown - reduction;
  if (target === 'R13') p.auxCooldown = remaining;
  else if (target === 'R43') p.timeCooldown = remaining;
  else if (remaining) p.auxCooldowns![target] = remaining;
  else {
    delete p.auxCooldowns![target];
    if (!Object.keys(p.auxCooldowns!).length) delete p.auxCooldowns;
  }
  s.absorbEnergy = (s.absorbEnergy ?? 0) - 1;
  const credits = p.cooldownCredits ??= {};
  credits[target] = (credits[target] ?? 0) + reduction;
  return true;
}
