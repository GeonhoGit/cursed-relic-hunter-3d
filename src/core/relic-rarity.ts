import type { RelicId, RelicRarity } from './model';
import { RELICS } from './relics';
import { random } from './random';

export const RELIC_RARITIES = {
  common: { name: '일반', weight: 55 },
  rare: { name: '희귀', weight: 30 },
  epic: { name: '영웅', weight: 12 },
  legendary: { name: '전설', weight: 3 },
} as const satisfies Record<RelicRarity, { name: string; weight: number }>;

export function drawRelic(state: { rng: number }, pool: readonly RelicId[]): RelicId | null {
  if (!pool.length) return null;
  const counts: Record<RelicRarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const id of pool) counts[RELICS[id].rarity]++;
  const total = (Object.keys(counts) as RelicRarity[])
    .reduce((sum, rarity) => sum + (counts[rarity] ? RELIC_RARITIES[rarity].weight : 0), 0);
  let roll = random(state) * total;
  // Give each available grade its full weight, divided equally among its items.
  for (const id of pool) {
    const rarity = RELICS[id].rarity;
    roll -= RELIC_RARITIES[rarity].weight / counts[rarity];
    if (roll < 0) return id;
  }
  return pool[pool.length - 1]; // Floating-point remainder at the upper boundary.
}
