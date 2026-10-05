import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawRelic, RELIC_RARITIES } from '../src/core/relic-rarity';
import { RELICS, RELIC_IDS, isCurse } from '../src/core/relics';
import { createDungeonRun } from '../src/core/simulation';
import { prepareReward, rerollReward, roomReward } from '../src/core/expedition';
import { refreshShop } from '../src/core/shop';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import * as rng from '../src/core/random';
import type { RelicId } from '../src/core/model';

afterEach(() => vi.restoreAllMocks());
const four: RelicId[] = ['R49', 'R13', 'R50', 'R25'];
describe('relic rarity and weighted offers', () => {
  it('assigns every relic a grade and makes the four base probabilities total 100%', () => {
    expect(Object.values(RELIC_RARITIES).reduce((n, grade) => n + grade.weight, 0)).toBe(100);
    for (const id of RELIC_IDS) expect(RELIC_RARITIES[RELICS[id].rarity]).toBeDefined();
    expect(RELICS.R49.rarity).toBe('common'); expect(RELICS.R50.rarity).toBe('epic');
    expect(RELICS.R51.rarity).toBe('common'); expect(RELICS.R25.rarity).toBe('legendary');
  });
  it.each([
    [0, 'R49'], [0.549999, 'R49'], [0.55, 'R13'], [0.849999, 'R13'],
    [0.85, 'R50'], [0.969999, 'R50'], [0.97, 'R25'], [0.999999, 'R25'],
  ] as const)('uses the exact grade boundary at random=%s', (value, expected) => {
    vi.spyOn(rng, 'random').mockReturnValue(value);
    expect(drawRelic({ rng: 42 }, four)).toBe(expected);
  });
  it('divides a grade probability equally across its remaining items', () => {
    const random = vi.spyOn(rng, 'random');
    const pool: RelicId[] = ['R49', 'R51', 'R13'];
    random.mockReturnValue(0); expect(drawRelic({ rng: 42 }, pool)).toBe('R49');
    random.mockReturnValue(0.33); expect(drawRelic({ rng: 42 }, pool)).toBe('R51');
    random.mockReturnValue(0.65); expect(drawRelic({ rng: 42 }, pool)).toBe('R13');
    expect(pool).toEqual(['R49', 'R51', 'R13']);
  });
  it('redistributes absent grades proportionally and needs no randomness for an empty pool', () => {
    const random = vi.spyOn(rng, 'random');
    random.mockReturnValue(0.90); expect(drawRelic({ rng: 42 }, ['R13', 'R25'])).toBe('R13');
    random.mockReturnValue(0.91); expect(drawRelic({ rng: 42 }, ['R13', 'R25'])).toBe('R25');
    random.mockReturnValue(0.999999); expect(drawRelic({ rng: 42 }, ['R25'])).toBe('R25');
    random.mockClear(); const state = { rng: 42 };
    expect(drawRelic(state, [])).toBeNull(); expect(state.rng).toBe(42); expect(random).not.toHaveBeenCalled();
  });
  it('measures grade probabilities rather than multiplying them by the number of relics in each grade', () => {
    const state = { rng: 0x12345678 }, pool = RELIC_IDS.filter(id => !isCurse(id));
    const counts = Object.fromEntries(pool.map(id => [id, 0])) as Record<RelicId, number>;
    const samples = 60000;
    for (let i = 0; i < samples; i++) counts[drawRelic(state, pool)!]++;
    for (const [rarity, grade] of Object.entries(RELIC_RARITIES)) {
      const ids = pool.filter(id => RELICS[id].rarity === rarity);
      const total = ids.reduce((n, id) => n + counts[id], 0);
      expect(Math.abs(total / samples - grade.weight / 100)).toBeLessThan(0.007);
      for (const id of ids) expect(Math.abs(counts[id] / samples - grade.weight / 100 / ids.length)).toBeLessThan(0.005);
    }
  });
  it('uses grade probabilities in real chest and shop generation', () => {
    const counts = { chest: { common: 0, rare: 0, epic: 0, legendary: 0 }, shop: { common: 0, rare: 0, epic: 0, legendary: 0 } };
    // Broader seed coverage avoids mistaking a small cohort's sampling noise for changed weights.
    const samples = 10000;
    for (let seed = 1; seed <= samples; seed++) {
      const s = createDungeonRun(Math.imul(seed, 0x9e3779b1) >>> 0); s.expedition!.room = 6; s.phase = 'cleared';
      const room = s.expedition!.dungeon!.rooms[6]; room.visited = room.cleared = true; prepareReward(s);
      counts.chest[RELICS[room.reward!.candidates[0]].rarity]++;
      s.expedition!.room = 10; s.phase = 'explore'; refreshShop(s);
      const stock = s.expedition!.dungeon!.rooms[10].shop!;
      counts.shop[RELICS[stock.slots[0].relic!].rarity]++;
      expect(stock.slots[2].kind).toBe('heal'); expect(stock.slots[3].relic).toBe('R43');
    }
    for (const group of Object.values(counts)) for (const [rarity, grade] of Object.entries(RELIC_RARITIES))
      expect(Math.abs(group[rarity as keyof typeof group] / samples - grade.weight / 100), JSON.stringify(counts)).toBeLessThan(0.025);
  });
  it('preserves the grade proportions across the complete expanded pool with evenly spaced random samples', () => {
    const pool = RELIC_IDS.filter(id => !isCurse(id)), samples = 10000;
    const counts = { common: 0, rare: 0, epic: 0, legendary: 0 }; let sample = 0;
    vi.spyOn(rng, 'random').mockImplementation(() => (sample++ + 0.5) / samples);
    for (let i = 0; i < samples; i++) counts[RELICS[drawRelic({ rng: 42 }, pool)!].rarity]++;
    for (const [rarity, grade] of Object.entries(RELIC_RARITIES))
      expect(Math.abs(counts[rarity as keyof typeof counts] / samples - grade.weight / 100)).toBeLessThan(0.001);
  });
  it('preserves stored offers, deterministic future rerolls and fixed altar choices without adding save fields', async () => {
    const s = createDungeonRun(42); s.expedition!.room = 6; s.phase = 'cleared';
    const room = s.expedition!.dungeon!.rooms[6]; room.visited = room.cleared = true;
    // A selection produced before rarity was added remains unchanged on load.
    room.reward = { room: 6, candidates: ['R49', 'R50', 'R25'], choice: null };
    const store = new SaveStore('relic-rarity-save'); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!; expect(restored).toEqual(s);
    expect(rerollReward(s)).toBe(true); expect(rerollReward(restored)).toBe(true); expect(restored).toEqual(s);
    const candidates = roomReward(s)!.candidates;
    expect(new Set(candidates).size).toBe(candidates.length); expect(candidates.every(id => !['R49', 'R50', 'R25'].includes(id))).toBe(true);
    expect(candidates).not.toContain('R11'); expect(candidates).not.toContain('R12'); expect(validRun(s)).toBe(true);
    s.expedition!.room = 9; const altar = s.expedition!.dungeon!.rooms[9]; altar.visited = altar.cleared = true;
    const before = s.rng; prepareReward(s);
    expect(roomReward(s)!.candidates).toEqual(['R38', 'R43']); expect(s.rng).toBe(before);
  });
});
