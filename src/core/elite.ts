import type { Enemy } from './model';
import { ENEMY_HEALTH } from './enemy-balance';

export const ELITE_KINDS = ['guard', 'chainhound', 'heartguard'] as const;

export const eliteDamage = (e: Pick<Enemy, 'elite'>, amount: number) => e.elite ? amount * 1.2 : amount;
export const eliteCooldown = (e: Pick<Enemy, 'elite'>, base: number) => e.elite ? Math.ceil(base * .9) : base;
export const eliteHealth = (kind: Enemy['kind']) => ENEMY_HEALTH[kind] * 1.8;
