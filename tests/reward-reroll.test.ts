import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDungeonRun } from '../src/core/simulation';
import { canRerollReward, chooseRelic, prepareReward, rerollReward, roomReward } from '../src/core/expedition';
import { RELIC_IDS, isCurse } from '../src/core/relics';
import { defaultSettings, SaveStore, validRun } from '../src/persistence/save';

function offer(roomId = 6) {
  const s = createDungeonRun(42); s.expedition!.room = roomId;
  const room = s.expedition!.dungeon!.rooms[roomId]; room.visited = room.cleared = true;
  s.phase = 'cleared'; prepareReward(s); return s;
}
describe('one free reroll per treasure chest', () => {
  it('replaces three candidates without charging gold, advancing time or granting a relic', () => {
    const s = offer(), before = structuredClone(s), old = roomReward(s)!.candidates;
    expect(canRerollReward(s)).toBe(true); expect(rerollReward(s)).toBe(true);
    const reward = roomReward(s)!;
    expect(reward.candidates).toHaveLength(3); expect(new Set(reward.candidates).size).toBe(3);
    expect(reward.candidates.every(id => !old.includes(id))).toBe(true);
    expect(reward.candidates).not.toContain('R11'); expect(reward.candidates).not.toContain('R12');
    expect(reward.candidates.some(isCurse)).toBe(false);
    expect(reward.rerolled).toBe(true); expect(reward.choice).toBeNull();
    expect(s.gold).toBe(before.gold); expect(s.tick).toBe(before.tick); expect(s.player).toEqual(before.player);
    expect(s.expedition!.acquired).toEqual([]); expect(s.rng).not.toBe(before.rng);
    expect(validRun(s)).toBe(true);
  });
  it('rejects a second click without changing the offer or random state', () => {
    const s = offer(); expect(rerollReward(s)).toBe(true); const before = structuredClone(s);
    expect(canRerollReward(s)).toBe(false); expect(rerollReward(s)).toBe(false); expect(s).toEqual(before);
  });
  it('gives the other chest its own use and makes new choices immediately selectable', () => {
    const s = offer(); rerollReward(s); const id = roomReward(s)!.candidates[0];
    expect(chooseRelic(s, id)).toBe(true); expect(s.phase).toBe('explore');
    s.expedition!.room = 7; const next = s.expedition!.dungeon!.rooms[7]; next.visited = next.cleared = true;
    s.phase = 'cleared'; prepareReward(s); expect(rerollReward(s)).toBe(true);
    expect(roomReward(s)!.candidates).not.toContain(id);
  });
  it('prioritizes a remaining new item, then fills from old eligible choices without duplicates', () => {
    const s = offer(), old = [...roomReward(s)!.candidates];
    const fresh = RELIC_IDS.find(id => !isCurse(id) && !['R11', 'R12'].includes(id) && !old.includes(id))!;
    s.expedition!.acquired = RELIC_IDS.filter(id => !old.includes(id) && id !== fresh);
    expect(rerollReward(s)).toBe(true); expect(roomReward(s)!.candidates).toContain(fresh);
    expect(roomReward(s)!.candidates).toHaveLength(3); expect(new Set(roomReward(s)!.candidates).size).toBe(3);
  });
  it('does not spend a use or randomness when there are no different eligible items', () => {
    const s = offer(), old = roomReward(s)!.candidates;
    s.expedition!.acquired = RELIC_IDS.filter(id => !old.includes(id)); const before = structuredClone(s);
    expect(canRerollReward(s)).toBe(false); expect(rerollReward(s)).toBe(false); expect(s).toEqual(before);
  });
  it('rejects unopened, chosen, skipped, non-reward phases and fixed altar offers', () => {
    const unopened = createDungeonRun(42), chosen = offer(), skipped = offer(), wrongPhase = offer(), wrongRoom = offer(), altar = offer(9);
    chooseRelic(chosen, roomReward(chosen)!.candidates[0]); chooseRelic(skipped, 'skip');
    wrongPhase.phase = 'explore'; roomReward(wrongRoom)!.room = 7;
    for (const s of [unopened, chosen, skipped, wrongPhase, wrongRoom, altar]) {
      const before = structuredClone(s); expect(rerollReward(s)).toBe(false); expect(s).toEqual(before);
    }
  });
  it('restores candidates and the spent use through an atomic save, then permits selection', async () => {
    const s = offer(), store = new SaveStore('reward-reroll-persistence'); await store.load();
    expect(rerollReward(s)).toBe(true); await store.save(s, defaultSettings()); const restored = (await store.load())!.run!;
    expect(restored).toEqual(s); expect(rerollReward(restored)).toBe(false);
    expect(chooseRelic(restored, roomReward(restored)!.candidates[0])).toBe(true); expect(validRun(restored)).toBe(true);
  });
  it('keeps old snapshots usable and produces the same reroll after restoring the same seed', () => {
    const s = offer(), restored = structuredClone(s); expect(validRun(s)).toBe(true);
    expect(roomReward(s)!.rerolled).toBeUndefined(); expect(rerollReward(s)).toBe(true); expect(rerollReward(restored)).toBe(true);
    expect(restored).toEqual(s);
  });
  it('rejects corrupted use flags and rerolled fixed altar offers', () => {
    for (const value of [false, 0, 2, 'true', null]) {
      const s = offer(); (roomReward(s)! as any).rerolled = value; expect(validRun(s)).toBe(false);
    }
    const altar = offer(9); roomReward(altar)!.rerolled = true; expect(validRun(altar)).toBe(false);
  });
});
