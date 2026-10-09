import { describe, expect, it } from 'vitest';
import { createDungeonRun } from '../src/core/simulation';
import { beginGrowthRun, defaultProfile, emptyInvestment, earnedPoints, growthGoals, growthRelicUnlocks } from '../src/core/growth';
import { canAcquireRelic, grantRelic } from '../src/core/relic-acquisition';
import { prepareReward, rerollReward, chooseRelic } from '../src/core/expedition';
import { buyFromShop, purchaseIssue, refreshShop } from '../src/core/shop';
import { shopMarkup } from '../src/game/shop-ui';
import { RELIC_IDS, RELICS } from '../src/core/relics';
import { validRun } from '../src/persistence/save';
import 'fake-indexeddb/auto';
import { defaultSettings, SaveStore } from '../src/persistence/save';
import { recordGrowth } from '../src/core/growth';
import { equipAuxiliary, useAuxiliary } from '../src/core/auxiliary';
import { clearCombatEffects } from '../src/core/player-effects';
import { createBoss } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import { shopPrice } from '../src/core/shop';

function run(relic?: 'R33' | 'R34') {
  const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'utility-run', false, ['R33', 'R34'] as any);
  if (relic) {
    const r = s.expedition!.dungeon!.rooms[6]; r.visited = r.cleared = true;
    r.reward = { room: 6, candidates: [relic as any], choice: relic as any }; grantRelic(s, relic as any);
  }
  return s;
}
function chest(s: ReturnType<typeof run>, room = 7) {
  s.expedition!.room = room; const r = s.expedition!.dungeon!.rooms[room]; r.visited = r.cleared = true; s.phase = 'cleared'; prepareReward(s); return r.reward!;
}
function shop(s: ReturnType<typeof run>) {
  s.expedition!.room = 10; const r = s.expedition!.dungeon!.rooms[10]; r.visited = r.cleared = true; s.phase = 'explore'; s.gold = 100; refreshShop(s); return r.shop!;
}
describe('reward utility relics', () => {
  it('registers two real relics with the intended grades', () => {
    expect(RELIC_IDS).toHaveLength(57); expect((RELICS as any).R33.rarity).toBe('common'); expect((RELICS as any).R34.rarity).toBe('epic');
  });
  it('unlocks both next-departure relics and five points from three successful distinct uses only', () => {
    const p = defaultProfile(); p.relics = ['R13', 'R16', 'R17']; p.bossDefeated = true;
    expect(growthGoals(p).find(g => g.id === 'G08')?.count).toBe(0); const before = earnedPoints(p);
    p.auxiliaryUsed = ['R13', 'R16']; expect(growthRelicUnlocks(p)).not.toContain('R33');
    p.auxiliaryUsed.push('R17'); expect(earnedPoints(p)).toBe(before + 5); expect(growthRelicUnlocks(p)).toEqual(expect.arrayContaining(['R33', 'R34']));
    const old = createDungeonRun(42); beginGrowthRun(old, emptyInvestment(), 'old-utility'); expect(canAcquireRelic(old, 'R33' as any)).toBe(false); expect(canAcquireRelic(old, 'R34' as any)).toBe(false);
  });
  it('uses an identical rounded discount for displayed prices, availability and payment', () => {
    const s = run('R33'), offer = shop(s); s.player.hp = 80; s.gold = 16;
    expect(purchaseIssue(s, 2)).toBe(''); expect(shopMarkup(s)).toContain('작은 회복약 · 16 금화');
    expect(buyFromShop(s, 2, offer.revision)).toBe('bought'); expect(s.gold).toBe(0); expect(s.player.hp).toBe(95); expect(validRun(s)).toBe(true);
  });
  it('pays the original price to buy R33 itself, then discounts later items', () => {
    const s = run(), offer = shop(s); offer.slots[0].relic = 'R33' as any; if (offer.slots[1].relic === ('R33' as any)) offer.slots[1].relic = null;
    s.gold = 24; expect(buyFromShop(s, 0, offer.revision)).toBe('bought'); expect(s.gold).toBe(0);
    s.player.hp = 80; s.gold = 16; expect(purchaseIssue(s, 2)).toBe(''); expect(validRun(s)).toBe(true);
  });
  it('creates four fresh normal choices but grants only one relic', () => {
    const s = run('R34'), r = chest(s); expect(r.candidates).toHaveLength(4); expect(new Set(r.candidates).size).toBe(4);
    const n = s.expedition!.relics.length; expect(chooseRelic(s, r.candidates[3])).toBe(true); expect(s.expedition!.relics).toHaveLength(n + 1); expect(validRun(s)).toBe(true);
  });
  it('preserves existing three-slot offers even when R34 is acquired before refresh', () => {
    const s = run(), r = chest(s); expect(r.candidates).toHaveLength(3);
    const source = s.expedition!.dungeon!.rooms[6]; source.visited = source.cleared = true; source.reward = { room: 6, candidates: ['R34' as any], choice: 'R34' as any };
    grantRelic(s, 'R34' as any); expect(rerollReward(s)).toBe(true); expect(r.candidates).toHaveLength(3); expect(validRun(s)).toBe(true);
  });
  it('preserves four-slot refresh after relic loss but generates three slots for a new chest', () => {
    const s = run('R34'), r = chest(s); expect(r.candidates).toHaveLength(4);
    s.expedition!.relics = []; expect(rerollReward(s)).toBe(true); expect(r.candidates).toHaveLength(4); expect(validRun(s)).toBe(true);
    chooseRelic(s, 'skip'); const other = s.expedition!.dungeon!.rooms[6]; other.reward = null;
    s.expedition!.room = 6; s.phase = 'cleared'; prepareReward(s); expect(other.reward!.candidates).toHaveLength(3);
  });
  it('keeps altar and shop sizes fixed and refuses forged four-slot old saves', () => {
    const s = run('R34'); shop(s); expect(s.expedition!.dungeon!.rooms[10].shop!.slots).toHaveLength(4);
    s.expedition!.room = 9; const r = s.expedition!.dungeon!.rooms[9]; r.visited = r.cleared = true; s.phase = 'cleared'; prepareReward(s); expect(r.reward!.candidates).toEqual(['R38', 'R43']);
    const forged = run(); const reward = chest(forged); reward.candidates = ['R01', 'R02', 'R03', 'R04']; expect(validRun(forged)).toBe(false);
  });
  it('prices every gold stock kind with ceiling rounding and restores the base price on loss', () => {
    const s = run('R33'); expect(['relic', 'curse', 'heal'].map(kind => shopPrice(s, { kind } as any))).toEqual([20, 24, 16]);
    s.expedition!.relics = []; expect(['relic', 'curse', 'heal'].map(kind => shopPrice(s, { kind } as any))).toEqual([24, 30, 20]);
  });
  it('keeps four choices through actual region carry while a lost frame produces three new choices', () => {
    const s = run('R34'), r = chest(s); expect(r.candidates).toHaveLength(4); chooseRelic(s, 'skip');
    s.expedition!.relics = []; s.expedition!.room = 8; const boss = s.expedition!.dungeon!.rooms[8]; boss.visited = boss.cleared = true;
    s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared'; expect(enterNextRegion(s)).toBe(true);
    expect(s.expedition!.previousDungeon!.rooms[7].reward!.candidates).toHaveLength(4); expect(chest(s, 6).candidates).toHaveLength(3); expect(validRun(s)).toBe(true);
  });
  it('rejects a four-choice offer that attempts to authorize itself by granting R34', () => {
    const s = run(), r = chest(s); r.candidates = ['R34', 'R01', 'R02', 'R03']; expect(chooseRelic(s, 'R34')).toBe(true); expect(validRun(s)).toBe(false);
  });
  it('does not consume a refresh for a legacy zero-slot offer even with new eligible content', () => {
    const s = run(), r = chest(s); r.candidates = []; const before = structuredClone(s);
    expect(rerollReward(s)).toBe(false); expect(s).toEqual(before);
  });
  it('reaches G08 from actual successful bomb, wall and puppet casts rather than ownership', () => {
    const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'actual-g08', false, ['R16', 'R17']);
    const r = s.expedition!.dungeon!.rooms[6]; r.visited = r.cleared = true; r.reward = { room: 6, candidates: ['R13'], choice: 'R13' }; grantRelic(s, 'R13');
    s.player.x = 80; s.player.y = 183; expect(useAuxiliary(s, { x: 200, y: 183 })).toBe(true);
    const offer = shop(s); offer.slots[0].relic = 'R16'; offer.slots[1].relic = 'R17';
    expect(buyFromShop(s, 0, offer.revision)).toBe('bought'); expect(buyFromShop(s, 1, offer.revision)).toBe('bought');
    expect(equipAuxiliary(s, 'R16')).toBe(true); expect(useAuxiliary(s, { x: 80, y: 183 })).toBe(false); expect(useAuxiliary(s, { x: 160, y: 183 })).toBe(true);
    expect(equipAuxiliary(s, 'R17')).toBe(true); clearCombatEffects(s); delete s.bombs;
    s.expedition!.room = 1; s.expedition!.dungeon!.rooms[1].visited = true; s.expedition!.dungeon!.rooms[1].structure = 0; s.phase = 'combat';
    s.enemies = [{ id: s.nextId++, kind: 'rat', x: 200, y: 183, hp: 30, maxHp: 30, angle: 0, mode: 'move', timer: 0, targetX: 80, targetY: 183, flash: 0 }];
    expect(useAuxiliary(s, s.enemies[0])).toBe(true); expect(validRun(s)).toBe(true);
    const p = defaultProfile(); p.bossDefeated = true; const recorded = recordGrowth(p, s); expect(recorded.auxiliaryUsed).toEqual(['R13', 'R16', 'R17']);
    expect(growthGoals(recorded).find(g => g.id === 'G08')?.count).toBe(3); expect(earnedPoints(recorded)).toBe(10); expect(recordGrowth(recorded, s)).toEqual(recorded);
  });
  it('saves four choices and a discount against a profile backed by real past use records', async () => {
    const store = new SaveStore('utility-live'); await store.load();
    const prior = createDungeonRun(42); beginGrowthRun(prior, emptyInvestment(), 'g08-proof'); prior.expedition!.room = 8;
    const room = prior.expedition!.dungeon!.rooms[8]; room.visited = room.cleared = true; prior.boss = createBoss(prior); prior.boss.hp = 0; prior.phase = 'cleared';
    // Exercise successful casts in the profile's previous run, including the curse auxiliary.
    prior.phase = 'explore'; prior.expedition!.room = 0; grantRelic(prior, 'R13'); grantRelic(prior, 'R43');
    const a = prior.expedition!.dungeon!.rooms[6]; a.visited = a.cleared = true; a.reward = { room: 6, candidates: ['R13'], choice: 'R13' };
    const b = prior.expedition!.dungeon!.rooms[9]; b.visited = b.cleared = true; b.reward = { room: 9, candidates: ['R38', 'R43'], choice: 'R43' };
    prior.player.x = 80; prior.player.y = 183; useAuxiliary(prior, { x: 180, y: 183 }); equipAuxiliary(prior, 'R43'); useAuxiliary(prior, { x: 180, y: 183 });
    prior.phase = 'cleared'; prior.expedition!.room = 8; delete prior.bombs; delete prior.timeStop; await store.save(prior, defaultSettings());
    const wall = createDungeonRun(42); beginGrowthRun(wall, emptyInvestment(), 'wall-use-proof', false, ['R16']);
    wall.expedition!.room = 6; wall.phase = 'cleared'; const reward = wall.expedition!.dungeon!.rooms[6]; reward.visited = reward.cleared = true;
    reward.reward = { room: 6, candidates: ['R16'], choice: null }; expect(chooseRelic(wall, 'R16')).toBe(true);
    wall.player.x = 80; wall.player.y = 183; expect(useAuxiliary(wall, { x: 160, y: 183 })).toBe(true); await store.save(wall, defaultSettings());
    expect((await store.load())!.profile!.auxiliaryUsed).toEqual(['R13', 'R43', 'R16']);
    const s = run('R34'); const r = chest(s); rerollReward(s); await store.save(s, defaultSettings()); expect((await store.load())!.run).toEqual(s);
    const before = structuredClone(s); expect(rerollReward(s)).toBe(false); expect(s).toEqual(before); expect(r.candidates).toHaveLength(4);
  });
  it('makes both gated additions reachable in actual chest, refresh and shop pools', () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 500; i++) {
      const seed = Math.imul(i, 0x9e3779b9) >>> 0, s = createDungeonRun(seed); beginGrowthRun(s, emptyInvestment(), `utility-pool-${i}`, false, ['R33', 'R34']);
      const r = chest(s, 6); for (const id of ['R33', 'R34'] as const) if (r.candidates.includes(id)) seen.add(`chest-${id}`);
      rerollReward(s); for (const id of ['R33', 'R34'] as const) if (r.candidates.includes(id)) { seen.add(`refresh-${id}`); const copy = structuredClone(s); expect(chooseRelic(copy, id)).toBe(true); expect(validRun(copy)).toBe(true); }
      const trade = run(); trade.seed = seed; const offer = shop(trade);
      for (const id of ['R33', 'R34'] as const) { const slot = offer.slots.findIndex(v => v.relic === id); if (slot >= 0) { seen.add(`shop-${id}`); const copy = structuredClone(trade); expect(buyFromShop(copy, slot, offer.revision)).toBe('bought'); expect(validRun(copy)).toBe(true); } }
    }
    expect(seen.size).toBe(6);
  });
});
