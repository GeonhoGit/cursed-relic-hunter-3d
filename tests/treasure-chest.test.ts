import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDungeonRun, travel } from '../src/core/simulation';
import { adjacentRooms, currentRoom } from '../src/core/dungeon';
import { canOpenTreasure, chooseRelic, openTreasure, roomReward } from '../src/core/expedition';
import { defaultSettings, SaveStore, validRun } from '../src/persistence/save';

function treasure() {
  const s = createDungeonRun(42), door = adjacentRooms(s).find(d => d.room.kind === 'treasure')!;
  expect(travel(s, door.direction)).toBe(true); return s;
}
function approach(s: ReturnType<typeof treasure>) { s.player.x = 320; s.player.y = 215; }

describe('treasure chest interaction', () => {
  it('enters without an offer and can leave and revisit the unopened chest', () => {
    const s = treasure(), id = currentRoom(s)!.id;
    expect(s.phase).toBe('explore'); expect(roomReward(s)).toBeNull(); expect(validRun(s)).toBe(true);
    expect(chooseRelic(s, 'skip')).toBe(false);
    expect(travel(s, adjacentRooms(s)[0].direction)).toBe(true);
    expect(travel(s, adjacentRooms(s).find(d => d.room.id === id)!.direction)).toBe(true);
    expect(s.phase).toBe('explore'); expect(roomReward(s)).toBeNull();
  });
  it('only opens near the chest and keeps its offer fixed until selection', () => {
    const s = treasure(), before = structuredClone(s);
    expect(canOpenTreasure(s)).toBe(false); expect(openTreasure(s)).toBe(false); expect(s).toEqual(before);
    approach(s); expect(canOpenTreasure(s)).toBe(true); expect(openTreasure(s)).toBe(true);
    expect(s.phase).toBe('cleared'); const offer = structuredClone(roomReward(s)!);
    expect(offer.candidates).toHaveLength(3); expect(validRun(s)).toBe(true);
    expect(openTreasure(s)).toBe(false); expect(roomReward(s)).toEqual(offer);
    expect(travel(s, adjacentRooms(s)[0].direction)).toBe(false);
    expect(chooseRelic(s, offer.candidates[0])).toBe(true); expect(s.phase).toBe('explore');
    expect(openTreasure(s)).toBe(false); expect(s.expedition!.acquired).toEqual([offer.candidates[0]]);
  });
  it('preserves unopened, opened and claimed chests across saves', async () => {
    const s = treasure(), store = new SaveStore('treasure-chest'); await store.load();
    await store.save(s, defaultSettings()); let restored = (await store.load())!.run!;
    expect(restored.phase).toBe('explore'); expect(roomReward(restored)).toBeNull();
    approach(restored); expect(openTreasure(restored)).toBe(true);
    await store.save(restored, defaultSettings()); const offer = structuredClone(roomReward(restored));
    restored = (await store.load())!.run!; expect(restored.phase).toBe('cleared'); expect(roomReward(restored)).toEqual(offer);
    expect(chooseRelic(restored, 'skip')).toBe(true); await store.save(restored, defaultSettings());
    restored = (await store.load())!.run!; expect(roomReward(restored)!.choice).toBe('skip'); expect(openTreasure(restored)).toBe(false);
  });
  it('does not open outside a treasure room or during combat preparation', () => {
    const s = createDungeonRun(42); approach(s); expect(openTreasure(s)).toBe(false);
    const chest = treasure(); approach(chest); chest.phase = 'ready'; expect(openTreasure(chest)).toBe(false);
  });
});
