import type { Enemy, EncounterSpec,EncounterPlan } from './model';
import { ELITE_KINDS } from './elite';
import { random } from './random';

export function buildEncounter(seed: number, region: 1 | 2 | 3, roomId: number, baseRoster: Enemy['kind'][], eliteRoom = false,eliteBalance:1|2=1):EncounterPlan {
  const state = { rng: (Math.imul((seed >>> 0) ^ Math.imul(roomId + 1, 0x9e3779b9) ^ Math.imul(region, 0x85ebca6b), 0x27d4eb2d) >>> 0) || 1 };
  const integer = (min: number, max: number) => min + Math.floor(random(state) * (max - min + 1));
  const pool: Enemy['kind'][] = baseRoster.length ? [...baseRoster] : ['rat', 'archer'];
  const pick = (): EncounterSpec => ({ kind: pool[integer(0, pool.length - 1)] });
  if (eliteRoom) {
    const minimum=eliteBalance===2?(region===3?4:3):2;
    const support = () => Array.from({ length: integer(minimum,minimum+1) }, pick);
    return { ...(eliteBalance===2?{balanceVersion:2 as const}:{}),waves: [support(), [{ kind: ELITE_KINDS[region - 1], elite: true }, ...support()]] };
  }
  const min = region === 3 ? 8 : region === 2 ? 7 : 5, max = region === 3 ? 12 : 10;
  const total = Math.max(pool.length, integer(min, max));
  const count = region === 1 ? total > 8 ? 2 : integer(1, 2) : region === 2 ? 2 : integer(2, 3);
  const roster: EncounterSpec[] = pool.map(kind => ({ kind }));
  while (roster.length < total) roster.push(pick());
  const waves: EncounterSpec[][] = [], size = Math.floor(total / count), remainder = total % count;
  let offset = 0;
  for (let wave = 0; wave < count; wave++) {
    const length = size + (wave < remainder ? 1 : 0);
    waves.push(roster.slice(offset, offset + length)); offset += length;
  }
  return { waves };
}
