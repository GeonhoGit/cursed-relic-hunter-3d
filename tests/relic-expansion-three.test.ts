import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDungeonRun, createRun } from '../src/core/simulation';
import { adjacentRooms, currentRoom, knownRooms } from '../src/core/dungeon';
import { dungeonMapMarkup } from '../src/game/dungeon-view';
import { canAcquireRelic, grantRelic } from '../src/core/relic-acquisition';
import { canRerollReward, chooseRelic, prepareReward, rerollReward, roomReward } from '../src/core/expedition';
import { beginGrowthRun, defaultProfile, earnedPoints, growthGoals, growthRelicUnlocks, recordGrowth } from '../src/core/growth';
import { RELICS, RELIC_IDS } from '../src/core/relics';
import { rewardMarkup, inventoryMarkup } from '../src/game/expedition-ui';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import { buyFromShop, refreshShop } from '../src/core/shop';
import { createBoss } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import { isCurse } from '../src/core/relics';
import type { RelicId, RunState } from '../src/core/model';

function offer(roomId = 6, dice = true) {
  const s = createDungeonRun(42); beginGrowthRun(s, defaultProfile().investment, 'dice-run', false, ['R32'] as any);
  const e = s.expedition!;
  if (dice) {
    e.room = 10; const shop = currentRoom(s)!; shop.visited = shop.cleared = true; s.gold = 100; refreshShop(s);
    shop.shop!.slots[0].relic = 'R32'; if (shop.shop!.slots[1].relic === 'R32') shop.shop!.slots[1].relic = null;
    expect(buyFromShop(s, 0, shop.shop!.revision)).toBe('bought');
  }
  const room = e.dungeon!.rooms[roomId]; e.room = roomId; room.visited = room.cleared = true; s.phase = 'cleared';
  prepareReward(s); return s;
}

