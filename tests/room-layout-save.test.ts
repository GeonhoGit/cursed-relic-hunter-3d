import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { adjacentRooms, currentRoom } from '../src/core/dungeon';
import { roomLayout } from '../src/core/room-layout';
import { PILLARS } from '../src/core/model';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';

function encounter(template: number) {
  const s = createDungeonRun(42);
  travel(s, adjacentRooms(s).find(d => d.room.kind === 'combat')!.direction);
  currentRoom(s)!.template = template; s.phase = 'combat';
  delete currentRoom(s)!.structure; // Explicit pre-structure save fixture.
  return s;
}

describe('room layout saves', () => {
  it.each([0, 1, 2])('restores layout %s and the same future', async template => {
    const s = encounter(template), store = new SaveStore(`layout-${template}`); await store.load();
    const record = await store.save(s, defaultSettings()); expect(record.content).toBe('prototype-0.16');
    const restored = (await store.load())!.run!; expect(restored).toEqual(s);
    expect(roomLayout(restored).id).toBe(template);
    for (let t = 0; t < 120; t++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
  });

  it('loads a pre-0.13 maze without moving its terrain or opting it into new layouts on save', async () => {
    const s = encounter(1); delete s.expedition!.dungeon!.layoutVersion;
    const store = new SaveStore('legacy-layout'); await store.load(); const record = await store.save(s, defaultSettings());
    const legacy = { ...record, content: 'prototype-0.12' };
    const db = await new Promise<IDBDatabase>(resolve => { const q = indexedDB.open('legacy-layout', 1); q.onsuccess = () => resolve(q.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite'); tx.objectStore('save').put(legacy, 'current'); tx.oncomplete = () => resolve(); });
    expect(await store.load()).toEqual(legacy); db.close();
    const restored = (await store.load())!.run!; expect(roomLayout(restored).obstacles).toEqual(PILLARS);
    expect((await store.save(restored, defaultSettings())).run).toEqual(s);
  });

  it('validates placed bombs against the saved room layout', () => {
    const s = encounter(1), treasure = s.expedition!.dungeon!.rooms[6];
    treasure.visited = treasure.cleared = true; treasure.reward = { room: 6, candidates: ['R13'], choice: 'R13' };
    s.expedition!.relics = ['R13']; s.expedition!.acquired = ['R13']; s.player.auxCooldown = 480;
    s.bombs = [{ id: s.nextId++, x: 220, y: 230, ticks: 60 }];
    expect(validRun(s)).toBe(true);
    Object.assign(s.bombs[0], { x: 200, y: 120 }); expect(validRun(s)).toBe(false);
  });

  it('rejects unknown layout versions', () => {
    const s = encounter(1); Object.assign(s.expedition!.dungeon!, { layoutVersion: 2 });
    expect(validRun(s)).toBe(false);
  });
});
