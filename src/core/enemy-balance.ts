// Durations are simulation ticks (60 Hz); ranges are center-to-center distances.
// Rendering shares the attack timing and reach with the simulation.
export const ENEMY_ATTACK = {
  readerstatue: { windupTicks: 72, cooldownTicks: 240, damage: 18, startRange: 420, range: 420, halfWidth: 6, beamHeight: 34, halfHeight: 2, effectTicks: 12 },
  chainhound: { windupTicks: 48, cooldownTicks: 180, recoveryTicks: 18, damage: 14, startRange: 80, hitRange: 84, halfAngle: 50 * Math.PI / 180, pullDistance: 30, biteHeight: 18, moveSpeed: 98 },
  sealcaster: { windupTicks: 60, cooldownTicks: 210, recoveryTicks: 18, damage: 16, radius: 54, startRange: 260, blastHeight: 16, slowTicks: 120 },
  voidknight: { blinkTicks: 60, windupTicks: 24, cooldownTicks: 240, recoveryTicks: 24, damage: 20, hitRange: 96, startRange: 300, minBlinkDistance: 72, moveSpeed: 78 },
  // Legacy bite timings remain for validating older saves; rats now only pursue.
  rat: { windupTicks: 24, cooldownTicks: 42, recoveryTicks: 12, damage: 8, startRange: 32, hitRange: 36 },
  archer: { windupTicks: 27, cooldownTicks: 66, recoveryTicks: 12, damage: 10, projectileSpeed: 210 },
  ashpriest: { windupTicks: 42, cooldownTicks: 144, recoveryTicks: 12, damage: 12, projectileSpeed: 175 },
  watcher: { windupTicks: 54, cooldownTicks: 180, recoveryTicks: 180, damage: 14, projectileSpeed: 135 },
  riftshaman: { windupTicks: 42, summonTicks: 72, cooldownTicks: 144, recoveryTicks: 18, damage: 10, projectileSpeed: 110 },
  heartguard: { windupTicks: 42, followupTicks: 30, comboPauseTicks: 18, cooldownTicks: 180, recoveryTicks: 36, damage: 16, startRange: 60, hitRange: 64, halfAngle: 65 * Math.PI / 180, moveSpeed: 84 },
  guard: { windupTicks: 48, cooldownTicks: 180, recoveryTicks: 60, damage: 14, startRange: 280, chargeSpeed: 300, chargeDistance: 300 },
  shield: { windupTicks: 42, cooldownTicks: 120, recoveryTicks: 24, damage: 12, startRange: 48, thrustLength: 48, thrustRadius: 7, halfAngle: 50 * Math.PI / 180, durability: 35 },
} as const;
export const ENEMY_HEALTH = { rat: 30, archer: 40, guard: 65, shield: 70, ashpriest: 65, watcher: 90, heartguard: 120, riftshaman: 80, voidknight: 140, sealcaster: 55, chainhound: 85, readerstatue: 100 } as const;
export const ENEMY_BODY_RADIUS = 10;
export const CONTACT_DAMAGE = { monster: 6, boss: 12 } as const;
export const ENCOUNTER_SIZE = { min: 5, max: 10 } as const;
export const ENEMY_NAMES = { rat: '돌쥐', archer: '금 간 궁수', guard: '돌진 파수꾼', shield: '방패 망령', ashpriest: '재의 사제', watcher: '궤도 감시자', heartguard: '심장 수호병', riftshaman: '균열 주술사', voidknight: '공허 기사', sealcaster: '봉인술사', chainhound: '사슬 사냥개', readerstatue: '독서 석상' } as const;