describe('map information and expedition-wide extra rerolls', () => {
  it('registers two relics with their grades', () => {
    expect(RELIC_IDS).toHaveLength(57); expect((RELICS as any).R31.rarity).toBe('common'); expect((RELICS as any).R32.rarity).toBe('rare');
  });
  it('hides unvisited room types until the lantern reveals only current neighbours', () => {
    const s = createDungeonRun(42,2), before = structuredClone(s); const neighbours = adjacentRooms(s).map(d => d.room.id);
    const unlit = dungeonMapMarkup(s); expect(unlit).toContain('미확인 방'); expect(unlit).toContain('>?</text>');
    grantRelic(s, 'R31' as RelicId); const lit = dungeonMapMarkup(s); expect(lit).not.toContain('>?</text>');
    expect(knownRooms(s).map(r => r.id)).toEqual(knownRooms(before).map(r => r.id));
    for (const r of s.expedition!.dungeon!.rooms) expect([r.x, r.y, r.kind, r.visited, r.cleared]).toEqual([before.expedition!.dungeon!.rooms[r.id].x, before.expedition!.dungeon!.rooms[r.id].y, before.expedition!.dungeon!.rooms[r.id].kind, before.expedition!.dungeon!.rooms[r.id].visited, before.expedition!.dungeon!.rooms[r.id].cleared]);
    const room = s.expedition!.dungeon!.rooms[neighbours[0]]; room.visited = room.cleared = true; s.expedition!.room = room.id;
    expect(dungeonMapMarkup(s)).toContain('미확인 방');
    s.expedition!.relics = []; expect(dungeonMapMarkup(s)).toContain('미확인 방');
  });
  it('unlocks the die from 24 unique actual acquisitions only on a new departure', () => {
    const p = defaultProfile(); p.relics = RELIC_IDS.filter(id => id !== ('R32' as RelicId)).slice(0, 23);
    expect(growthRelicUnlocks(p)).not.toContain('R32'); const points = earnedPoints(p);
    p.relics.push(RELIC_IDS.find(id => id !== ('R32' as RelicId) && !p.relics.includes(id))!);
    expect(growthGoals(p).find(g => g.id === 'G07')).toMatchObject({ count: 24, target: 24 }); expect(earnedPoints(p)).toBe(points + 5);
    expect(growthRelicUnlocks(p)).toContain('R32');
    const old = createDungeonRun(42); beginGrowthRun(old, p.investment, 'old'); expect(canAcquireRelic(old, 'R32' as RelicId)).toBe(false);
    const next = createDungeonRun(42); beginGrowthRun(next, p.investment, 'next', false, growthRelicUnlocks(p)); expect(canAcquireRelic(next, 'R32' as RelicId)).toBe(true);
    old.expedition!.acquired = p.relics; const recorded = recordGrowth(defaultProfile(), old); expect(recordGrowth(recorded, old)).toEqual(recorded);
  });
  it('uses the free chest refresh first, then spends exactly two extra uses', () => {
    const s = offer(); const before = { gold: s.gold, tick: s.tick, acquired: [...s.expedition!.acquired] };
    expect((s as any).diceRerolls).toBe(2); expect(rerollReward(s)).toBe(true); expect((s as any).diceRerolls).toBe(2);
    for (const remaining of [1, 0]) { const old = [...roomReward(s)!.candidates]; expect(rerollReward(s)).toBe(true); expect((s as any).diceRerolls).toBe(remaining); expect(roomReward(s)!.candidates).not.toEqual(old); }
    expect((roomReward(s) as any).diceRerolls).toBe(2); expect(canRerollReward(s)).toBe(false);
    expect({ gold: s.gold, tick: s.tick, acquired: s.expedition!.acquired }).toEqual(before); expect(validRun(s)).toBe(true);
    const end = structuredClone(s); expect(rerollReward(s)).toBe(false); expect(s).toEqual(end);
  });
  it('shares the two charges between different chests while each chest retains its free refresh', () => {
    const s = offer(); rerollReward(s); rerollReward(s); chooseRelic(s, roomReward(s)!.candidates[0]);
    s.expedition!.room = 7; currentRoom(s)!.visited = currentRoom(s)!.cleared = true; s.phase = 'cleared'; prepareReward(s);
    expect(rerollReward(s)).toBe(true); expect((s as any).diceRerolls).toBe(1);
    expect(rerollReward(s)).toBe(true); expect((s as any).diceRerolls).toBe(0);
    expect(validRun(s)).toBe(true);
  });
  it('does not spend randomness or charges when no alternative candidates exist or at an altar', () => {
    const s = offer(), reward = roomReward(s)!; reward.rerolled = true;
    s.expedition!.acquired = RELIC_IDS.filter(id => !reward.candidates.includes(id));
    const before = structuredClone(s); expect(rerollReward(s)).toBe(false); expect(s).toEqual(before);
    const altar = offer(9), altarBefore = structuredClone(altar); expect(rerollReward(altar)).toBe(false); expect(altar).toEqual(altarBefore);
  });
  it('preserves charges after loss but disables the die and prevents re-acquisition', () => {
    const s = offer(); rerollReward(s); s.expedition!.relics = [];
    expect(canRerollReward(s)).toBe(false); expect(canAcquireRelic(s, 'R32' as RelicId)).toBe(false); expect((s as any).diceRerolls).toBe(2);
  });
  it('shows the free refresh priority and remaining die uses in reward and inventory panels', () => {
    const s = offer(); expect(rewardMarkup(s)).toContain('무료 1회'); expect(rewardMarkup(s)).toContain('주사위 2회');
    rerollReward(s); expect(rewardMarkup(s)).toContain('새로고침 · 주사위 2회'); expect(inventoryMarkup(s)).toContain('추가 새로고침 2/2회');
  });
  it('keeps old snapshots without die fields valid', () => { expect(validRun(createRun(42))).toBe(true); expect(validRun(createDungeonRun(42))).toBe(true); });
  it('carries charges and spent reward records across all three regions without resetting them', () => {
    const s = offer(); rerollReward(s); rerollReward(s); chooseRelic(s, roomReward(s)!.candidates[0]);
    for (const region of [2, 3]) {
      s.expedition!.room = 8; const boss = currentRoom(s)!; boss.visited = boss.cleared = true;
      s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared';
      expect(enterNextRegion(s)).toBe(true); expect(s.expedition!.region).toBe(region); expect(s.diceRerolls).toBe(region === 2 ? 1 : 0); expect(validRun(s)).toBe(true);
      s.expedition!.room = 6; const room = currentRoom(s)!; room.visited = room.cleared = true; s.phase = 'cleared'; prepareReward(s);
      expect(rerollReward(s)).toBe(true);
      if (region === 2) { expect(rerollReward(s)).toBe(true); expect(s.diceRerolls).toBe(0); }
      else expect(rerollReward(s)).toBe(false);
      expect(validRun(s)).toBe(true); chooseRelic(s, roomReward(s)!.candidates[0]);
    }
  });
  it.each([-1, 3, .5, NaN, null, false, '2'])('rejects a corrupt remaining charge count %s', value => {
    const s = offer(); (s as any).diceRerolls = value; expect(validRun(s)).toBe(false);
  });
  it('rejects charges without acquisition, use history without a free refresh and archived count mismatch', () => {
    const s = offer(); expect(validRun(s)).toBe(true); delete s.diceRerolls; expect(validRun(s)).toBe(false);
    const noDie = createDungeonRun(42); noDie.diceRerolls = 2; expect(validRun(noDie)).toBe(false);
    const paid = offer(); roomReward(paid)!.diceRerolls = 1; paid.diceRerolls = 1; expect(validRun(paid)).toBe(false);
    roomReward(paid)!.rerolled = true; expect(validRun(paid)).toBe(true);
    paid.diceRerolls = 2; expect(validRun(paid)).toBe(false); paid.diceRerolls = 1;
    for (const value of [0, -1, 3, .5, null, false, '1']) { (roomReward(paid) as any).diceRerolls = value; expect(validRun(paid)).toBe(false); }
    const altar = offer(9); roomReward(altar)!.rerolled = true; roomReward(altar)!.diceRerolls = 1; altar.diceRerolls = 1; expect(validRun(altar)).toBe(false);
  });
  it('round-trips the candidate list, charge source and RNG and resumes the same last reroll', async () => {
    const name = 'die-progress-save', store = new SaveStore(name); await store.load(); const p = defaultProfile();
    p.relics = RELIC_IDS.filter(id => id !== 'R32').slice(0, 24);
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(name, 1); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite'); tx.objectStore('save').put({ schema: 1, content: 'prototype-0.13', revision: 0, savedAt: '2026-10-06', run: null, settings: defaultSettings(), profile: p }, 'current'); tx.oncomplete = () => resolve(); }); db.close(); await store.load();
    const s = offer(); rerollReward(s); rerollReward(s); await store.save(s, defaultSettings()); const restored = (await store.load())!.run!;
    expect(restored).toEqual(s); expect(rerollReward(restored)).toBe(true); expect(rerollReward(s)).toBe(true); expect(restored).toEqual(s);
    await store.save(restored, defaultSettings()); expect((await store.load())!.run!.diceRerolls).toBe(0);
  });
  it('keeps legacy non-maze rewards eligible for the die after the free refresh', () => {
    const s = createRun(42); beginGrowthRun(s, defaultProfile().investment, 'legacy-die', false, ['R32']);
    s.phase = 'cleared'; grantRelic(s, 'R32'); prepareReward(s);
    expect(rerollReward(s)).toBe(true); expect(rerollReward(s)).toBe(true); expect(s.diceRerolls).toBe(1); expect(validRun(s)).toBe(true);
  });
  it('makes both additions reachable from actual chest, refresh and shop pools only with the correct gate', () => {
    const seen = [new Set<RelicId>(), new Set<RelicId>(), new Set<RelicId>()];
    for (let i = 1; i <= 500; i++) {
      const seed = Math.imul(i, 0x9e3779b9) >>> 0, s = createDungeonRun(seed); beginGrowthRun(s, defaultProfile().investment, `pool-${seed}`, false, ['R32']);
      s.expedition!.room = 6; const room = currentRoom(s)!; room.visited = room.cleared = true; s.phase = 'cleared'; prepareReward(s);
      roomReward(s)!.candidates.forEach(id => seen[0].add(id)); rerollReward(s); roomReward(s)!.candidates.forEach(id => seen[1].add(id));
      expect(chooseRelic(s, roomReward(s)!.candidates[0])).toBe(true); expect(validRun(s)).toBe(true);
      const shop = createDungeonRun(seed); beginGrowthRun(shop, defaultProfile().investment, `shop-${seed}`, false, ['R32']);
      shop.expedition!.room = 10; const node = currentRoom(shop)!; node.visited = node.cleared = true; shop.gold = 100; refreshShop(shop);
      node.shop!.slots.forEach(slot => { if (slot.relic) seen[2].add(slot.relic); });
      expect(buyFromShop(shop, 0, node.shop!.revision)).toBe('bought'); expect(validRun(shop)).toBe(true);
      const locked = createDungeonRun(seed); locked.expedition!.room = 6; const chest = currentRoom(locked)!; chest.visited = chest.cleared = true; locked.phase = 'cleared'; prepareReward(locked);
      expect(roomReward(locked)!.candidates).not.toContain('R32'); expect(roomReward(locked)!.candidates.some(isCurse)).toBe(false);
    }
    for (const id of ['R31', 'R32'] as RelicId[]) for (const pool of seen) expect(pool.has(id)).toBe(true);
  });
});
